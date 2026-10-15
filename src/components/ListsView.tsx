import { useEffect, useRef, useState } from 'react';
import {
  LIST_EMOJIS,
  LIST_IDEAS,
  MAX_NOTE,
  NOTE_EMOJIS,
  addEntries,
  addNoteFile,
  byPinThenTitle,
  createFolder,
  createNote,
  deleteNoteFile,
  folderPath,
  saveNoteBody,
  setNoteViewers,
  updateNote,
  deleteNote,
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
  type NoteFile,
} from '../data/lists';
import { useNoteFiles } from '../data/hooks';
import { scheduleImage } from '../data/schedules';
import { memberName, useFamily } from './FamilyContext';
import { Icon } from './Icon';
import { ZoomViewer } from './ZoomViewer';

const byOrder = (a: ListEntry, b: ListEntry) => a.order - b.order;

/** "פתק אחד · 3 תיקיות" */
const notesAndFolders = (notes: number, folders: number) =>
  [notes && (notes === 1 ? 'פתק אחד' : `${notes} פתקים`), folders && (folders === 1 ? 'תיקייה אחת' : `${folders} תיקיות`)].filter(Boolean).join(' · ');

/**
 * The lists screen: an index of checklists, one checklist with progress, ticks
 * and reset, and the notebook ("מחברת"): folders within folders, holding notes.
 */
export function ListsView({
  lists,
  entries,
  openId,
  setOpenId,
  folder,
  setFolder,
}: {
  lists: FamilyList[] | undefined;
  entries: ListEntry[] | undefined;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  /** The notebook folder being browsed: null outside the notebook, '' at its top. */
  folder: string | null;
  setFolder: (id: string | null) => void;
}) {
  const open = lists?.find((l) => l.id === openId);
  const all = lists ?? [];
  // A folder that was deleted (by anyone) sends us back to the notebook's top.
  const inFolder = folder && !all.some((l) => l.id === folder && l.kind === 'folder') && lists ? '' : folder;
  return (
    <main className="list-page lists-page" aria-label="רשימות">
      {open?.kind === 'note' ? (
        <NoteDetail note={open} all={all} onBack={() => { setFolder(open.parentId ?? ''); setOpenId(null); }} />
      ) : open && open.kind !== 'folder' ? (
        <ListDetail list={open} entries={(entries ?? []).filter((e) => e.listId === open.id).sort(byOrder)} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <div className="planner-tabs" role="tablist" aria-label="רשימות ופתקים">
            <button role="tab" aria-selected={inFolder === null} className={inFolder === null ? 'on' : ''} onClick={() => setFolder(null)}>
              <Icon name="list" size={18} /> רשימות
            </button>
            <button role="tab" aria-selected={inFolder !== null} className={inFolder !== null ? 'on' : ''} onClick={() => setFolder('')}>
              <Icon name="book" size={18} /> פתקים
            </button>
          </div>
          {inFolder !== null ? (
            <Notebook all={all} folder={inFolder} setFolder={setFolder} onOpen={setOpenId} />
          ) : (
            <ListIndex lists={lists} entries={entries ?? []} onOpen={setOpenId} />
          )}
        </>
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
  const [creating, setCreating] = useState<'list' | 'note' | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📋');
  const sorted = (lists ?? []).filter((l) => !l.kind).sort(byPinThenTitle);
  const note = creating === 'note';

  const start = (kind: 'list' | 'note') => {
    setCreating(kind);
    setTitle('');
    setEmoji(kind === 'note' ? '📝' : '📋');
  };
  const create = () => {
    if (!title.trim()) return;
    const id = note ? createNote(familyId, title, emoji) : createList(familyId, title, emoji);
    setCreating(null);
    setTitle('');
    onOpen(id);
  };

  return (
    <>
      {creating ? (
        <form className="card list-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label>
            <span className="field-label">{note ? 'שם הפתק' : 'שם הרשימה'}</span>
            <input className="full" value={title} maxLength={60} autoFocus placeholder={note ? 'למשל: קודים וסיסמאות לבית' : 'למשל: ציוד לטיול'} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {!note && (
            <div className="chips" role="group" aria-label="רעיונות">
              {LIST_IDEAS.map((i) => (
                <button key={i.title} type="button" className="chip" onClick={() => { setTitle(i.title); setEmoji(i.emoji); }}>
                  {i.emoji} {i.title}
                </button>
              ))}
            </div>
          )}
          <div className="emoji-pick" role="group" aria-label="סמל">
            {(note ? NOTE_EMOJIS : LIST_EMOJIS).map((e) => (
              <button key={e} type="button" className={e === emoji ? 'on' : ''} aria-pressed={e === emoji} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="primary" disabled={!title.trim()}>{note ? 'יצירת הפתק' : 'יצירת הרשימה'}</button>
            <button type="button" onClick={() => setCreating(null)}>ביטול</button>
          </div>
        </form>
      ) : (
        <button className="primary new-list" onClick={() => start('list')}>
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
                  <strong>{l.pinned && <span aria-label="נעוץ">📌 </span>}{l.title}</strong>
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

/** The notebook: one folder's sub-folders and notes, with a path back up and a search. */
function Notebook({
  all,
  folder,
  setFolder,
  onOpen,
}: {
  all: FamilyList[];
  folder: string;
  setFolder: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const { familyId } = useFamily();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('📝');
  const [search, setSearch] = useState('');
  const here = all.find((l) => l.id === folder);
  const parentOf = (l: FamilyList) => l.parentId ?? '';
  const exists = (id: string) => id === '' || all.some((l) => l.id === id && l.kind === 'folder');
  // Anything whose folder is gone shows at the notebook's top, so nothing gets lost.
  const at = (l: FamilyList) => (exists(parentOf(l)) ? parentOf(l) : '');
  const folders = all.filter((l) => l.kind === 'folder' && at(l) === folder).sort(byPinThenTitle);
  const q = search.trim();
  const notes = all
    .filter((l) => l.kind === 'note' && (q ? `${l.title}\n${l.body ?? ''}`.includes(q) : at(l) === folder))
    .sort(byPinThenTitle);
  const path = folder ? folderPath(all, folder) : [];
  const ancestors: string[] = [];
  for (let cur = here; cur?.parentId && exists(cur.parentId); cur = all.find((l) => l.id === cur!.parentId)) ancestors.unshift(cur.parentId);

  const count = (id: string) => {
    const n = all.filter((l) => l.kind === 'note' && at(l) === id).length;
    const f = all.filter((l) => l.kind === 'folder' && at(l) === id).length;
    return notesAndFolders(n, f) || 'ריקה';
  };
  const newFolder = () => {
    const name = prompt(folder ? `שם התיקייה החדשה בתוך "${here?.title}"` : 'שם התיקייה (למשל: בית, רכב, ביטוחים)')?.trim();
    if (name) createFolder(familyId, name, folder);
  };
  const create = () => {
    if (!title.trim()) return;
    const id = createNote(familyId, title, emoji, folder);
    setCreating(false);
    setTitle('');
    onOpen(id);
  };
  const renameFolder = () => {
    const name = prompt('שם חדש לתיקייה', here?.title)?.trim();
    if (name && here) updateList(familyId, here.id, { title: name.slice(0, 60) });
  };
  const deleteFolder = () => {
    if (!here) return;
    if (all.some((l) => l.kind && at(l) === here.id)) {
      alert('אפשר למחוק רק תיקייה ריקה. קודם מעבירים או מוחקים את מה שבתוכה.');
      return;
    }
    if (confirm(`למחוק את התיקייה "${here.title}"?`)) {
      deleteList(familyId, here.id, []);
      setFolder(parentOf(here));
    }
  };

  return (
    <>
      {folder && (
        <button className="link back" onClick={() => setFolder(here && exists(parentOf(here)) ? parentOf(here) : '')}>
          → {(here?.parentId && exists(here.parentId) && all.find((l) => l.id === here.parentId)?.title) || 'כל הפתקים'}
        </button>
      )}

      {folder && (
        <nav className="crumbs" aria-label="מיקום במחברת">
          <button className="link-plain" onClick={() => setFolder('')}>📒 פתקים</button>
          {ancestors.map((id) => (
            <span key={id}>
              <span className="muted" aria-hidden="true"> › </span>
              <button className="link-plain" onClick={() => setFolder(id)}>{all.find((l) => l.id === id)?.title}</button>
            </span>
          ))}
          {here && (
            <span>
              <span className="muted" aria-hidden="true"> › </span>
              <strong className="here">{path[path.length - 1]}</strong>
            </span>
          )}
        </nav>
      )}

      {!folder && (
        <input className="full notebook-search" type="search" value={search} placeholder="🔍 חיפוש בכל הפתקים" aria-label="חיפוש בפתקים" onChange={(e) => setSearch(e.target.value)} />
      )}

      {creating ? (
        <form className="card list-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label>
            <span className="field-label">שם הפתק</span>
            <input className="full" value={title} maxLength={60} autoFocus placeholder="למשל: קודים וסיסמאות לבית" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="emoji-pick" role="group" aria-label="סמל">
            {NOTE_EMOJIS.map((e) => (
              <button key={e} type="button" className={e === emoji ? 'on' : ''} aria-pressed={e === emoji} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="primary" disabled={!title.trim()}>יצירת הפתק</button>
            <button type="button" onClick={() => setCreating(false)}>ביטול</button>
          </div>
        </form>
      ) : (
        !q && (
          <div className="new-list-row">
            <button className="primary new-list" onClick={() => { setCreating(true); setTitle(''); setEmoji('📝'); }}>+ פתק</button>
            <button className="new-list new-note" onClick={newFolder}>+ תיקייה</button>
          </div>
        )
      )}

      {!q && folders.length + notes.length === 0 && !creating && (
        <p className="empty">{folder ? 'התיקייה ריקה. אפשר להוסיף כאן פתק או תת־תיקייה.' : 'עוד אין פתקים. פתק הוא טקסט חופשי עם קבצים, ותיקיות עוזרות לסדר אותם (בית, רכב, ביטוחים).'}</p>
      )}
      {q && notes.length === 0 && <p className="empty">לא נמצאו פתקים עם "{q}".</p>}

      <ul className="list-cards">
        {!q && folders.map((f) => (
          <li key={f.id}>
            <button className="list-card folder-card" onClick={() => setFolder(f.id)}>
              <span className="list-emoji" aria-hidden="true">📁</span>
              <span className="list-card-main">
                <strong>{f.title}</strong>
                <span className="muted">{count(f.id)}</span>
              </span>
              <span className="chevron" aria-hidden="true">‹</span>
            </button>
          </li>
        ))}
        {notes.map((l) => {
          const preview = (l.body ?? '').trim().split('\n')[0];
          const where = q && at(l) ? folderPath(all, at(l)).join(' › ') : '';
          return (
            <li key={l.id}>
              <button className="list-card note-card" onClick={() => onOpen(l.id)}>
                <span className="list-emoji" aria-hidden="true">{l.emoji}</span>
                <span className="list-card-main">
                  <strong>{l.pinned && <span aria-label="נעוץ">📌 </span>}{l.viewers && <span aria-label="פרטי">🔒 </span>}{l.title}</strong>
                  <span className="muted note-preview">{where ? `📁 ${where}` : preview || 'פתק ריק'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {here && (
        <div className="list-tools">
          <button onClick={renameFolder}>✎ שינוי שם התיקייה</button>
          <button className="danger" onClick={deleteFolder}>מחיקת התיקייה</button>
        </div>
      )}
    </>
  );
}

/** "מי רואה": the whole family, or chosen members; only the note's creator can change it. */
function WhoSees({ note, files }: { note: FamilyList; files: NoteFile[] | undefined }) {
  const { familyId, me, members } = useFamily();
  const [editing, setEditing] = useState<string[] | null | undefined>(undefined);
  const mine = note.createdBy === me.id;
  const first = (uid: string) => (uid === me.id ? 'אני' : memberName(members, uid) || 'מישהו שעזב');
  const label = !note.viewers
    ? 'כל המשפחה'
    : note.viewers.length === 1 && note.viewers[0] === me.id
      ? 'רק אני'
      : note.viewers.map(first).join(', ');
  const toggle = (uid: string) =>
    editing && setEditing(editing.includes(uid) ? editing.filter((u) => u !== uid) : [...editing, uid]);

  if (editing === undefined) {
    return (
      <div className="who-sees">
        <span>
          <span className="muted">{note.viewers ? '🔒' : '👨‍👩‍👧'} רואים ועורכים: </span>
          <strong>{label}</strong>
        </span>
        {mine ? (
          <button className="link" onClick={() => setEditing(note.viewers ? [...note.viewers] : null)}>שינוי</button>
        ) : (
          <span className="muted who-owner">רק {first(note.createdBy)} יכול לשנות</span>
        )}
      </div>
    );
  }
  return (
    <div className="card who-edit" role="group" aria-label="מי רואה את הפתק">
      <div className="segmented">
        <button className={editing === null ? 'on' : ''} aria-pressed={editing === null} onClick={() => setEditing(null)}>
          כל המשפחה
        </button>
        <button className={editing !== null ? 'on' : ''} aria-pressed={editing !== null} onClick={() => setEditing(editing ?? [me.id])}>
          🔒 רק מי שאבחר
        </button>
      </div>
      {editing !== null && (
        <div className="chips" role="group" aria-label="מי רואה">
          {members.map((m) => {
            const on = m.id === me.id || editing.includes(m.id);
            return (
              <button key={m.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={m.id === me.id} onClick={() => toggle(m.id)}>
                {on ? '✓ ' : ''}{first(m.id)}
              </button>
            );
          })}
        </div>
      )}
      <p className="muted who-hint">
        {editing === null
          ? 'כל בני המשפחה, גם מי שיצטרף בעתיד, יראו ויוכלו לערוך.'
          : 'רק מי שמסומן יראה את הפתק ואת הקבצים שבו. אחרים לא יוכלו לקרוא אותו גם מהשרת.'}
      </p>
      <div className="sheet-actions">
        <button
          className="primary"
          onClick={() => {
            const viewers = editing === null ? null : [me.id, ...editing.filter((u) => u !== me.id)];
            setNoteViewers(familyId, note, files ?? [], viewers);
            setEditing(undefined);
          }}
        >
          שמירה
        </button>
        <button onClick={() => setEditing(undefined)}>ביטול</button>
      </div>
    </div>
  );
}

/** A free-text note the whole family edits, with PDFs or photos attached. */
function NoteDetail({ note, all, onBack }: { note: FamilyList; all: FamilyList[]; onBack: () => void }) {
  const { familyId } = useFamily();
  const files = useNoteFiles(familyId, note);
  const [body, setBody] = useState(note.body ?? '');
  const [saved, setSaved] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const timer = useRef<number>();
  const latest = useRef(body);
  const remote = useRef(note.body ?? '');
  remote.current = note.body ?? '';
  const gone = useRef(false);

  // Someone else's change shows up unless I am in the middle of typing.
  useEffect(() => {
    if (!editing.current && saved) {
      setBody(note.body ?? '');
      latest.current = note.body ?? '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.body]);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!gone.current && latest.current !== remote.current) saveNoteBody(familyId, note, latest.current);
    setSaved(true);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: string) => {
    setBody(v);
    latest.current = v;
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  };

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError('');
    for (const f of Array.from(list)) {
      try {
        await addNoteFile(familyId, note, await scheduleImage(f), f.name);
      } catch {
        setError(`לא הצלחנו לצרף את "${f.name}". אפשר PDF (עד 3 עמודים ראשונים) או תמונה.`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <button className="link back" onClick={() => { flush(); onBack(); }}>
        → {(note.parentId && all.find((l) => l.id === note.parentId && l.kind === 'folder')?.title) || 'כל הפתקים'}
      </button>

      <div className="list-hero">
        <span className="list-emoji" aria-hidden="true">{note.emoji}</span>
        <div className="list-hero-main">
          {renaming !== null ? (
            <form
              className="list-rename"
              onSubmit={(e) => {
                e.preventDefault();
                if (renaming.trim()) updateNote(familyId, note, { title: renaming.trim().slice(0, 60) });
                setRenaming(null);
              }}
            >
              <input aria-label="שם הפתק" value={renaming} maxLength={60} autoFocus onChange={(e) => setRenaming(e.target.value)} />
              <button className="small primary">שמירה</button>
            </form>
          ) : (
            <h2 className="list-title">
              <button className="link-plain" aria-label="שינוי שם הפתק" onClick={() => setRenaming(note.title)}>
                {note.title}
              </button>
            </h2>
          )}
          <p className="muted list-sum">{saved ? (note.viewers ? '🔒 פתק פרטי' : 'פתק משפחתי, כולם יכולים לערוך') : 'שומר…'}</p>
        </div>
        <button
          className={`pin ${note.pinned ? 'on' : ''}`}
          aria-pressed={!!note.pinned}
          aria-label={note.pinned ? 'ביטול נעיצה' : 'נעיצה למעלה'}
          onClick={() => updateNote(familyId, note, { pinned: !note.pinned })}
        >
          📌
        </button>
      </div>

      <WhoSees note={note} files={files} />

      <textarea
        className="note-body"
        aria-label="תוכן הפתק"
        placeholder="כותבים כאן כל מה שצריך: מספרי טלפון, הוראות, קודים…"
        value={body}
        maxLength={MAX_NOTE}
        onFocus={() => { editing.current = true; }}
        onBlur={() => { editing.current = false; flush(); }}
        onChange={(e) => change(e.target.value)}
      />

      <section className="note-files" aria-label="קבצים מצורפים">
        <div className="list-section-head">
          <h3>📎 קבצים</h3>
          <span className="muted">{files?.length || ''}</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          hidden
          aria-label="בחירת קובץ לפתק"
          onChange={(e) => attach(e.target.files)}
        />
        {files && files.length > 0 && (
          <ul className="note-file-grid">
            {[...files].sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity)).map((f) => (
              <li key={f.id} className="note-file">
                <button className="note-thumb" aria-label={`הגדלת ${f.name}`} onClick={() => setZoom(f.id)}>
                  <img src={f.image} alt="" />
                </button>
                <span className="note-file-name" title={f.name}>{f.name}</span>
                <button
                  className="note-file-del"
                  aria-label={`מחיקת ${f.name}`}
                  onClick={() => confirm(`למחוק את "${f.name}" מהפתק?`) && deleteNoteFile(familyId, note, f.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="note-attach" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'מצרף…' : '+ צירוף PDF או תמונה'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted note-hint">מקובץ PDF נשמרים 3 העמודים הראשונים, כתמונה.</p>
      </section>

      {zoom && files?.find((f) => f.id === zoom) && (
        <ZoomViewer src={files.find((f) => f.id === zoom)!.image} alt={files.find((f) => f.id === zoom)!.name} onClose={() => setZoom(null)} />
      )}

      <label className="note-move">
        <span className="muted">📁 תיקייה:</span>
        <select
          aria-label="תיקיית הפתק"
          value={all.some((l) => l.id === note.parentId && l.kind === 'folder') ? note.parentId : ''}
          onChange={(e) => updateNote(familyId, note, { parentId: e.target.value })}
        >
          <option value="">בלי תיקייה (ראשי)</option>
          {all
            .filter((l) => l.kind === 'folder')
            .map((f) => ({ id: f.id, label: folderPath(all, f.id).join(' › ') }))
            .sort((a, b) => a.label.localeCompare(b.label, 'he'))
            .map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>

      <div className="list-tools">
        <button
          className="danger"
          onClick={() => {
            if (confirm(`למחוק את הפתק "${note.title}" וכל הקבצים שבו?`)) {
              window.clearTimeout(timer.current);
              gone.current = true;
              deleteNote(familyId, note, files ?? []);
              onBack();
            }
          }}
        >
          מחיקת הפתק
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
