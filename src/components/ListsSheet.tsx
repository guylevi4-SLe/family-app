import { useState } from 'react';
import {
  LIST_EMOJIS,
  LIST_IDEAS,
  addEntries,
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

const byOrder = (a: ListEntry, b: ListEntry) => a.order - b.order;

/** Full-screen checklists: an index of lists, and one list with progress, ticks and reset. */
export function ListsSheet({
  lists,
  entries,
  initialId,
  onClose,
}: {
  lists: FamilyList[] | undefined;
  entries: ListEntry[] | undefined;
  initialId: string | null;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(initialId);
  const open = lists?.find((l) => l.id === openId);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall lists-sheet" role="dialog" aria-label="רשימות" onClick={(e) => e.stopPropagation()}>
        {open ? (
          <ListDetail list={open} entries={(entries ?? []).filter((e) => e.listId === open.id).sort(byOrder)} onBack={() => setOpenId(null)} onClose={onClose} />
        ) : (
          <ListIndex lists={lists} entries={entries ?? []} onOpen={setOpenId} onClose={onClose} />
        )}
      </div>
    </div>
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
  onClose,
}: {
  lists: FamilyList[] | undefined;
  entries: ListEntry[];
  onOpen: (id: string) => void;
  onClose: () => void;
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
      <div className="sheet-head">
        <h2>📋 רשימות</h2>
        <button className="icon-button" aria-label="סגירה" onClick={onClose}>
          ✕
        </button>
      </div>

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
  onClose,
}: {
  list: FamilyList;
  entries: ListEntry[];
  onBack: () => void;
  onClose: () => void;
}) {
  const { familyId } = useFamily();
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const todo = entries.filter((e) => !e.done);
  const done = entries.filter((e) => e.done);
  const last = entries.reduce((m, e) => Math.max(m, e.order), 0);

  const add = () => {
    if (!text.trim()) return;
    addEntries(familyId, list.id, text, last);
    setText('');
  };
  const saveEdit = () => {
    if (editing && editing.text.trim()) renameEntry(familyId, editing.id, editing.text);
    setEditing(null);
  };

  const row = (e: ListEntry) =>
    editing?.id === e.id ? (
      <li key={e.id} className="row entry-edit">
        <input
          aria-label="עריכת שורה"
          value={editing.text}
          maxLength={120}
          autoFocus
          onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })}
          onKeyDown={(ev) => ev.key === 'Enter' && saveEdit()}
        />
        <button className="small primary" onClick={saveEdit}>שמירה</button>
        <button
          className="small danger"
          onClick={() => {
            if (confirm(`למחוק את "${e.text}" מהרשימה?`)) deleteEntry(familyId, e.id);
            setEditing(null);
          }}
        >
          מחיקה
        </button>
      </li>
    ) : (
      <li key={e.id} className={`row ${e.done ? 'checked' : ''}`}>
        <button className="check-area" aria-pressed={e.done} onClick={() => setEntryDone(familyId, e.id, !e.done)}>
          <span className="box" aria-hidden="true">{e.done ? '✓' : ''}</span>
          <span className="name">{e.text}</span>
        </button>
        <button className="icon-button edit" aria-label={`עריכת ${e.text}`} onClick={() => setEditing({ id: e.id, text: e.text })}>
          ✎
        </button>
      </li>
    );

  return (
    <>
      <div className="sheet-head">
        <button className="link back" onClick={onBack}>→ כל הרשימות</button>
        <button className="icon-button" aria-label="סגירה" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="list-hero">
        <span className="list-emoji big" aria-hidden="true">{list.emoji}</span>
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

      <form className="add-box list-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={text} placeholder="מה להוסיף? אפשר כמה, עם פסיק" aria-label="הוספת שורות" enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
        <button className="primary add-button" aria-label="הוספה לרשימה" disabled={!text.trim()}>
          +
        </button>
      </form>

      {todo.length > 0 && <ul className="list-rows">{todo.map(row)}</ul>}
      {done.length > 0 && (
        <>
          <h3 className="list-section">מסומנים ({done.length})</h3>
          <ul className="list-rows done">{done.map(row)}</ul>
        </>
      )}

      <div className="list-tools">
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
