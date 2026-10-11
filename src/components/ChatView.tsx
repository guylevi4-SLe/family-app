import { useEffect, useRef, useState } from 'react';
import { addComment, CHAT_ID, deleteComment, type Comment, type TargetType } from '../data/comments';
import { addItems, parseItems, type Item } from '../data/items';
import { addTask, type Task } from '../data/tasks';
import { dayLabel, saveEvent, type FamilyEvent } from '../data/events';
import { addEntries, createList, deleteList, type FamilyList, type ListEntry } from '../data/lists';
import { COMMANDS, findList, parseCommand, parseWhen, splitListCommand, suggestCommands } from '../data/commands';
import { useOverrides } from '../data/hooks';
import type { Screen } from './Home';
import { byTime, CommentBubble, Composer, PhotoViewer } from './CommentsSheet';
import { useFamily } from './FamilyContext';

const KIND: Record<Exclude<TargetType, 'chat'>, string> = { item: '🛒', task: '✅', event: '📅' };

/**
 * One family conversation. Chat messages show as bubbles; comments written on a
 * product, task or event show as a short line that opens that item.
 */
export function ChatView({
  comments,
  items,
  tasks,
  events,
  lists,
  listEntries,
  go,
  openList,
}: {
  comments: Comment[] | undefined;
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
  lists: FamilyList[] | undefined;
  listEntries: ListEntry[] | undefined;
  go: (s: Screen) => void;
  openList: (id: string) => void;
}) {
  const { familyId, members, openComments } = useFamily();
  const overrides = useOverrides(familyId);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = [...(comments ?? [])].sort(byTime);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [list.length]);

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
      const parsed = parseItems(cmd.body);
      if (!parsed.length) return fail('לא זיהיתי מוצרים.');
      addItems(familyId, parsed, new Map((items ?? []).map((i) => [i.id, i])), overrides);
      say(`🛒 לקניות: ${parsed.map((p) => (p.qty ? `${p.name} (${p.qty})` : p.name)).join(', ')}`);
      setNotice({ ok: true, text: parsed.length === 1 ? `נוסף לקניות: ${parsed[0].name}` : `נוספו ${parsed.length} מוצרים לקניות`, open: () => go('list') });
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
    const existing = findList(lists ?? [], parts.listName);
    const listId = existing?.id ?? createList(familyId, parts.listName, '📋');
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
              deleteComment(familyId, line);
              setNotice({ ok: true, text: `הרשימה "${title}" בוטלה` });
            },
          },
    );
    return 'done';
  };

  return (
    <main className="list-page chat-page">
      <div className="comments chat">
        {comments === undefined && <p className="muted">טוען…</p>}
        {comments?.length === 0 && <p className="muted">עדיין אין הודעות. כתבו משהו למשפחה!</p>}
        {list.map((c) => {
          if (c.targetType === 'chat') return <CommentBubble key={c.id} c={c} onPhoto={setViewing} />;
          const title = titleOf(c);
          return (
            <button key={c.id} type="button" className="chat-ref" onClick={() => openComments(c.targetType, c.targetId, title)}>
              <span aria-hidden="true">{KIND[c.targetType]}</span>
              <span>
                <strong>{c.authorName}</strong> על <strong>{title || 'פריט שנמחק'}</strong>: {c.text || '📷 תמונה'}
              </span>
            </button>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat-compose">
        {notice && (
          <div className={notice.ok ? 'command-notice' : 'command-notice error'} role="status">
            <span>
              {notice.ok ? '✓ ' : ''}
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
              ✕
            </button>
          </div>
        )}
        <Composer
          type="chat"
          targetId={CHAT_ID}
          placeholder="הודעה, או @ לפקודה…"
          label="כתיבת הודעה"
          notifyLabel="הודעה ל"
          onCommand={runCommand}
          hints={(t) => suggestCommands(t).map((c) => ({ label: `@${c.key} ${c.emoji} ${c.label}`, insert: `@${c.key} ` }))}
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
