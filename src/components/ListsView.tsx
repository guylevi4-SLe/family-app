import { useRef, useState } from 'react';
import {
  LIST_EMOJIS,
  LIST_IDEAS,
  addEntries,
  changeCategory,
  moveEntry,
  createList,
  deleteEntry,
  deleteList,
  renameEntry,
  resetList,
  setEntryDone,
  updateList,
  type FamilyList,
  type ListEntry,
} from '../data/lists';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

const byOrder = (a: ListEntry, b: ListEntry) => a.order - b.order;

/** The checklists screen: an index of lists, and one list with progress, ticks and reset. */
export function ListsView({
  lists,
  entries,
  openId,
  setOpenId,
}: {
  lists: FamilyList[] | undefined;
  entries: ListEntry[] | undefined;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const open = lists?.find((l) => l.id === openId);
  return (
    <main className="list-page lists-page" aria-label="רשימות">
      {open ? (
        <ListDetail list={open} entries={(entries ?? []).filter((e) => e.listId === open.id).sort(byOrder)} onBack={() => setOpenId(null)} />
      ) : (
        <ListIndex lists={lists} entries={entries ?? []} onOpen={setOpenId} />
      )}
    </main>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} מתוך ${total}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function ListIndex({
  lists,
  entries,
  onOpen,
}: {
  lists: FamilyList[] | undefined;
  entries: ListEntry[];
  onOpen: (id: string) => void;
}) {
  const { familyId } = useFamily();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📋');
  const sorted = [...(lists ?? [])].sort((a, b) => a.title.localeCompare(b.title, 'he'));

  const create = () => {
    if (!title.trim()) return;
    const id = createList(familyId, title, emoji);
    setCreating(false);
    setTitle('');
    setEmoji('📋');
    onOpen(id);
  };

  return (
    <>
      {creating ? (
        <form className="card list-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label>
            <span className="field-label">שם הרשימה</span>
            <input className="full" value={title} maxLength={60} autoFocus placeholder="למשל: ציוד לטיול" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="רעיונות">
            {LIST_IDEAS.map((i) => (
              <button key={i.title} type="button" className="chip" onClick={() => { setTitle(i.title); setEmoji(i.emoji); }}>
                {i.emoji} {i.title}
              </button>
            ))}
          </div>
          <div className="emoji-pick" role="group" aria-label="סמל">
            {LIST_EMOJIS.map((e) => (
              <button key={e} type="button" className={e === emoji ? 'on' : ''} aria-pressed={e === emoji} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="primary" disabled={!title.trim()}>יצירת הרשימה</button>
            <button type="button" onClick={() => setCreating(false)}>ביטול</button>
          </div>
        </form>
      ) : (
        <button className="primary new-list" onClick={() => setCreating(true)}>
          + רשימה חדשה
        </button>
      )}

      {lists !== undefined && sorted.length === 0 && !creating && (
        <p className="empty">עוד אין רשימות. רשימה יכולה להיות כל דבר: תיק למכון, ציוד לטיול, דברים לטיסה.</p>
      )}
      <ul className="list-cards">
        {sorted.map((l) => {
          const mine = entries.filter((e) => e.listId === l.id);
          const done = mine.filter((e) => e.done).length;
          return (
            <li key={l.id}>
              <button className="list-card" onClick={() => onOpen(l.id)}>
                <span className="list-emoji" aria-hidden="true">{l.emoji}</span>
                <span className="list-card-main">
                  <strong>{l.title}</strong>
                  <span className="muted">{mine.length === 0 ? 'ריקה' : done === mine.length ? `הכול מסומן ✓ (${done})` : `${done} מתוך ${mine.length}`}</span>
                  {mine.length > 0 && <Progress done={done} total={mine.length} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ListDetail({
  list,
  entries,
  onBack,
}: {
  list: FamilyList;
  entries: ListEntry[];
  onBack: () => void;
}) {
  const { familyId } = useFamily();
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; category: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cats = list.categories ?? [];
  const catOf = (e: ListEntry) => (e.category && cats.includes(e.category) ? e.category : '');
  const done = entries.filter((e) => e.done);
  const last = entries.reduce((m, e) => Math.max(m, e.order), 0);
  const sections = ['', ...cats]
    .map((c) => ({ name: c, rows: entries.filter((e) => catOf(e) === c) }))
    .filter((sec) => sec.name !== '' || sec.rows.length > 0);

  const add = () => {
    if (!text.trim()) return;
    addEntries(familyId, list.id, text, last, cats.includes(target) ? target : '');
    setText('');
  };
  const addTo = (c: string) => {
    setTarget(c);
    inputRef.current?.focus();
  };
  const newCategory = () => {
    const name = prompt('שם הקטגוריה (למשל: ביגוד, רחצה)')?.trim().slice(0, 40);
    if (!name) return;
    if (!cats.includes(name)) updateList(familyId, list.id, { categories: [...cats, name] });
    addTo(name);
  };
  const editCategory = (c: string) => {
    const name = prompt(`שם חדש לקטגוריה "${c}". כדי למחוק אותה, מחקו את השם`, c);
    if (name === null) return;
    const t = name.trim().slice(0, 40);
    if (!t) {
      if (confirm(`למחוק את הקטגוריה "${c}"? מה שבתוכה יישאר ברשימה, בלי קטגוריה`)) changeCategory(familyId, list, entries, c, null);
    } else if (t !== c && !cats.includes(t)) changeCategory(familyId, list, entries, c, t);
  };
  const saveEdit = () => {
    if (editing && editing.text.trim()) {
      const e = entries.find((x) => x.id === editing.id);
      if (e && editing.text.trim() !== e.text) renameEntry(familyId, e.id, editing.text);
      if (e && editing.category !== catOf(e)) moveEntry(familyId, e.id, editing.category);
    }
    setEditing(null);
  };

  const row = (e: ListEntry) =>
    editing?.id === e.id ? (
      <li key={e.id} className="entry-edit">
        <input
          aria-label="עריכת שורה"
          value={editing.text}
          maxLength={120}
          autoFocus
          onChange={(ev) => setEditing({ ...editing, text: ev.target.value })}
          onKeyDown={(ev) => ev.key === 'Enter' && saveEdit()}
        />
        {cats.length > 0 && (
          <select aria-label="קטגוריה" value={editing.category} onChange={(ev) => setEditing({ ...editing, category: ev.target.value })}>
            <option value="">בלי קטגוריה</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="entry-edit-actions">
          <button className="small primary" onClick={saveEdit}>שמירה</button>
          <button className="small" onClick={() => setEditing(null)}>ביטול</button>
          <button
            className="small danger"
            onClick={() => {
              if (confirm(`למחוק את "${e.text}" מהרשימה?`)) deleteEntry(familyId, e.id);
              setEditing(null);
            }}
          >
            מחיקה
          </button>
        </div>
      </li>
    ) : (
      <li key={e.id} className={`entry ${e.done ? 'checked' : ''}`}>
        <button className="entry-check" aria-pressed={e.done} onClick={() => setEntryDone(familyId, e.id, !e.done)}>
          <span className="box" aria-hidden="true">{e.done ? '✓' : ''}</span>
          <span className="name">{e.text}</span>
        </button>
        <button className="entry-more" aria-label={`עריכת ${e.text}`} onClick={() => setEditing({ id: e.id, text: e.text, category: catOf(e) })}>
          ✎
        </button>
      </li>
    );

  return (
    <>
      <button className="link back" onClick={onBack}>→ כל הרשימות</button>

      <div className="list-hero">
        <span className="list-emoji" aria-hidden="true">{list.emoji}</span>
        <div className="list-hero-main">
          {renaming !== null ? (
            <form
              className="list-rename"
              onSubmit={(e) => {
                e.preventDefault();
                if (renaming.trim()) updateList(familyId, list.id, { title: renaming.trim().slice(0, 60) });
                setRenaming(null);
              }}
            >
              <input aria-label="שם הרשימה" value={renaming} maxLength={60} autoFocus onChange={(e) => setRenaming(e.target.value)} />
              <button className="small primary">שמירה</button>
            </form>
          ) : (
            <h2 className="list-title">
              <button className="link-plain" aria-label="שינוי שם הרשימה" onClick={() => setRenaming(list.title)}>
                {list.title}
              </button>
            </h2>
          )}
          <p className="muted list-sum">
            {entries.length === 0 ? 'אין עדיין שורות' : done.length === entries.length ? `הכול מסומן ✓ ${entries.length} מתוך ${entries.length}` : `${done.length} מתוך ${entries.length} מסומנים`}
          </p>
          {entries.length > 0 && <Progress done={done.length} total={entries.length} />}
        </div>
      </div>

      <form className="add-box list-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input ref={inputRef} value={text} placeholder="מה להוסיף? אפשר כמה, עם פסיק" aria-label="הוספת שורות" enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
        <button className="primary add-button" aria-label="הוספה לרשימה" disabled={!text.trim()}>
          +
        </button>
      </form>
      <div className="list-target">
        {cats.length > 0 && (
          <label>
            <span className="muted">מוסיפים ל:</span>
            <select aria-label="להוסיף לקטגוריה" value={cats.includes(target) ? target : ''} onChange={(e) => setTarget(e.target.value)}>
              <option value="">בלי קטגוריה</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="link" onClick={newCategory}>+ קטגוריה</button>
      </div>

      {sections.map((sec) => {
        const todo = sec.rows.filter((e) => !e.done);
        const ticked = sec.rows.filter((e) => e.done);
        return (
          <section key={sec.name || '-'} className="list-section">
            {sec.name && (
              <div className="list-section-head">
                <h3>{sec.name}</h3>
                <span className="muted">{sec.rows.length ? `${ticked.length}/${sec.rows.length}` : ''}</span>
                <button className="link" aria-label={`הוספה ל${sec.name}`} onClick={() => addTo(sec.name)}>+</button>
                <button className="link muted" aria-label={`עריכת הקטגוריה ${sec.name}`} onClick={() => editCategory(sec.name)}>✎</button>
              </div>
            )}
            {sec.rows.length === 0 ? (
              <p className="muted list-section-empty">ריקה. לחיצה על + כדי להוסיף לכאן</p>
            ) : (
              <ul className="entries">{[...todo, ...ticked].map(row)}</ul>
            )}
          </section>
        );
      })}

      <div className="list-tools">
        <button className="whatsapp" disabled={entries.length === 0} onClick={() => shareList(list, sections)}>
          <Icon name="whatsapp" size={20} /> שליחת הרשימה לוואטסאפ
        </button>
        <button disabled={done.length === 0} onClick={() => confirm('לנקות את כל הסימונים ולהתחיל מחדש?') && resetList(familyId, entries)}>
          ↺ ניקוי סימונים
        </button>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`למחוק את הרשימה "${list.title}" וכל מה שבה?`)) {
              deleteList(familyId, list.id, entries);
              onBack();
            }
          }}
        >
          מחיקת הרשימה
        </button>
      </div>
    </>
  );
}

/** Text for WhatsApp: the title, then each section; ticked lines get ✅. */
export function listText(list: FamilyList, sections: { name: string; rows: ListEntry[] }[]) {
  const lines = [`${list.emoji} *${list.title}*`];
  for (const sec of sections) {
    if (sec.rows.length === 0) continue;
    if (sec.name) lines.push('', `*${sec.name}*`);
    for (const e of sec.rows) lines.push(`${e.done ? '✅' : '▫️'} ${e.text}`);
  }
  return lines.join('\n');
}

function shareList(list: FamilyList, sections: { name: string; rows: ListEntry[] }[]) {
  window.open(`https://wa.me/?text=${encodeURIComponent(listText(list, sections))}`, '_blank', 'noopener');
}
