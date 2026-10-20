import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LIST_IDEAS,
  MAX_NOTE,
  addEntries,
  addNoteFile,
  byPinThenTitle,
  saveOrder,
  createFolder,
  createNote,
  createQuickNote,
  RECEIPTS_ICON,
  receiptsFolder,
  inReceipts,
  createReceipt,
  deleteNoteFile,
  folderPath,
  lockOf,
  setFolderLock,
  fetchNoteFiles,
  relockNote,
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
  type FileContent,
} from '../data/lists';
import { useNoteFiles } from '../data/hooks';
import { scheduleImage } from '../data/schedules';
import {
  decryptImage,
  decryptText,
  deriveKey,
  encryptImage,
  encryptText,
  forgetKey,
  keyAlive,
  newSalt,
  rememberKey,
  rememberedKey,
  touchKey,
} from '../data/noteCrypto';
import { memberName, useFamily } from './FamilyContext';
import { Icon } from './Icon';
import { ZoomViewer } from './ZoomViewer';
import { IconPicker, ListIcon, iconEmoji, iconValue } from './ListIcon';
import { ActionSheet, MoreMenu, type MenuItem } from './MoreMenu';
import { useDragOrder } from './useDragOrder';
import { InlineIcon } from './ChatIcons';
import { ArrowDown, ArrowUp, ChevronDown, Receipt, ListPlus, Folder, Paperclip, Search, Users, FolderInput, FolderPlus, KeyRound, ListChecks, Lock, LockOpen, Pencil, Pin, PinOff, Plus, RotateCcw, Shapes, StickyNote, Trash2 } from 'lucide-react';
import { LibRow } from './LibRow';
import { NameField } from './NameField';
import { FormatBar, NoteView, viewSelection } from './NoteFormat';
import { hasFormatting, toggleCheck, toWhatsApp } from '../data/noteFormat';
import { LockMark } from './LockMark';
import { MoveSheet } from './MoveSheet';
import { confirmAsk, confirmDelete } from './ConfirmSheet';

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
  // All three sections start shut each time the screen opens, and stay as left while moving around in it.
  const [openSec, setOpenSec] = useState<OpenSections>({ notes: false, lists: false, receipts: false });
  const [quick, setQuick] = useState(false);
  // A folder that was deleted (by anyone) sends us back to the notebook's top.
  const inFolder = folder && !all.some((l) => l.id === folder && l.kind === 'folder') && lists ? '' : folder;
  return (
    <main className="list-page lists-page" aria-label="פתקים">
      {quick ? (
        <QuickNote onDone={() => setQuick(false)} />
      ) : open?.kind === 'note' ? (
        <NoteDetail note={open} all={all} onBack={() => { setFolder(open.parentId && open.parentId !== receiptsFolder(all)?.id && all.some((l) => l.id === open.parentId) ? open.parentId : null); setOpenId(null); }} />
      ) : open && open.kind !== 'folder' ? (
        <ListDetail list={open} entries={(entries ?? []).filter((e) => e.listId === open.id).sort(byOrder)} onBack={() => setOpenId(null)} />
      ) : (
        inFolder === null ? (
          <Library all={all} entries={entries ?? []} setFolder={setFolder} onOpen={setOpenId} openSec={openSec} setOpenSec={setOpenSec} onQuick={() => setQuick(true)} />
        ) : (
          <Notebook all={all} entries={entries ?? []} folder={inFolder} setFolder={setFolder} onOpen={setOpenId} />
        )
      )}
    </main>
  );
}

/** "Move up" / "move down" for a row's hold menu; the first row has no up, the last no down. */
function moveItems(familyId: string, order: FamilyList[], id: string): MenuItem[] {
  const i = order.findIndex((x) => x.id === id);
  if (i < 0) return [];
  const swap = (j: number) => {
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(familyId, next);
  };
  return [
    ...(i > 0 ? [{ label: 'הזזה למעלה', icon: <ArrowUp size={20} />, onClick: () => swap(i - 1) }] : []),
    ...(i < order.length - 1 ? [{ label: 'הזזה למטה', icon: <ArrowDown size={20} />, onClick: () => swap(i + 1) }] : []),
  ];
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} מתוך ${total}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

type OpenSections = { notes: boolean; lists: boolean; receipts: boolean };

/** Sends a list or an unlocked note to WhatsApp as text. */
function shareItem(item: FamilyList, entries: ListEntry[]) {
  if (item.kind === 'note') {
    const text = `${iconEmoji(item.emoji)} *${item.title}*${item.body ? `\n\n${toWhatsApp(item.body)}` : ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    return;
  }
  const mine = entries.filter((e) => e.listId === item.id).sort(byOrder);
  const cats = item.categories ?? [];
  const catOf = (e: ListEntry) => (e.category && cats.includes(e.category) ? e.category : '');
  shareList(item, ['', ...cats].map((c) => ({ name: c, rows: mine.filter((e) => catOf(e) === c) })));
}

/** Deletes a list, or a note with its files, after asking. */
async function removeItem(familyId: string, item: FamilyList, entries: ListEntry[]) {
  const what = item.kind === 'note' ? 'הפתק' : 'הרשימה';
  if (!(await confirmDelete(`למחוק את ${what} "${item.title}"?`, `${item.kind === 'note' ? 'הפתק וכל הקבצים שבו יימחקו' : 'הרשימה וכל מה שבה יימחקו'} לכל המשפחה. אי אפשר לבטל.`))) return;
  if (item.kind === 'note') deleteNote(familyId, item, await fetchNoteFiles(familyId, item));
  else deleteList(familyId, item.id, entries.filter((e) => e.listId === item.id));
}

/** A new list or note: its name and icon. */
function NewItemForm({ kind, onCreate, onCancel }: { kind: 'list' | 'note'; onCreate: (title: string, emoji: string) => void; onCancel: () => void }) {
  const note = kind === 'note';
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(iconValue(note ? 'note' : 'clipboard'));
  return (
    <form className="card list-new" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onCreate(title, emoji); }}>
      <label>
        <span className="field-label">{note ? 'שם הפתק' : 'שם הרשימה'}</span>
        <input className="full" value={title} maxLength={60} autoFocus placeholder={note ? 'למשל: קודים וסיסמאות לבית' : 'למשל: ציוד לטיול'} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {!note && (
        <div className="chips" role="group" aria-label="רעיונות">
          {LIST_IDEAS.map((i) => (
            <button key={i.title} type="button" className="chip" onClick={() => { setTitle(i.title); setEmoji(i.emoji); }}>
              <ListIcon value={i.emoji} size={16} /> {i.title}
            </button>
          ))}
        </div>
      )}
      <div className="sheet-actions">
        <button className="primary" disabled={!title.trim()}>{note ? 'יצירת הפתק' : 'יצירת הרשימה'}</button>
        <button type="button" onClick={onCancel}>ביטול</button>
      </div>
    </form>
  );
}

/** A new folder: its name, and whether it goes with the notes or the receipts. */
function NewFolderForm({ onCreate, onCancel }: { onCreate: (title: string, where: 'notes' | 'receipts') => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState<'notes' | 'receipts'>('notes');
  const places = [
    { key: 'notes', label: 'פתקים', Icon: StickyNote },
    { key: 'receipts', label: 'קבלות', Icon: Receipt },
  ] as const;
  return (
    <form className="card list-new" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onCreate(title, where); }}>
      <label>
        <span className="field-label">שם התיקייה</span>
        <input className="full" value={title} maxLength={60} autoFocus placeholder={where === 'receipts' ? 'למשל: רכב, 2025' : 'למשל: בית, רכב, ביטוחים'} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="chips" role="radiogroup" aria-label="איפה התיקייה">
        {places.map(({ key, label, Icon: PlaceIcon }) => (
          <button key={key} type="button" role="radio" aria-checked={where === key} className={where === key ? 'chip on' : 'chip'} onClick={() => setWhere(key)}>
            <PlaceIcon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        <button className="primary" disabled={!title.trim()}>יצירת התיקייה</button>
        <button type="button" onClick={onCancel}>ביטול</button>
      </div>
    </form>
  );
}

/** A section heading that folds its rows away, as in the phone's Notes. */
function SectionHead({ title, icon, open, onToggle, count }: { title: string; icon: ReactNode; open: boolean; onToggle: () => void; count: number }) {
  return (
    <button type="button" className="lib-section" aria-expanded={open} onClick={onToggle}>
      <span>
        <span className="lib-section-icon" aria-hidden="true">{icon}</span>
        {title}
      </span>
      {!open && count > 0 && <span className="muted lib-section-count">{count}</span>}
      <ChevronDown className={open ? 'lib-chevron' : 'lib-chevron shut'} size={22} aria-hidden="true" />
    </button>
  );
}

/**
 * The library: "פתקים" (general notes and the folders), "רשימות" (the
 * checklists) and "קבלות", each folding open or shut. Rows swipe left for
 * share and delete, hold for their menu, and hold-and-drag to reorder.
 */
function Library({
  all,
  entries,
  setFolder,
  onOpen,
  openSec,
  setOpenSec,
  onQuick,
}: {
  all: FamilyList[];
  entries: ListEntry[];
  setFolder: (id: string) => void;
  onOpen: (id: string) => void;
  openSec: OpenSections;
  setOpenSec: (s: OpenSections) => void;
  onQuick: () => void;
}) {
  const { familyId } = useFamily();
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [creating, setCreating] = useState<'list' | 'note' | 'folder' | null>(null);
  const [search, setSearch] = useState('');
  const toggle = (k: keyof OpenSections) => setOpenSec({ ...openSec, [k]: !openSec[k] });
  const isFolder = (id: string) => all.some((l) => l.id === id && l.kind === 'folder');
  const at = (l: FamilyList) => (l.parentId && isFolder(l.parentId) ? l.parentId : '');
  const checklists = all.filter((l) => !l.kind).sort(byPinThenTitle);
  const receipts = receiptsFolder(all);
  const folders = all.filter((l) => l.kind === 'folder' && at(l) === '' && l !== receipts).sort(byPinThenTitle);
  // Every note, also those inside folders (folders themselves aren't counted; receipts have their own section).
  const noteCount = all.filter((l) => l.kind === 'note' && !inReceipts(all, l.parentId)).length;
  const receiptCount = all.filter((l) => l.kind === 'note' && inReceipts(all, l.parentId)).length;
  const receiptFolders = receipts ? all.filter((l) => l.kind === 'folder' && l.parentId === receipts.id).sort(byPinThenTitle) : [];
  const receiptNotes = receipts ? all.filter((l) => l.kind === 'note' && l.parentId === receipts.id).sort(byPinThenTitle) : [];
  const rootNotes = all.filter((l) => l.kind === 'note' && at(l) === '').sort(byPinThenTitle);
  const listDrag = useDragOrder(checklists, (l) => l.id, (items) => saveOrder(familyId, items));
  const folderDrag = useDragOrder(folders, (l) => l.id, (items) => saveOrder(familyId, items));
  const rootDrag = useDragOrder(rootNotes, (l) => l.id, (items) => saveOrder(familyId, items));
  const receiptDrag = useDragOrder(receiptNotes, (l) => l.id, (items) => saveOrder(familyId, items));
  const receiptFolderDrag = useDragOrder(receiptFolders, (l) => l.id, (items) => saveOrder(familyId, items));
  const receiptsId = () => receipts?.id ?? createFolder(familyId, 'קבלות', '', RECEIPTS_ICON);
  const newReceipt = () => {
    setOpenSec({ ...openSec, receipts: true });
    onOpen(createReceipt(familyId, receiptsId()));
  };
  const shut = (l: FamilyList) => {
    const fl = lockOf(all, l.parentId);
    return !!fl && !keyAlive(fl.salt ?? '');
  };
  const q = search.trim();
  const found = q
    ? all.filter((l) => (l.kind === 'note' && !shut(l) && `${l.title}\n${l.locked ? '' : l.body ?? ''}`.includes(q)) || (!l.kind && l.title.includes(q))).sort(byPinThenTitle)
    : [];
  const count = (id: string) => {
    const n = all.filter((l) => l.kind === 'note' && at(l) === id).length;
    const f = all.filter((l) => l.kind === 'folder' && at(l) === id).length;
    return n + f;
  };
  const progress = (l: FamilyList) => {
    const mine = entries.filter((e) => e.listId === l.id);
    const done = mine.filter((e) => e.done).length;
    return mine.length === 0 ? 'ריקה' : done === mine.length ? `הכול מסומן ✓ (${done})` : `${done} מתוך ${mine.length}`;
  };
  const rename = (l: FamilyList) => {
    const name = prompt('שם חדש', l.title)?.trim();
    if (name) updateList(familyId, l.id, { title: name.slice(0, 60) });
  };
  const removeFolder = (f: FamilyList) => {
    if (all.some((l) => l.kind && l.parentId === f.id)) return alert('אפשר למחוק רק תיקייה ריקה. קודם מעבירים או מוחקים את מה שבתוכה.');
    confirmDelete(`למחוק את התיקייה "${f.title}"?`).then((ok) => ok && deleteList(familyId, f.id, []));
  };
  const [moving, setMoving] = useState<FamilyList | null>(null);
  // Hold a row and let go: its whole menu.
  const folderMenu = (f: FamilyList, order: FamilyList[] = folders) => () =>
    setMenu({
      title: f.title,
      items: [
        { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => rename(f) },
        ...moveItems(familyId, order, f.id),
        { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => removeFolder(f) },
      ],
    });
  const itemMenu = (l: FamilyList, order: FamilyList[] = []) => () =>
    setMenu({
      title: l.title,
      items: [
        { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => rename(l) },
        ...moveItems(familyId, order, l.id),
        ...itemActions(l).filter((a) => !a.danger),
        ...(l.kind === 'note'
          ? [l.pinned
              ? { label: 'הסרת הנעיצה', icon: <PinOff size={20} />, onClick: () => updateNote(familyId, l, { pinned: false }) }
              : { label: 'נעיצה למעלה', icon: <Pin size={20} />, onClick: () => updateNote(familyId, l, { pinned: true }) }]
          : []),
        ...itemActions(l).filter((a) => a.danger),
      ],
    });
  const itemActions = (l: FamilyList) => [
    ...(l.locked ? [] : [{ label: 'שיתוף', icon: <Icon name="whatsapp" size={20} />, onClick: () => shareItem(l, entries) }]),
    ...(l.kind === 'note' ? [{ label: 'העברה', icon: <FolderInput size={20} />, onClick: () => setMoving(l) }] : []),
    { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => removeItem(familyId, l, entries) },
  ];
  const newFolder = (name: string, where: 'notes' | 'receipts') => {
    createFolder(familyId, name, where === 'receipts' ? receiptsId() : '');
    setOpenSec({ ...openSec, [where]: true });
    setCreating(null);
  };
  const folderRow = (f: FamilyList, order: FamilyList[]) => (
    <LibRow
      className="folder-card"
      icon={<Folder size={22} />}
      title={<>{f.locked && <span aria-label="נעולה"><LockMark /></span>}{f.title}</>}
      count={count(f.id)}
      onOpen={() => setFolder(f.id)}
      actions={[
        { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => rename(f) },
        { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => removeFolder(f) },
      ]}
      onHold={folderMenu(f, order)}
    />
  );

  const row = (l: FamilyList) =>
    l.kind === 'note' ? (
      <LibRow
        className="note-card"
        icon={<ListIcon value={l.emoji} size={22} />}
        title={<>{l.pinned && <span aria-label="נעוץ"><InlineIcon icon={Pin} size={14} /></span>}{l.viewers && <span aria-label="פרטי"><LockMark kind="private" /></span>}{l.title}</>}
        sub={at(l) ? <><InlineIcon icon={Folder} size={14} />{folderPath(all, at(l)).join(' › ')}</> : l.locked ? <><LockMark />נעול בסיסמה</> : (l.body ?? '').trim().split('\n')[0] || 'פתק ריק'}
        onOpen={() => onOpen(l.id)}
        actions={itemActions(l)}
        onHold={itemMenu(l)}
      />
    ) : (
      <LibRow className="list-card" icon={<ListIcon value={l.emoji} size={22} />} title={l.title} sub={progress(l)} onOpen={() => onOpen(l.id)} actions={itemActions(l)} onHold={itemMenu(l)} />
    );

  return (
    <>
      <div className="lib-head">
        <span className="search-box">
          <Search size={18} aria-hidden="true" />
          <input className="full notebook-search" type="search" value={search} placeholder="חיפוש" aria-label="חיפוש בפתקים" onChange={(e) => setSearch(e.target.value)} />
        </span>
        {!q && !creating && (
          <MoreMenu
            label="הוספה"
            className="lib-add"
            icon={<Plus size={24} strokeWidth={2.4} aria-hidden="true" />}
            title="הוספה"
            items={[
              { label: 'פתק חדש', icon: <StickyNote size={20} />, onClick: () => setCreating('note') },
              { label: 'רשימה חדשה', icon: <ListChecks size={20} />, onClick: () => setCreating('list') },
              { label: 'קבלה חדשה', icon: <Receipt size={20} />, onClick: newReceipt },
              { label: 'תיקייה חדשה', icon: <FolderPlus size={20} />, onClick: () => setCreating('folder') },
            ]}
          />
        )}
      </div>

      {creating === 'folder' && <NewFolderForm onCreate={newFolder} onCancel={() => setCreating(null)} />}

      {creating && creating !== 'folder' && (
        <NewItemForm
          kind={creating}
          onCancel={() => setCreating(null)}
          onCreate={(title, emoji) => {
            const id = creating === 'note' ? createNote(familyId, title, emoji) : createList(familyId, title, emoji);
            setCreating(null);
            onOpen(id);
          }}
        />
      )}

      {q ? (
        found.length === 0 ? (
          <p className="empty">לא נמצא כלום עם "{q}".</p>
        ) : (
          <ul className="lib-group">{found.map((l) => <li key={l.id}>{row(l)}</li>)}</ul>
        )
      ) : (
        <>
          <section>
            <SectionHead title="פתקים" icon={<StickyNote size={24} />} open={openSec.notes} onToggle={() => toggle('notes')} count={noteCount} />
            {openSec.notes && folders.length + rootNotes.length > 0 && (
              <ul className="lib-group">
                {folderDrag.ordered.map((f) => (
                  <li key={f.id} {...folderDrag.row(f.id)}>{folderRow(f, folders)}</li>
                ))}
                {rootDrag.ordered.map((l) => (
                  <li key={l.id} {...rootDrag.row(l.id)}>
                    <LibRow
                      className="note-card"
                      icon={<ListIcon value={l.emoji} size={22} />}
                      title={<>{l.pinned && <span aria-label="נעוץ"><InlineIcon icon={Pin} size={14} /></span>}{l.viewers && <span aria-label="פרטי"><LockMark kind="private" /></span>}{l.title}</>}
                      sub={<span className="note-preview">{l.locked ? <><LockMark />נעול בסיסמה</> : (l.body ?? '').trim().split('\n')[0] || 'פתק ריק'}</span>}
                      onOpen={() => onOpen(l.id)}
                      actions={itemActions(l)}
                      onHold={itemMenu(l, rootNotes)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {openSec.notes && folders.length + rootNotes.length === 0 && (
              <p className="empty">עוד אין פתקים. פתק הוא טקסט חופשי עם קבצים, ותיקיות עוזרות לסדר אותם (בית, רכב, ביטוחים).</p>
            )}
          </section>

          <section>
            <SectionHead title="רשימות" icon={<ListChecks size={24} />} open={openSec.lists} onToggle={() => toggle('lists')} count={checklists.length} />
            {openSec.lists &&
              (checklists.length === 0 ? (
                <p className="empty">עוד אין רשימות. רשימה יכולה להיות כל דבר: תיק למכון, ציוד לטיול, דברים לטיסה.</p>
              ) : (
                <ul className="lib-group">
                  {listDrag.ordered.map((l) => (
                    <li key={l.id} {...listDrag.row(l.id)}>
                      <LibRow
                        className="list-card"
                        icon={<ListIcon value={l.emoji} size={22} />}
                        title={<>{l.pinned && <span aria-label="נעוץ"><InlineIcon icon={Pin} size={14} /></span>}{l.title}</>}
                        sub={progress(l)}
                        onOpen={() => onOpen(l.id)}
                        actions={itemActions(l)}
                        onHold={itemMenu(l, checklists)}
                      />
                    </li>
                  ))}
                </ul>
              ))}
          </section>

          <section>
            <SectionHead title="קבלות" icon={<Receipt size={24} />} open={openSec.receipts} onToggle={() => toggle('receipts')} count={receiptCount} />
            {openSec.receipts &&
              (receiptNotes.length + receiptFolders.length === 0 ? (
                <p className="empty">עוד אין קבלות. "קבלה חדשה" בכפתור + פותחת קבלה עם התאריך של היום, ומצרפים אליה צילום או PDF.</p>
              ) : (
                <>
                {receiptFolders.length > 0 && (
                  <ul className="lib-group">
                    {receiptFolderDrag.ordered.map((f) => (
                      <li key={f.id} {...receiptFolderDrag.row(f.id)}>{folderRow(f, receiptFolders)}</li>
                    ))}
                  </ul>
                )}
                {receiptNotes.length > 0 && (
                <ul className="lib-group">
                  {receiptDrag.ordered.map((l) => (
                    <li key={l.id} {...receiptDrag.row(l.id)}>
                      <LibRow
                        className="note-card"
                        icon={<ListIcon value={l.emoji} size={22} />}
                        title={<>{l.pinned && <span aria-label="נעוץ"><InlineIcon icon={Pin} size={14} /></span>}{l.title}</>}
                        sub={<span className="note-preview">{l.locked ? <><LockMark />נעול בסיסמה</> : (l.body ?? '').trim().split('\n')[0] || 'קבלה'}</span>}
                        onOpen={() => onOpen(l.id)}
                        actions={itemActions(l)}
                        onHold={itemMenu(l, receiptNotes)}
                      />
                    </li>
                  ))}
                </ul>
                )}
                </>
              ))}
          </section>
        </>
      )}

      {moving && <MoveSheet all={all} note={moving} quick onPick={(t) => updateNote(familyId, moving, { parentId: t })} onClose={() => setMoving(null)} />}
      {menu && <ActionSheet title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}
      {/* While all three sections are shut, a quick note is one tap away. */}
      {!q && !creating && !openSec.notes && !openSec.lists && !openSec.receipts && (
        <button type="button" className="quick-note-button" onClick={onQuick}>
          <StickyNote size={22} aria-hidden="true" />
          <span>פתק מהיר</span>
        </button>
      )}
    </>
  );
}

/** A blank page to jot something down: no name, no settings. Leaving saves it as a family note (nothing written, nothing saved). */
function QuickNote({ onDone }: { onDone: () => void }) {
  const { familyId } = useFamily();
  const [text, setText] = useState('');
  const latest = useRef('');
  latest.current = text;
  const saved = useRef(false);
  const save = () => {
    if (saved.current) return;
    saved.current = true;
    if (latest.current.trim()) createQuickNote(familyId, latest.current.trim(), iconValue('note'));
  };
  useEffect(() => save, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="quick-note">
      <div className="detail-top">
        <button className="link back" onClick={() => { save(); onDone(); }}>→ כל הפתקים</button>
      </div>
      <textarea className="note-body quick-note-body" aria-label="פתק מהיר" placeholder="כותבים…" autoFocus value={text} maxLength={MAX_NOTE} onChange={(e) => setText(e.target.value)} />
    </div>
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
  const [picking, setPicking] = useState(false);
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
      <div className="detail-top">
        <button className="link back" onClick={() => { add(); onBack(); }}>→ כל הרשימות</button>
        <button
          type="button"
          className="link lib-edit"
          onClick={() => {
            // Rows are saved as they're added; this only adds what's still typed and closes the list.
            add();
            (document.activeElement as HTMLElement | null)?.blur();
            onBack();
          }}
        >
          סיום
        </button>
      </div>

      <div className="list-hero">
        <IconButton value={list.emoji} open={picking} setOpen={setPicking} onPick={(v) => updateList(familyId, list.id, { emoji: v })} />
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
              <NameField label="שם הרשימה" value={renaming} onChange={setRenaming} />
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
        <MoreMenu
          title={list.title}
          items={[
            { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => setRenaming(list.title) },
            { label: 'החלפת הסמל', icon: <Shapes size={20} />, onClick: () => setPicking(true) },
            { label: 'קטגוריה חדשה', icon: <ListPlus size={20} />, onClick: newCategory },
            { label: 'ניקוי סימונים', icon: <RotateCcw size={20} />, disabled: done.length === 0, onClick: () => confirm('לנקות את כל הסימונים ולהתחיל מחדש?') && resetList(familyId, entries) },
            {
              label: 'מחיקת הרשימה',
              icon: <Trash2 size={20} />,
              danger: true,
              onClick: () => {
                confirmDelete(`למחוק את הרשימה "${list.title}"?`, 'הרשימה וכל מה שבה יימחקו לכל המשפחה. אי אפשר לבטל.').then((ok) => {
                  if (!ok) return;
                  deleteList(familyId, list.id, entries);
                  onBack();
                });
              },
            },
          ]}
        />
      </div>

      {entries.length > 0 && (
        <div className="list-tools">
          <button className="whatsapp" onClick={() => shareList(list, sections)}>
            <Icon name="whatsapp" size={20} /> שליחת הרשימה לוואטסאפ
          </button>
        </div>
      )}

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

      {/* Like the shopping list: the add row stays at the bottom while the list scrolls. */}
      <form className="add-box bottom-add list-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        {cats.length > 0 && (
          <label className="list-target">
            <span className="muted">מוסיפים ל:</span>
            <select aria-label="להוסיף לקטגוריה" value={cats.includes(target) ? target : ''} onChange={(e) => setTarget(e.target.value)}>
              <option value="">בלי קטגוריה</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <input ref={inputRef} value={text} placeholder="מה להוסיף? אפשר כמה, עם פסיק" aria-label="הוספת שורות" enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
        <button className="primary add-button" aria-label="הוספה לרשימה" disabled={!text.trim()}>
          +
        </button>
      </form>
    </>
  );
}

/** The notebook: one folder's sub-folders and notes, with a path back up and a search. */
function Notebook({
  all,
  entries,
  folder,
  setFolder,
  onOpen,
}: {
  all: FamilyList[];
  entries: ListEntry[];
  folder: string;
  setFolder: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const { familyId, me } = useFamily();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(iconValue('note'));
  const [menu, setMenu] = useState<{ title: string; items: MenuItem[] } | null>(null);
  const [locking, setLocking] = useState<{ a: string; b: string } | null>(null);
  const [moving, setMoving] = useState<FamilyList | null>(null);
  const [work, setWork] = useState('');
  const [, setTick] = useState(0);
  const here = all.find((l) => l.id === folder);
  const lock = lockOf(all, folder);
  // A locked folder closes again after a while without use.
  useEffect(() => {
    if (!lock) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [lock]);
  const parentOf = (l: FamilyList) => l.parentId ?? '';
  const exists = (id: string) => id === '' || all.some((l) => l.id === id && l.kind === 'folder');
  // Anything whose folder is gone shows at the notebook's top, so nothing gets lost.
  const at = (l: FamilyList) => (exists(parentOf(l)) ? parentOf(l) : '');
  // The top-level folders live in the library; "פתקים כלליים" holds just the notes.
  const folders = folder ? all.filter((l) => l.kind === 'folder' && at(l) === folder).sort(byPinThenTitle) : [];
  const notes = all.filter((l) => l.kind === 'note' && at(l) === folder).sort(byPinThenTitle);
  const folderDrag = useDragOrder(folders, (l) => l.id, (items) => saveOrder(familyId, items));
  const noteDrag = useDragOrder(notes, (l) => l.id, (items) => saveOrder(familyId, items));
  // Inside the receipts: the receipts folder itself is the library's "קבלות", and new items are receipts.
  const receiptsRoot = receiptsFolder(all)?.id;
  const inRec = inReceipts(all, folder);
  const up = () => setFolder(here && exists(parentOf(here)) && parentOf(here) && parentOf(here) !== receiptsRoot ? parentOf(here) : null);
  const path = folder ? folderPath(all, folder) : [];
  const ancestors: string[] = [];
  for (let cur = here; cur?.parentId && exists(cur.parentId) && cur.parentId !== receiptsRoot; cur = all.find((l) => l.id === cur!.parentId)) ancestors.unshift(cur.parentId);

  const count = (id: string) => {
    const n = all.filter((l) => l.kind === 'note' && at(l) === id).length;
    const f = all.filter((l) => l.kind === 'folder' && at(l) === id).length;
    return notesAndFolders(n, f) || 'ריקה';
  };
  const newFolder = () => {
    const name = prompt(here ? `שם התיקייה החדשה בתוך "${here.title}"` : 'שם התיקייה (למשל: בית, רכב, ביטוחים)')?.trim();
    if (name) createFolder(familyId, name, folder);
  };
  const create = async () => {
    if (!title.trim()) return;
    const k = lock ? rememberedKey(lock.salt) : null;
    if (lock && !k) return setTick((n) => n + 1);
    const id = createNote(
      familyId,
      title,
      emoji,
      folder,
      k && lock ? { salt: lock.salt!, body: await encryptText(k, ''), lockFolder: lock.id } : undefined,
    );
    setCreating(false);
    setTitle('');
    onOpen(id);
  };
  // Every note under this folder (sub-folders too) that I can see.
  const under = (l: FamilyList, id: string) => {
    for (let p = l.parentId, guard = 0; p && guard < 20; guard++) {
      if (p === id) return true;
      p = all.find((x) => x.id === p)?.parentId;
    }
    return false;
  };
  /** Rewrites notes in their new form: encrypted with `to`'s key, or opened up (to null). */
  const rewrap = async (notes: FamilyList[], from: (n: FamilyList) => CryptoKey | null, to: { key: CryptoKey; salt: string; folder: string } | null) => {
    let done = 0;
    for (const n of notes) {
      setWork(`${to ? 'מצפין' : 'פותח'} ${++done} מתוך ${notes.length}…`);
      const k = from(n);
      const text = k ? await decryptText(k, n.body ?? '') : n.body ?? '';
      const files = await fetchNoteFiles(familyId, n);
      const moved: { file: NoteFile; content: FileContent }[] = [];
      for (const f of files) {
        const image = f.image ?? (k && f.secret && f.iv ? await decryptImage(k, f.secret, f.iv) : '');
        if (!image) continue;
        moved.push({ file: f, content: to ? await encryptImage(to.key, image) : { image } });
      }
      relockNote(familyId, n, to ? { salt: to.salt, body: await encryptText(to.key, text), lockFolder: to.folder } : { body: text }, moved);
    }
    setWork('');
  };
  const lockFolder = async () => {
    if (!here || !locking || locking.a.length < 4 || locking.a !== locking.b) return;
    setWork('מצפין…');
    const salt = newSalt();
    const key = await deriveKey(locking.a, salt);
    setFolderLock(familyId, here.id, { salt, check: await encryptText(key, 'levis') });
    rememberKey(salt, key);
    setLocking(null);
    // A note with its own password stays with it, unless that password is open now.
    const inside = all.filter((l) => l.kind === 'note' && under(l, here.id) && (!l.locked || rememberedKey(l.salt)));
    await rewrap(inside, (n) => (n.locked ? rememberedKey(n.salt) : null), { key, salt, folder: here.id });
    const kept = all.filter((l) => l.kind === 'note' && under(l, here.id) && l.locked && !l.lockFolder && !rememberedKey(l.salt));
    if (kept.length) alert(`${kept.length} פתקים עם סיסמה משלהם נשארו עם הסיסמה שלהם.`);
  };
  const unlockFolder = async () => {
    if (!here?.salt) return;
    const key = rememberedKey(here.salt);
    if (!key || !confirm('להסיר את הסיסמה מהתיקייה? הפתקים שבה יישמרו שוב בלי הצפנה.')) return;
    await rewrap(all.filter((l) => l.kind === 'note' && l.lockFolder === here.id), () => key, null);
    setFolderLock(familyId, here.id, null);
    forgetKey(here.salt);
  };

  const renameFolder = () => {
    const name = prompt('שם חדש לתיקייה', here?.title)?.trim();
    if (name && here) updateList(familyId, here.id, { title: name.slice(0, 60) });
  };
  const deleteSub = (f: FamilyList) => {
    if (all.some((l) => l.kind && at(l) === f.id)) return alert('אפשר למחוק רק תיקייה ריקה. קודם מעבירים או מוחקים את מה שבתוכה.');
    confirmDelete(`למחוק את התיקייה "${f.title}"?`).then((ok) => ok && deleteList(familyId, f.id, []));
  };
  const renameItem = (l: FamilyList) => {
    const name = prompt('שם חדש', l.title)?.trim();
    if (name) updateList(familyId, l.id, { title: name.slice(0, 60) });
  };
  const deleteFolder = () => {
    if (!here) return;
    if (all.some((l) => l.kind && at(l) === here.id)) {
      alert('אפשר למחוק רק תיקייה ריקה. קודם מעבירים או מוחקים את מה שבתוכה.');
      return;
    }
    confirmDelete(`למחוק את התיקייה "${here.title}"?`).then((ok) => {
      if (!ok) return;
      deleteList(familyId, here.id, []);
      up();
    });
  };

  return (
    <>
      <button className="link back" onClick={up}>
        → {(here?.parentId && exists(here.parentId) && here.parentId !== receiptsRoot && all.find((l) => l.id === here.parentId)?.title) || (inRec ? 'קבלות' : 'כל הפתקים')}
      </button>
      {!folder && <h2 className="lib-title">פתקים כלליים</h2>}

      {folder && (
        <div className="crumbs-row">
        <nav className="crumbs" aria-label="מיקום במחברת">
          <button className="link-plain" onClick={() => setFolder(null)}>{inRec ? 'קבלות' : 'פתקים'}</button>
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
        {here && (
          <MoreMenu
            title={here.title}
            items={[
              { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: renameFolder },
              here.locked && keyAlive(here.salt ?? '') && { label: 'נעילה עכשיו', icon: <Lock size={20} />, onClick: () => { forgetKey(here.salt ?? ''); setTick((n) => n + 1); } },
              here.locked && keyAlive(here.salt ?? '') && here.createdBy === me.id && { label: 'הסרת הסיסמה', icon: <LockOpen size={20} />, disabled: !!work, onClick: unlockFolder },
              !here.locked && !lock && here.createdBy === me.id && !locking && { label: 'נעילת התיקייה בסיסמה', icon: <KeyRound size={20} />, onClick: () => setLocking({ a: '', b: '' }) },
              { label: 'מחיקת התיקייה', icon: <Trash2 size={20} />, danger: true, onClick: deleteFolder },
            ]}
          />
        )}
        </div>
      )}

      {lock && !keyAlive(lock.salt ?? '') ? (
        <FolderGate folder={lock} onOpen={() => setTick((n) => n + 1)} />
      ) : (
      <>
      {!creating && (
        <div className="lib-head end">
          <MoreMenu
            label="הוספה"
            className="lib-add"
            icon={<Plus size={24} strokeWidth={2.4} aria-hidden="true" />}
            title={here ? `הוספה ל"${here.title}"` : 'הוספה'}
            items={[
              inRec
                ? { label: 'קבלה חדשה', icon: <Receipt size={20} />, onClick: () => onOpen(createReceipt(familyId, folder)) }
                : { label: 'פתק חדש', icon: <StickyNote size={20} />, onClick: () => { setCreating(true); setTitle(''); setEmoji(iconValue('note')); } },
              { label: 'תיקייה חדשה', icon: <FolderPlus size={20} />, onClick: newFolder },
            ]}
          />
        </div>
      )}
      {creating && (
        <form className="card list-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label>
            <span className="field-label">שם הפתק</span>
            <input className="full" value={title} maxLength={60} autoFocus placeholder="למשל: קודים וסיסמאות לבית" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="sheet-actions">
            <button className="primary" disabled={!title.trim()}>יצירת הפתק</button>
            <button type="button" onClick={() => setCreating(false)}>ביטול</button>
          </div>
        </form>
      )}

      {folders.length + notes.length === 0 && !creating && (
        <p className="empty">{folder ? `התיקייה ריקה. אפשר להוסיף כאן ${inRec ? 'קבלה' : 'פתק'} או תת־תיקייה.` : 'עוד אין פתקים. פתק הוא טקסט חופשי עם קבצים, ותיקיות עוזרות לסדר אותם (בית, רכב, ביטוחים).'}</p>
      )}

      {folders.length > 0 && (
        <ul className="lib-group">
          {folderDrag.ordered.map((f) => (
            <li key={f.id} {...folderDrag.row(f.id)}>
              <LibRow
                className="folder-card"
                icon={<Folder size={22} />}
                title={<>{f.locked && <span aria-label="נעולה"><LockMark /></span>}{f.title}</>}
                sub={count(f.id)}
                onOpen={() => setFolder(f.id)}
                actions={[
                  { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => renameItem(f) },
                  { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => deleteSub(f) },
                ]}
                onHold={() =>
                  setMenu({
                    title: f.title,
                    items: [
                      { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => renameItem(f) },
                      ...moveItems(familyId, folders, f.id),
                      { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => deleteSub(f) },
                    ],
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="lib-group">
          {noteDrag.ordered.map((l) => (
            <li key={l.id} {...noteDrag.row(l.id)}>
              <LibRow
                className="note-card"
                icon={<ListIcon value={l.emoji} size={22} />}
                title={<>{l.pinned && <span aria-label="נעוץ"><InlineIcon icon={Pin} size={14} /></span>}{l.viewers && <span aria-label="פרטי"><LockMark kind="private" /></span>}{l.title}</>}
                sub={<span className="note-preview">{l.locked ? <><LockMark />נעול בסיסמה</> : (l.body ?? '').trim().split('\n')[0] || (inRec ? 'קבלה' : 'פתק ריק')}</span>}
                onOpen={() => onOpen(l.id)}
                actions={[
                  ...(l.locked ? [] : [{ label: 'שיתוף', icon: <Icon name="whatsapp" size={20} />, onClick: () => shareItem(l, entries) }]),
                  { label: 'העברה', icon: <FolderInput size={20} />, onClick: () => setMoving(l) },
                  { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => removeItem(familyId, l, entries) },
                ]}
                onHold={() =>
                  setMenu({
                    title: l.title,
                    items: [
                      { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => renameItem(l) },
                      ...moveItems(familyId, notes, l.id),
                      ...(l.locked ? [] : [{ label: 'שיתוף', icon: <Icon name="whatsapp" size={20} />, onClick: () => shareItem(l, entries) }]),
                      { label: 'העברה', icon: <FolderInput size={20} />, onClick: () => setMoving(l) },
                      l.pinned
                        ? { label: 'הסרת הנעיצה', icon: <PinOff size={20} />, onClick: () => updateNote(familyId, l, { pinned: false }) }
                        : { label: 'נעיצה למעלה', icon: <Pin size={20} />, onClick: () => updateNote(familyId, l, { pinned: true }) },
                      { label: 'מחיקה', icon: <Trash2 size={20} />, danger: true, onClick: () => removeItem(familyId, l, entries) },
                    ],
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {moving && <MoveSheet all={all} note={moving} quick onPick={(t) => updateNote(familyId, moving, { parentId: t })} onClose={() => setMoving(null)} />}
      {menu && <ActionSheet title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}

      {locking && (
        <form className="card note-lock" onSubmit={(e) => { e.preventDefault(); lockFolder(); }}>
          <strong><LockMark />נעילת התיקייה בסיסמה</strong>
          <input type="password" autoComplete="new-password" placeholder="סיסמה (לפחות 4 תווים)" aria-label="סיסמה חדשה לתיקייה" value={locking.a} autoFocus onChange={(e) => setLocking({ ...locking, a: e.target.value })} />
          <input type="password" autoComplete="new-password" placeholder="שוב, לאימות" aria-label="אימות סיסמת התיקייה" value={locking.b} onChange={(e) => setLocking({ ...locking, b: e.target.value })} />
          {locking.b && locking.a !== locking.b && <p className="error">הסיסמאות לא זהות</p>}
          <p className="muted note-hint">
            כל הפתקים בתיקייה ובתתי־התיקיות שלה יוצפנו בטלפון, גם פתקים שבני משפחה אחרים כתבו. פתק שנוסיף או נעביר לכאן יינעל אוטומטית.
            <strong> סיסמה שנשכחה אי אפשר לשחזר.</strong> שמות הפתקים והתיקיות לא מוצפנים.
          </p>
          <div className="sheet-actions">
            <button className="primary" disabled={!!work || locking.a.length < 4 || locking.a !== locking.b}>נעילה</button>
            <button type="button" onClick={() => setLocking(null)}>ביטול</button>
          </div>
        </form>
      )}
      {work && <p className="muted" role="status">{work}</p>}

      </>
      )}
    </>
  );
}

/** The password screen of a locked folder; it checks the password against the folder's sealed check text. */
function FolderGate({ folder, onOpen }: { folder: FamilyList; onOpen: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const k = await deriveKey(password, folder.salt ?? '');
      await decryptText(k, folder.body ?? '');
      rememberKey(folder.salt ?? '', k);
      onOpen();
    } catch {
      setError('הסיסמה לא נכונה');
      setBusy(false);
    }
  };
  return (
    <form className="card note-gate" onSubmit={(e) => { e.preventDefault(); if (password) open(); }}>
      <strong><LockMark />התיקייה "{folder.title}" נעולה בסיסמה</strong>
      <label>
        <span className="field-label">הסיסמה של התיקייה</span>
        <input className="full" type="password" autoComplete="off" value={password} autoFocus aria-label="סיסמת התיקייה" onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={!password || busy}>{busy ? 'פותח…' : <><LockMark kind="open" />פתיחה</>}</button>
      <p className="muted note-hint">את הסיסמה מקבלים ממי שנעל את התיקייה. אחרי הפתיחה, כל הפתקים שבתוכה פתוחים.</p>
    </form>
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
          <span className="muted">{note.viewers ? <LockMark kind="private" /> : <InlineIcon icon={Users} size={15} />} רואים ועורכים: </span>
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
          <LockMark kind="private" />רק מי שאבחר
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

/** A note: its password gate when locked, then the editor. */
function NoteDetail({ note, all, onBack }: { note: FamilyList; all: FamilyList[]; onBack: () => void }) {
  const [key, setKey] = useState<CryptoKey | null>(() => (note.locked ? rememberedKey(note.salt) : null));
  // A new password (or the lock removed) needs the key to match again.
  const salt = note.locked ? note.salt ?? '' : '';
  const [keySalt, setKeySalt] = useState(salt);
  if (keySalt !== salt) {
    setKeySalt(salt);
    setKey(note.locked ? rememberedKey(note.salt) : null);
  }
  // Locks itself again after a while without use.
  useEffect(() => {
    if (!note.locked || !key) return;
    const t = window.setInterval(() => !keyAlive(note.salt ?? '') && setKey(null), 15_000);
    return () => window.clearInterval(t);
  }, [note.salt, note.locked, key]);

  if (note.locked && !key) return <NoteGate note={note} all={all} onBack={onBack} onOpen={setKey} />;
  return (
    <NoteEditor
      key={`${note.id}:${salt}`}
      note={note}
      all={all}
      cryptoKey={note.locked ? key : null}
      onBack={onBack}
      lockNow={() => { forgetKey(note.salt ?? ''); setKey(null); }}
    />
  );
}

// A receipt goes back to the main screen, where "קבלות" is a section rather than a folder.
const backLabel = (note: FamilyList, all: FamilyList[]) =>
  (note.parentId && note.parentId !== receiptsFolder(all)?.id && all.find((l) => l.id === note.parentId && l.kind === 'folder')?.title) || 'כל הפתקים';

function NoteGate({ note, all, onBack, onOpen }: { note: FamilyList; all: FamilyList[]; onBack: () => void; onOpen: (k: CryptoKey) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const k = await deriveKey(password, note.salt ?? '');
      await decryptText(k, note.body ?? '');
      rememberKey(note.salt ?? '', k);
      onOpen(k);
    } catch {
      setError('הסיסמה לא נכונה');
      setBusy(false);
    }
  };
  return (
    <>
      <button className="link back" onClick={onBack}>→ {backLabel(note, all)}</button>
      <div className="list-hero">
        <span className="list-emoji" aria-hidden="true"><ListIcon value={note.emoji} /></span>
        <div className="list-hero-main">
          <h2 className="list-title">{note.title}</h2>
          <p className="muted list-sum"><LockMark />פתק נעול בסיסמה</p>
        </div>
      </div>
      <form className="card note-gate" onSubmit={(e) => { e.preventDefault(); if (password) open(); }}>
        <label>
          <span className="field-label">הסיסמה של הפתק</span>
          <input className="full" type="password" autoComplete="off" value={password} autoFocus aria-label="סיסמת הפתק" onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={!password || busy}>{busy ? 'פותח…' : <><LockMark kind="open" />פתיחה</>}</button>
        <p className="muted note-hint">את הסיסמה מקבלים ממי שנעל את הפתק. היא לא נשמרת בשום מקום, וגם אנחנו לא יכולים לשחזר אותה.</p>
      </form>
    </>
  );
}

/** The text of a note, decrypted when it is locked (undefined while working). */
function usePlainBody(note: FamilyList, key: CryptoKey | null) {
  const [plain, setPlain] = useState<string | undefined>(key ? undefined : note.body ?? '');
  useEffect(() => {
    if (!key) {
      setPlain(note.body ?? '');
      return;
    }
    let live = true;
    decryptText(key, note.body ?? '').then((t) => live && setPlain(t), () => live && setPlain(undefined));
    return () => { live = false; };
  }, [note.body, key]);
  return plain;
}

/** Each file's picture, decrypted when the note is locked. */
function useFileImages(files: NoteFile[] | undefined, key: CryptoKey | null) {
  const [images, setImages] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    const next = new Map<string, string>();
    Promise.all(
      (files ?? []).map(async (f) => {
        if (f.image) next.set(f.id, f.image);
        else if (key && f.secret && f.iv) {
          const cached = images.get(f.id);
          next.set(f.id, cached ?? (await decryptImage(key, f.secret, f.iv).catch(() => '')));
        }
      }),
    ).then(() => live && setImages(next));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, key]);
  return images;
}

/** A free-text note the family edits, with PDFs or photos attached. */
function NoteEditor({
  note,
  all,
  cryptoKey,
  onBack,
  lockNow,
}: {
  note: FamilyList;
  all: FamilyList[];
  cryptoKey: CryptoKey | null;
  onBack: () => void;
  lockNow: () => void;
}) {
  const { familyId, me } = useFamily();
  const files = useNoteFiles(familyId, note);
  const images = useFileImages(files, cryptoKey);
  const remotePlain = usePlainBody(note, cryptoKey);
  const [body, setBody] = useState(remotePlain ?? '');
  const [ready, setReady] = useState(remotePlain !== undefined);
  const [saved, setSaved] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [locking, setLocking] = useState<{ a: string; b: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  // The formatting buttons show while a word (or more) is selected in the note.
  // A word can also be picked on the formatted view (long press), without opening the keyboard.
  const [selected, setSelected] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const [viewSel, setViewSel] = useState<{ start: number; end: number } | null>(null);
  useEffect(() => {
    const check = () => {
      const el = bodyRef.current;
      setSelected(!!el && document.activeElement === el && el.selectionStart !== el.selectionEnd);
      setViewSel((old) => {
        const now = viewSelection(viewRef.current);
        return old && now && old.start === now.start && old.end === now.end ? old : now;
      });
    };
    const el = bodyRef.current;
    document.addEventListener('selectionchange', check);
    const events = ['select', 'keyup', 'mouseup', 'touchend'] as const;
    events.forEach((ev) => el?.addEventListener(ev, check));
    return () => {
      document.removeEventListener('selectionchange', check);
      events.forEach((ev) => el?.removeEventListener(ev, check));
    };
  }, [ready]);
  const editing = useRef(false);
  const timer = useRef<number>();
  const latest = useRef(body);
  const remote = useRef(remotePlain ?? '');
  if (remotePlain !== undefined) remote.current = remotePlain;
  const gone = useRef(false);
  const mine = note.createdBy === me.id;

  // Someone else's change shows up unless I am in the middle of typing.
  useEffect(() => {
    if (remotePlain === undefined) return;
    if (!ready || (!editing.current && saved)) {
      setBody(remotePlain);
      latest.current = remotePlain;
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remotePlain]);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!gone.current && latest.current !== remote.current) {
      const text = latest.current.slice(0, MAX_NOTE);
      if (cryptoKey) encryptText(cryptoKey, text).then((c) => { if (!gone.current) saveNoteBody(familyId, note, c); });
      else saveNoteBody(familyId, note, text);
    }
    setSaved(true);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: string) => {
    setBody(v);
    latest.current = v;
    setSaved(false);
    touchKey(note.salt ?? '');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  };

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError('');
    for (const f of Array.from(list)) {
      try {
        const image = await scheduleImage(f);
        await addNoteFile(familyId, note, cryptoKey ? await encryptImage(cryptoKey, image) : { image }, f.name);
      } catch {
        setError(`לא הצלחנו לצרף את "${f.name}". אפשר PDF (עד 3 עמודים ראשונים) או תמונה.`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const allImages = (files ?? []).every((f) => images.get(f.id));
  const lock = async () => {
    if (!locking || locking.a.length < 4 || locking.a !== locking.b || !files || !allImages) return;
    setBusy(true);
    const salt = newSalt();
    const k = await deriveKey(locking.a, salt);
    const text = await encryptText(k, latest.current.slice(0, MAX_NOTE));
    const enc = await Promise.all(files.map(async (f) => ({ file: f, content: await encryptImage(k, images.get(f.id)!) })));
    gone.current = true;
    window.clearTimeout(timer.current);
    rememberKey(salt, k);
    relockNote(familyId, note, { salt, body: text }, enc);
  };
  const unlock = () => {
    if (!files || !allImages) return;
    if (!confirm('להסיר את הסיסמה? הפתק והקבצים יישמרו שוב בלי הצפנה.')) return;
    gone.current = true;
    window.clearTimeout(timer.current);
    forgetKey(note.salt ?? '');
    relockNote(familyId, note, { body: latest.current.slice(0, MAX_NOTE) }, files.map((f) => ({ file: f, content: { image: images.get(f.id)! } })));
  };

  // Moving into or out of a locked folder re-encrypts the note with that folder's password (or opens it up).
  const moveTo = async (target: string) => {
    const lock = lockOf(all, target);
    if (lock ? note.lockFolder === lock.id : !note.lockFolder) {
      updateNote(familyId, note, { parentId: target });
      return;
    }
    if (!files || !allImages || !ready) return setError('רגע, הפתק עוד נטען');
    const k = lock ? rememberedKey(lock.salt) : null;
    if (lock && !k) return setError(`קודם פותחים את התיקייה "${lock.title}" עם הסיסמה שלה`);
    setBusy(true);
    const text = latest.current.slice(0, MAX_NOTE);
    const moved = k
      ? await Promise.all(files.map(async (f) => ({ file: f, content: (await encryptImage(k, images.get(f.id)!)) as FileContent })))
      : files.map((f) => ({ file: f, content: { image: images.get(f.id)! } as FileContent }));
    gone.current = true;
    window.clearTimeout(timer.current);
    relockNote(
      familyId,
      note,
      k && lock ? { salt: lock.salt!, body: await encryptText(k, text), lockFolder: lock.id } : { body: text },
      moved,
      { parentId: target },
    );
  };

  const zoomed = zoom ? files?.find((f) => f.id === zoom) : undefined;

  return (
    <>
      <button className="link back" onClick={() => { flush(); onBack(); }}>→ {backLabel(note, all)}</button>

      <div className="list-hero">
        <IconButton value={note.emoji} open={picking} setOpen={setPicking} onPick={(v) => updateNote(familyId, note, { emoji: v })} />
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
              <NameField label="שם הפתק" value={renaming} onChange={setRenaming} />
              <button className="small primary">שמירה</button>
            </form>
          ) : (
            <h2 className="list-title">
              <button className="link-plain" aria-label="שינוי שם הפתק" onClick={() => setRenaming(note.title)}>
                {note.title}
              </button>
            </h2>
          )}
          <p className="muted list-sum">
            {note.pinned && <><InlineIcon icon={Pin} size={14} />נעוץ · </>}
            {!saved ? 'שומר…' : note.lockFolder ? <><LockMark />בתיקייה נעולה, פתוח כרגע</> : note.locked ? <><LockMark />נעול בסיסמה, פתוח כרגע</> : note.viewers ? <><LockMark kind="private" />פתק פרטי</> : 'פתק משפחתי, כולם יכולים לערוך'}
          </p>
        </div>
        <MoreMenu
          title={note.title}
          items={[
            { label: 'שינוי שם', icon: <Pencil size={20} />, onClick: () => setRenaming(note.title) },
            { label: 'החלפת הסמל', icon: <Shapes size={20} />, onClick: () => setPicking(true) },
            note.pinned
              ? { label: 'ביטול נעיצה', icon: <PinOff size={20} />, onClick: () => updateNote(familyId, note, { pinned: false }) }
              : { label: 'נעיצה למעלה', icon: <Pin size={20} />, onClick: () => updateNote(familyId, note, { pinned: true }) },
            { label: 'העברה לתיקייה', icon: <FolderInput size={20} />, disabled: busy, onClick: () => setMoving(true) },
            {
              label: 'שיתוף בווטסאפ',
              icon: <Icon name="whatsapp" size={20} />,
              onClick: async () => {
                flush();
                const body = latest.current;
                // A locked note (or one in a locked folder) is open here only after its password; ask once more before it leaves the app.
                if ((note.locked || note.lockFolder) && !(await confirmAsk('הפתק נעול, לשתף בכל זאת?', 'התוכן יישלח לווטסאפ ויהיה גלוי למי שיקבל אותו.', 'כן, לשתף', <Icon name="whatsapp" size={26} />))) return;
                shareItem({ ...note, body }, []);
              },
            },
            note.locked && { label: 'נעילה עכשיו', icon: <Lock size={20} />, onClick: () => { flush(); lockNow(); } },
            note.locked && mine && !note.lockFolder && { label: 'הסרת הסיסמה', icon: <LockOpen size={20} />, disabled: !allImages, onClick: unlock },
            !note.locked && mine && !locking && { label: 'נעילה בסיסמה', icon: <KeyRound size={20} />, onClick: () => setLocking({ a: '', b: '' }) },
            {
              label: 'מחיקת הפתק',
              icon: <Trash2 size={20} />,
              danger: true,
              onClick: () => {
                confirmDelete(`למחוק את הפתק "${note.title}"?`, 'הפתק וכל הקבצים שבו יימחקו לכל המשפחה. אי אפשר לבטל.').then((ok) => {
                  if (!ok) return;
                  window.clearTimeout(timer.current);
                  gone.current = true;
                  deleteNote(familyId, note, files ?? []);
                  onBack();
                });
              },
            },
          ]}
        />
      </div>

      <WhoSees note={note} files={files} />

      {/* Above the note, so on a long note it stays in sight (it sticks to the top while scrolling). */}
      {!focused && viewSel && <FormatBar target={bodyRef} onChange={change} range={viewSel} />}
      {/* Formatted when not typing; the text box stays in the page so a tap opens the keyboard at once. */}
      {ready && !focused && hasFormatting(body) && (
        <NoteView
          viewRef={viewRef}
          text={body}
          onEdit={() => {
            const el = bodyRef.current;
            if (!el || viewSelection(viewRef.current)) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }}
          onToggle={(i) => change(toggleCheck(latest.current, i))}
        />
      )}
      {focused && selected && <FormatBar target={bodyRef} onChange={change} />}
      <textarea
        ref={bodyRef}
        className={`note-body ${ready && !focused && hasFormatting(body) ? 'note-editor-hidden' : ''}`}
        aria-label="תוכן הפתק"
        placeholder={ready ? 'כותבים כאן כל מה שצריך: מספרי טלפון, הוראות, קודים…' : 'פותח…'}
        value={body}
        disabled={!ready}
        maxLength={MAX_NOTE}
        onFocus={() => { editing.current = true; setFocused(true); }}
        onBlur={() => { editing.current = false; setFocused(false); flush(); }}
        onChange={(e) => change(e.target.value)}
      />

      <section className="note-files" aria-label="קבצים מצורפים">
        <div className="list-section-head">
          <h3><InlineIcon icon={Paperclip} size={16} />קבצים</h3>
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
                <button className="note-thumb" aria-label={`הגדלת ${f.name}`} disabled={!images.get(f.id)} onClick={() => setZoom(f.id)}>
                  {images.get(f.id) ? <img src={images.get(f.id)} alt="" /> : <span className="muted"><LockMark /></span>}
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
          {busy ? 'רגע…' : inReceipts(all, note.parentId) ? '+ צילום הקבלה' : '+ צירוף PDF או תמונה'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted note-hint">מקובץ PDF נשמרים 3 העמודים הראשונים, כתמונה.</p>
      </section>

      {zoomed && images.get(zoomed.id) && <ZoomViewer src={images.get(zoomed.id)!} alt={zoomed.name} onClose={() => setZoom(null)} />}

      {moving && <MoveSheet all={all} note={note} onPick={moveTo} onClose={() => setMoving(false)} />}

      {locking && (
        <form className="card note-lock" onSubmit={(e) => { e.preventDefault(); lock(); }}>
          <strong><LockMark />נעילת הפתק בסיסמה</strong>
          <input type="password" autoComplete="new-password" placeholder="סיסמה (לפחות 4 תווים)" aria-label="סיסמה חדשה" value={locking.a} autoFocus onChange={(e) => setLocking({ ...locking, a: e.target.value })} />
          <input type="password" autoComplete="new-password" placeholder="שוב, לאימות" aria-label="אימות הסיסמה" value={locking.b} onChange={(e) => setLocking({ ...locking, b: e.target.value })} />
          {locking.b && locking.a !== locking.b && <p className="error">הסיסמאות לא זהות</p>}
          <p className="muted note-hint">
            הטקסט והקבצים יוצפנו כבר בטלפון. כדי שבני משפחה יוכלו לפתוח את הפתק, צריך למסור להם את הסיסמה.
            <strong> סיסמה שנשכחה אי אפשר לשחזר, והפתק יאבד.</strong> שם הפתק לא מוצפן.
          </p>
          <div className="sheet-actions">
            <button className="primary" disabled={busy || locking.a.length < 4 || locking.a !== locking.b || !allImages}>{busy ? 'מצפין…' : 'נעילה'}</button>
            <button type="button" onClick={() => setLocking(null)}>ביטול</button>
          </div>
        </form>
      )}

    </>
  );
}

/** The big icon at the top of a list or note; tapping it opens the icon choice. */
function IconButton({ value, onPick, open, setOpen }: { value: string; onPick: (value: string) => void; open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <>
      <button className="list-emoji icon-change" aria-label="החלפת הסמל" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ListIcon value={value} />
      </button>
      {open && (
        <div className="icon-sheet card">
          <div className="icon-sheet-head">
            <strong>בחירת סמל</strong>
            <button className="link" onClick={() => setOpen(false)}>סגירה</button>
          </div>
          <IconPicker value={value} onPick={(v) => { onPick(v); setOpen(false); }} />
        </div>
      )}
    </>
  );
}

/** Text for WhatsApp: the title, then each section; ticked lines get ✅. */
export function listText(list: FamilyList, sections: { name: string; rows: ListEntry[] }[]) {
  const lines = [`${iconEmoji(list.emoji)} *${list.title}*`];
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
