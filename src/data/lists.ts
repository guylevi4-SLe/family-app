import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

/** A named checklist ("תיק למכון", "ציוד לטיול"). Its lines live in listEntries. */
export interface FamilyList {
  id: string;
  title: string;
  emoji: string;
  /** Section names in order ("ביגוד", "רחצה"); lines without one show first. */
  categories?: string[];
  /** 'note' is a free-text note (פתק), 'folder' a notebook folder; neither is a checklist. */
  kind?: 'note' | 'folder';
  /** The notebook folder a note or folder sits in ('' or missing: the notebook's top). */
  parentId?: string;
  /** The note's text, edited by the whole family. */
  body?: string;
  /** Pinned notes and lists show first. */
  pinned?: boolean;
  /**
   * Only on private notes: who may see it (always including its creator).
   * Private notes live in their own collection, guarded by the rules.
   */
  viewers?: string[];
  /** Password-locked: `body` and the files are ciphertext, the key comes from the password and `salt`. */
  locked?: boolean;
  salt?: string;
  /** A note locked by the folder it sits in: that folder's id (its salt is the note's salt). */
  lockFolder?: string;
  createdBy: string;
  createdAt?: Timestamp | null;
  pending: boolean;
}

export interface ListEntry {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  order: number;
  category?: string;
  pending: boolean;
}

/** Name ideas offered when creating a list; each picks its icon ("i:<key>", see ListIcon). */
export const LIST_IDEAS = [
  { title: 'תיק למכון', emoji: 'i:dumbbell' },
  { title: 'ציוד לטיול', emoji: 'i:tent' },
  { title: 'דברים לטיסה', emoji: 'i:plane' },
  { title: 'ים / בריכה', emoji: 'i:beach' },
  { title: 'לפני שיוצאים מהבית', emoji: 'i:key' },
];

/** A PDF or photo attached to a note, kept as a JPEG (one document per file). */
export interface NoteFile {
  id: string;
  noteId: string;
  /** A JPEG data URL, or (in a locked note) `secret` + `iv`: the encrypted JPEG. */
  image?: string;
  secret?: string;
  iv?: string;
  name: string;
  createdBy: string;
  createdAt?: Timestamp | null;
  pending: boolean;
}

export const MAX_NOTE = 5000;

/** Pinned first, then by name. */
export const byPinThenTitle = (a: FamilyList, b: FamilyList) =>
  Number(!!b.pinned) - Number(!!a.pinned) || a.title.localeCompare(b.title, 'he');

const listsCol = (fid: string) => collection(db, 'families', fid, 'lists');
const entriesCol = (fid: string) => collection(db, 'families', fid, 'listEntries');
const filesCol = (fid: string) => collection(db, 'families', fid, 'noteFiles');
const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid });

export function createList(fid: string, title: string, emoji: string) {
  const ref = doc(listsCol(fid));
  setDoc(ref, {
    title: title.trim().slice(0, 60),
    emoji,
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
    ...stamp(),
  }).catch(reportWriteError);
  return ref.id;
}

export function createNote(
  fid: string,
  title: string,
  emoji: string,
  parentId = '',
  lock?: { salt: string; body: string; lockFolder: string },
) {
  const ref = doc(listsCol(fid));
  setDoc(ref, {
    title: title.trim().slice(0, 60),
    emoji,
    kind: 'note',
    body: '',
    parentId,
    ...(lock ? { locked: true, ...lock } : {}),
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
    ...stamp(),
  }).catch(reportWriteError);
  return ref.id;
}

export function createFolder(fid: string, title: string, parentId = '') {
  const ref = doc(listsCol(fid));
  setDoc(ref, {
    title: title.trim().slice(0, 60),
    emoji: 'i:folder',
    kind: 'folder',
    parentId,
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
    ...stamp(),
  }).catch(reportWriteError);
  return ref.id;
}

/** The locked folder a folder sits under (itself included), if any: its password locks everything inside. */
export function lockOf(all: FamilyList[], folderId: string | undefined) {
  let cur = folderId ? all.find((l) => l.id === folderId && l.kind === 'folder') : undefined;
  for (let guard = 0; cur && guard < 20; guard++) {
    if (cur.locked && cur.salt) return cur;
    cur = cur.parentId ? all.find((l) => l.id === cur!.parentId && l.kind === 'folder') : undefined;
  }
  return null;
}

/** Locks a folder (its salt, and a known text encrypted with its key to check the password) or unlocks it. */
export function setFolderLock(fid: string, folderId: string, lock: { salt: string; check: string } | null) {
  updateDoc(doc(listsCol(fid), folderId), {
    locked: !!lock,
    salt: lock?.salt ?? '',
    body: lock?.check ?? '',
    ...stamp(),
  }).catch(reportWriteError);
}

/** "בית › ביטוחים": the folder's name with its parents, for pickers. */
export function folderPath(all: FamilyList[], id: string) {
  const names: string[] = [];
  let cur = all.find((l) => l.id === id);
  for (let guard = 0; cur && guard < 20; guard++) {
    names.unshift(cur.title);
    cur = cur.parentId ? all.find((l) => l.id === cur!.parentId) : undefined;
  }
  return names;
}

const privCol = (fid: string) => collection(db, 'families', fid, 'privateNotes');
const privFilesCol = (fid: string, noteId: string) => collection(db, 'families', fid, 'privateNotes', noteId, 'files');
type NoteRef = Pick<FamilyList, 'id' | 'viewers'>;
const noteDoc = (fid: string, note: NoteRef) => doc(note.viewers ? privCol(fid) : listsCol(fid), note.id);
const fileDoc = (fid: string, note: NoteRef, fileId: string) =>
  doc(note.viewers ? privFilesCol(fid, note.id) : filesCol(fid), fileId);

/** Private notes I am allowed to see. */
export const privateNotesQuery = (fid: string, uid: string) => query(privCol(fid), where('viewers', 'array-contains', uid));

/** One note's attached files (family notes share one collection, a private note keeps its own). */
export const noteFilesQuery = (fid: string, note: NoteRef) =>
  note.viewers ? query(privFilesCol(fid, note.id)) : query(filesCol(fid), where('noteId', '==', note.id));

/** One note's files, read once (to re-encrypt a note that is not open). */
export async function fetchNoteFiles(fid: string, note: NoteRef): Promise<NoteFile[]> {
  const snap = await getDocs(noteFilesQuery(fid, note));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NoteFile, 'id' | 'pending' | 'noteId'>), noteId: note.id, pending: false }));
}

/** Saves the text as given (a locked note's caller passes ciphertext). */
export function saveNoteBody(fid: string, note: NoteRef, body: string) {
  return updateDoc(noteDoc(fid, note), { body, ...stamp() }).catch(reportWriteError);
}

/** A file's stored content: a plain JPEG, or the encrypted one. */
export type FileContent = { image: string } | { secret: string; iv: string };
const contentOf = (f: NoteFile): FileContent => (f.secret ? { secret: f.secret, iv: f.iv! } : { image: f.image! });

/**
 * Locks a note (key given) or unlocks it (key null): the text and every file
 * are rewritten in their new form, each file as a new document replacing the old.
 */
export function relockNote(
  fid: string,
  note: NoteRef,
  lock: { salt: string; body: string; lockFolder?: string } | { body: string },
  files: { file: NoteFile; content: FileContent }[],
  extra: Partial<Pick<FamilyList, 'parentId'>> = {},
) {
  const fail = reportWriteError;
  const salt = 'salt' in lock ? lock.salt : '';
  const lockFolder = 'salt' in lock ? lock.lockFolder ?? '' : '';
  updateDoc(noteDoc(fid, note), { locked: !!salt, salt, lockFolder, body: lock.body, ...extra, ...stamp() }).catch(fail);
  for (const { file, content } of files) {
    setDoc(doc(note.viewers ? privFilesCol(fid, note.id) : filesCol(fid)), {
      ...(note.viewers ? {} : { noteId: note.id }),
      ...content,
      name: file.name,
      createdBy: file.createdBy,
      createdAt: file.createdAt ?? serverTimestamp(),
    }).catch(fail);
    deleteDoc(fileDoc(fid, note, file.id)).catch(fail);
  }
}

export function updateNote(fid: string, note: NoteRef, fields: Partial<Pick<FamilyList, 'title' | 'emoji' | 'pinned' | 'parentId'>>) {
  updateDoc(noteDoc(fid, note), { ...fields, ...stamp() }).catch(reportWriteError);
}

export function addNoteFile(fid: string, note: NoteRef, content: FileContent, name: string) {
  return setDoc(doc(note.viewers ? privFilesCol(fid, note.id) : filesCol(fid)), {
    ...(note.viewers ? {} : { noteId: note.id }),
    ...content,
    name: name.slice(0, 120),
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
  }).catch(reportWriteError);
}

export function deleteNoteFile(fid: string, note: NoteRef, id: string) {
  deleteDoc(fileDoc(fid, note, id)).catch(reportWriteError);
}

export function deleteNote(fid: string, note: NoteRef, files: Pick<NoteFile, 'id'>[]) {
  for (const f of files) deleteDoc(fileDoc(fid, note, f.id)).catch(reportWriteError);
  deleteDoc(noteDoc(fid, note)).catch(reportWriteError);
}

/**
 * Changes who sees a note: null for the whole family, or a list of members.
 * Moving between family and private copies the note and its files to the
 * other collection (same ids), then removes the originals. The writes go out
 * in order, so each file copy is checked against a note that already exists.
 */
export function setNoteViewers(fid: string, note: FamilyList, files: NoteFile[], viewers: string[] | null) {
  const fail = reportWriteError;
  if (note.viewers && viewers) {
    updateDoc(noteDoc(fid, note), { viewers, ...stamp() }).catch(fail);
    return;
  }
  if (!note.viewers && !viewers) return;
  const fields = {
    title: note.title,
    emoji: note.emoji,
    kind: 'note',
    body: note.body ?? '',
    pinned: !!note.pinned,
    parentId: note.parentId ?? '',
    ...(note.locked ? { locked: true, salt: note.salt ?? '', lockFolder: note.lockFolder ?? '' } : {}),
    createdBy: note.createdBy,
    createdAt: note.createdAt ?? serverTimestamp(),
    ...stamp(),
  };
  const to: NoteRef = { id: note.id, viewers: viewers ?? undefined };
  setDoc(noteDoc(fid, to), viewers ? { ...fields, viewers } : fields).catch(fail);
  for (const f of files) {
    setDoc(fileDoc(fid, to, f.id), {
      ...(viewers ? {} : { noteId: note.id }),
      ...contentOf(f),
      name: f.name,
      createdBy: f.createdBy,
      createdAt: f.createdAt ?? serverTimestamp(),
    }).catch(fail);
    deleteDoc(fileDoc(fid, note, f.id)).catch(fail);
  }
  deleteDoc(noteDoc(fid, note)).catch(fail);
}

export function updateList(fid: string, id: string, fields: Partial<Pick<FamilyList, 'title' | 'emoji' | 'categories' | 'pinned' | 'parentId'>>) {
  updateDoc(doc(listsCol(fid), id), { ...fields, ...stamp() }).catch(reportWriteError);
}

/** Removes the list (or note) and every line or attached file in it. */
export function deleteList(fid: string, id: string, entries: Pick<ListEntry, 'id'>[], files: Pick<NoteFile, 'id'>[] = []) {
  const b = writeBatch(db);
  for (const e of entries) b.delete(doc(entriesCol(fid), e.id));
  for (const f of files) b.delete(doc(filesCol(fid), f.id));
  b.delete(doc(listsCol(fid), id));
  b.commit().catch(reportWriteError);
}

/** Adds one line per comma or new line, after the existing ones. */
export function addEntries(fid: string, listId: string, text: string, after: number, category = '') {
  const parts = text.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
  return parts.map((t, i) => {
    const ref = doc(entriesCol(fid));
    setDoc(ref, { listId, text: t.slice(0, 120), done: false, order: after + i + 1, category, ...stamp() }).catch(reportWriteError);
    return ref.id;
  });
}

export function moveEntry(fid: string, id: string, category: string) {
  updateDoc(doc(entriesCol(fid), id), { category, ...stamp() }).catch(reportWriteError);
}

/** Renames a section, or removes it (newName null) and moves its lines to the top, unsectioned. */
export function changeCategory(fid: string, list: FamilyList, entries: ListEntry[], oldName: string, newName: string | null) {
  const b = writeBatch(db);
  const cats = list.categories ?? [];
  const next = newName === null ? cats.filter((c) => c !== oldName) : cats.map((c) => (c === oldName ? newName : c));
  b.update(doc(listsCol(fid), list.id), { categories: next, ...stamp() });
  for (const e of entries) if ((e.category ?? '') === oldName) b.update(doc(entriesCol(fid), e.id), { category: newName ?? '', ...stamp() });
  b.commit().catch(reportWriteError);
}

export function setEntryDone(fid: string, id: string, done: boolean) {
  updateDoc(doc(entriesCol(fid), id), { done, ...stamp() }).catch(reportWriteError);
}

export function renameEntry(fid: string, id: string, text: string) {
  updateDoc(doc(entriesCol(fid), id), { text: text.trim().slice(0, 120), ...stamp() }).catch(reportWriteError);
}

export function deleteEntry(fid: string, id: string) {
  deleteDoc(doc(entriesCol(fid), id)).catch(reportWriteError);
}

/** Clears every tick so the list can be used again (next trip, next workout). */
export function resetList(fid: string, entries: ListEntry[]) {
  const b = writeBatch(db);
  for (const e of entries) if (e.done) b.update(doc(entriesCol(fid), e.id), { done: false, ...stamp() });
  b.commit().catch(reportWriteError);
}

/** Puts back a line removed by mistake (same id, so the undo is exact). */
export function restoreEntry(fid: string, e: ListEntry) {
  setDoc(doc(entriesCol(fid), e.id), {
    listId: e.listId,
    text: e.text,
    done: e.done,
    order: e.order,
    category: e.category ?? '',
    ...stamp(),
  }).catch(reportWriteError);
}
