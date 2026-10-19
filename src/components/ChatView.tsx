import { useEffect, useRef, useState } from 'react';
import { addComment, CHAT_ID, deleteComment, type Comment, type TargetType } from '../data/comments';
import { addItems, parseItems, qtyLabel, updateItem, type Item } from '../data/items';
import { addTask, updateTask, type Task } from '../data/tasks';
import { dayLabel, saveEvent, type FamilyEvent } from '../data/events';
import { addEntries, createList, deleteEntry, deleteList, restoreEntry, type FamilyList, type ListEntry } from '../data/lists';
import { autoCompleteTag, firstName } from '../data/mentions';
import { COMMANDS, findByName, findList, splitRemovals, parseCommand, parseWhen, splitListCommand, suggestCommands } from '../data/commands';
import { useOverrides } from '../data/hooks';
import type { Screen } from './Home';
import { byTime, CommentBubble, Composer, PhotoViewer } from './CommentsSheet';
import { useFamily } from './FamilyContext';
import { Calendar, Camera, Check, ClipboardList, ListChecks, ShoppingCart, X, type LucideIcon } from 'lucide-react';
import { InlineIcon } from './ChatIcons';

const KIND: Record<Exclude<TargetType, 'chat'>, LucideIcon> = { item: ShoppingCart, task: ListChecks, event: Calendar };
const COMMAND_ICON: Record<string, LucideIcon> = { shop: ShoppingCart, task: ListChecks, event: Calendar, list: ClipboardList };

/**
 * One family conversation. Chat messages show as bubbles; comments written on a
 * product, task or event show as a short line that opens that item.
 */
export function ChatView({
  comments,
  hasOlder,
  showOlder,
  items,
  tasks,
  events,
  lists,
  listEntries,
  go,
  openList,
}: {
  comments: Comment[] | undefined;
  hasOlder: boolean;
  showOlder: () => void;
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
  lists: FamilyList[] | undefined;
  listEntries: ListEntry[] | undefined;
  go: (s: Screen) => void;
  openList: (id: string) => void;
}) {
  const { familyId, me, members, openComments } = useFamily();
  const overrides = useOverrides(familyId);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Lists made or cancelled here a moment ago, before the lists listener catches up.
  const made = useRef<{ id: string; title: string }[]>([]);
  const cancelled = useRef(new Set<string>());
  const list = [...(comments ?? [])].sort(byTime);

  // Follow new messages, but stay in place when older ones are loaded above.
  const newest = list.length ? list[list.length - 1].id : '';
  // To the page's real end: the fixed compose box and bottom bar cover the last
  // stretch of the screen, so lining the last message up with it hides it.
  useEffect(() => {
    if (newest) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [newest]);
  // Photos load after that first scroll and push the last messages down, so for a few
  // seconds after opening keep going back to the end whenever the chat grows, until
  // the reader touches or scrolls the page themselves.
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const follow = new ResizeObserver(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    follow.observe(el);
    const events = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      follow.disconnect();
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
    const timer = window.setTimeout(stop, 5000);
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    return stop;
  }, []);

  const titleOf = (c: Comment) => {
    const rows: { id: string; name?: string; title?: string }[] =
      (c.targetType === 'item' ? items : c.targetType === 'task' ? tasks : events) ?? [];
    const t = rows.find((r) => r.id === c.targetId);
    return t?.name ?? t?.title ?? (c.targetType === 'item' ? c.targetId : '');
  };

  /** Runs "@ק …", "@מ …", "@י …" or "@ר …"; the family sees what was added as a chat line. */
  const runCommand = (text: string): 'done' | 'keep' | null => {
    const cmd = parseCommand(text);
    if (!cmd) return null;
    const help = COMMANDS.find((c) => c.kind === cmd.kind)!;
    const fail = (message: string) => {
      setNotice({ ok: false, text: `${message} למשל: @${help.key} ${help.example}` });
      return 'keep' as const;
    };
    const say = (line: string) => addComment(familyId, 'chat', CHAT_ID, line);
    const firstName = (uid: string) => members.find((m) => m.id === uid)?.displayName.split(' ')[0] ?? '';

    if (cmd.kind === 'shop') {
      const { add, remove } = splitRemovals(cmd.body);
      const parsed = parseItems(add);
      if (!parsed.length && !remove.length) return fail('לא זיהיתי מוצרים.');
      const onList = (items ?? []).filter((i) => !i.checked && !i.deleted);
      const { found, missing } = pick(remove, onList, (i) => i.name);
      if (!parsed.length && !found.length) return fail(`${missing.join(', ')} לא ברשימת הקניות.`);
      if (parsed.length) addItems(familyId, parsed, new Map((items ?? []).map((i) => [i.id, i])), overrides);
      for (const i of found) updateItem(familyId, i.id, { deleted: true });
      const line = say(
        [
          parsed.length && `🛒 לקניות: ${parsed.map((p) => (p.qty ? `${p.name} (${qtyLabel(p.qty)})` : p.name)).join(', ')}`,
          found.length && `🗑️ הוסר מהקניות: ${found.map((i) => i.name).join(', ')}`,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      const text = [
        parsed.length === 1 ? `נוסף לקניות: ${parsed[0].name}` : parsed.length ? `נוספו ${parsed.length} מוצרים לקניות` : '',
        found.length ? `הוסר: ${found.map((i) => i.name).join(', ')}` : '',
        missing.length ? `לא נמצא ברשימה: ${missing.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      setNotice({
        ok: true,
        text,
        open: () => go('list'),
        // Undo is offered when the command only removed, so it never half-reverts a mix.
        undo:
          found.length && !parsed.length
            ? () => {
                for (const i of found) updateItem(familyId, i.id, { deleted: false });
                deleteComment(familyId, line);
                setNotice({ ok: true, text: `הוחזר לקניות: ${found.map((i) => i.name).join(', ')}` });
              }
            : undefined,
      });
      return 'done';
    }

    if (cmd.kind === 'task' && /^[-−–]/.test(cmd.body)) {
      const { remove } = splitRemovals(cmd.body);
      const open = (tasks ?? []).filter((t) => !t.done && !t.deleted);
      const { found, missing } = pick(remove, open, (t) => t.title);
      if (!found.length) return fail(`לא מצאתי משימה פתוחה בשם ${missing.join(', ')}.`);
      for (const t of found) updateTask(familyId, t.id, { done: true });
      const names = found.map((t) => t.title).join(', ');
      const line = say(`☑️ בוצע: ${names}`);
      setNotice({
        ok: true,
        text: `סומן כבוצע: ${names}${missing.length ? ` · לא נמצא: ${missing.join(', ')}` : ''}`,
        open: () => go('tasks'),
        undo: () => {
          for (const t of found) updateTask(familyId, t.id, { done: false });
          deleteComment(familyId, line);
          setNotice({ ok: true, text: `המשימה חזרה לפתוחות: ${names}` });
        },
      });
      return 'done';
    }

    if (cmd.kind === 'task') {
      const w = parseWhen(cmd.body, new Date(), members, true);
      if (!w.title) return fail('חסר מה צריך לעשות.');
      const who = w.people[0] ?? null;
      addTask(familyId, w.title, who, w.date);
      const extra = [who && firstName(who), w.date && dayLabel(w.date)].filter(Boolean).join(' · ');
      say(`✅ משימה: ${w.title}${extra ? ` · ${extra}` : ''}`);
      setNotice({ ok: true, text: `נוספה משימה: ${w.title}`, open: () => go('tasks') });
      return 'done';
    }

    if (cmd.kind === 'event') {
      const w = parseWhen(cmd.body, new Date(), members, false);
      if (!w.title) return fail('חסר שם לאירוע.');
      if (!w.date) return fail('חסר יום או תאריך.');
      saveEvent(familyId, null, {
        title: w.title,
        date: w.date,
        time: w.time,
        location: '',
        people: w.people,
        endDate: '',
        endTime: '',
        repeat: w.weekly ? 'weekly' : '',
        repeatUntil: '',
      });
      const when = `${dayLabel(w.date)}${w.time ? ` · ${w.time}` : ''}${w.weekly ? ' · כל שבוע' : ''}`;
      say(`📅 ליומן: ${w.title} · ${when}`);
      setNotice({ ok: true, text: `נקבע ביומן: ${w.title}, ${when}`, open: () => go('calendar') });
      return 'done';
    }

    const parts = splitListCommand(cmd.body);
    if (!parts) return fail('כותבים את שם הרשימה, נקודתיים, ואז הפריטים.');
    const known = [...(lists ?? []), ...made.current.filter((m) => !lists?.some((l) => l.id === m.id))].filter(
      (l) => !(l as Partial<FamilyList>).kind && !cancelled.current.has(l.id),
    );
    const existing = findList(known, parts.listName);
    const { add, remove } = splitRemovals(parts.items);
    if (remove.length) {
      if (!existing) return fail(`לא מצאתי רשימה בשם "${parts.listName}".`);
      const inList = (listEntries ?? []).filter((e) => e.listId === existing.id);
      const { found, missing } = pick(remove, inList, (e) => e.text);
      if (!found.length) return fail(`${missing.join(', ')} לא ברשימה "${existing.title}".`);
      for (const e of found) deleteEntry(familyId, e.id);
      const last = Math.max(0, ...inList.map((e) => e.order));
      const added = add ? addEntries(familyId, existing.id, add, last) : [];
      const names = found.map((e) => e.text).join(', ');
      const line = say(
        `📋 "${existing.title}": ${[add && `נוסף ${add}`, `הוסר ${names}`].filter(Boolean).join(' · ')}`,
      );
      setNotice({
        ok: true,
        text: [added.length && `נוספו ${added.length}`, `הוסר מ"${existing.title}": ${names}`, missing.length && `לא נמצא: ${missing.join(', ')}`]
          .filter(Boolean)
          .join(' · '),
        open: () => openList(existing.id),
        undo: added.length
          ? undefined
          : () => {
              for (const e of found) restoreEntry(familyId, e);
              deleteComment(familyId, line);
              setNotice({ ok: true, text: `הוחזר ל"${existing.title}": ${names}` });
            },
      });
      return 'done';
    }
    const listId = existing?.id ?? createList(familyId, parts.listName, 'i:clipboard');
    if (!existing) made.current.push({ id: listId, title: parts.listName });
    const last = Math.max(0, ...(listEntries ?? []).filter((e) => e.listId === listId).map((e) => e.order));
    const ids = addEntries(familyId, listId, parts.items, last);
    const title = existing?.title ?? parts.listName;
    const line = say(`📋 לרשימה "${title}": ${parts.items.split(/[\n,]/).map((t) => t.trim()).filter(Boolean).join(', ')}`);
    setNotice(
      existing
        ? { ok: true, text: ids.length === 1 ? `נוסף ל"${title}": ${parts.items.trim()}` : `נוספו ${ids.length} פריטים ל"${title}"`, open: () => openList(listId) }
        : {
            ok: true,
            text: `נוצרה רשימה חדשה "${title}" עם ${ids.length} פריטים`,
            open: () => openList(listId),
            undo: () => {
              deleteList(familyId, listId, ids.map((id) => ({ id })));
              cancelled.current.add(listId);
              deleteComment(familyId, line);
              setNotice({ ok: true, text: `הרשימה "${title}" בוטלה` });
            },
          },
    );
    return 'done';
  };

  return (
    <main className="list-page chat-page">
      <div ref={chatRef} className="comments chat">
        {comments === undefined && <p className="muted">טוען…</p>}
        {comments?.length === 0 && <p className="muted">עדיין אין הודעות. כתבו משהו למשפחה!</p>}
        {hasOlder && (
          <button type="button" className="link older" onClick={showOlder}>
            הודעות קודמות
          </button>
        )}
        {list.map((c) => {
          if (c.targetType === 'chat') return <CommentBubble key={c.id} c={c} onPhoto={setViewing} />;
          const title = titleOf(c);
          return (
            <button key={c.id} type="button" className="chat-ref" onClick={() => openComments(c.targetType, c.targetId, title)}>
              <InlineIcon icon={KIND[c.targetType]} />
              <span>
                <strong>{c.authorName}</strong> על <strong>{title || 'פריט שנמחק'}</strong>: {c.text || (
                  <>
                    <InlineIcon icon={Camera} size={14} /> תמונה
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="chat-compose">
        {notice && (
          <div className={notice.ok ? 'command-notice' : 'command-notice error'} role="status">
            <span>
              {notice.ok && <InlineIcon icon={Check} />}
              {notice.text}
            </span>
            {notice.undo && (
              <button type="button" className="link" onClick={notice.undo}>
                ביטול
              </button>
            )}
            {notice.open && (
              <button type="button" className="link" onClick={notice.open}>
                פתיחה
              </button>
            )}
            <button type="button" className="link close" aria-label="סגירת ההודעה" onClick={() => setNotice(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <Composer
          type="chat"
          targetId={CHAT_ID}
          placeholder="הודעה, @ לפקודה או לתיוג…"
          label="כתיבת הודעה"
          tagging
          onCommand={runCommand}
          hints={(t) => suggestCommands(t).map((c) => ({ label: (
              <>
                @{c.key} <InlineIcon icon={COMMAND_ICON[c.kind]} size={15} /> {c.word}
              </>
            ), insert: `@${c.word}: ` }))}
          // "@רש" grows into "@רשימה: " and "@ש" into "@שגב ", whenever only one thing fits.
          autoComplete={(t) => autoCompleteTag(t, (members ?? []).filter((m) => m.id !== me.id).map(firstName), COMMANDS.map((c) => c.word))}
        />
      </div>
      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}

interface Notice {
  ok: boolean;
  text: string;
  open?: () => void;
  undo?: () => void;
}

/** The rows named in `names`, and the names that matched nothing. */
function pick<T>(names: string[], rows: T[], nameOf: (r: T) => string) {
  const found: T[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const r = findByName(rows, n, nameOf);
    if (r && !found.includes(r)) found.push(r);
    else if (!r) missing.push(n);
  }
  return { found, missing };
}
