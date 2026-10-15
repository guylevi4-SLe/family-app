import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
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

/** Name ideas offered when creating a list; each picks its emoji. */
export const LIST_IDEAS = [
  { title: 'תיק למכון', emoji: '🏋️' },
  { title: 'ציוד לטיול', emoji: '🏕️' },
  { title: 'דברים לטיסה', emoji: '✈️' },
  { title: 'ים / בריכה', emoji: '🏖️' },
  { title: 'לפני שיוצאים מהבית', emoji: '🔑' },
];

/** A PDF or photo attached to a note, kept as a JPEG (one document per file). */
export interface NoteFile {
  id: string;
  noteId: string;
  image: string;
  name: string;
  createdBy: string;
  createdAt?: Timestamp | null;
  pending: boolean;
}

export const NOTE_EMOJIS = ['📝', '📌', '💡', '📞', '🏥', '🏫', '🏠', '🚗', '💳', '🎁'];

export const MAX_NOTE = 5000;

export const LIST_EMOJIS = ['📋', '🏋️', '🏕️', '✈️', '🏖️', '🎒', '🎁', '🧳', '🏠', '🔑', '🛠️', '🎉'];

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

export function createNote(fid: string, title: string, emoji: string, parentId = '') {
  const ref = doc(listsCol(fid));
  setDoc(ref, {
    title: title.trim().slice(0, 60),
    emoji,
    kind: 'note',
    body: '',
    parentId,
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
    emoji: '📁',
    kind: 'folder',
    parentId,
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
    ...stamp(),
  }).catch(reportWriteError);
  return ref.id;
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

export function saveNoteBody(fid: string, id: string, body: string) {
  return updateDoc(doc(listsCol(fid), id), { body: body.slice(0, MAX_NOTE), ...stamp() }).catch(reportWriteError);
}

export function addNoteFile(fid: string, noteId: string, image: string, name: string) {
  return setDoc(doc(filesCol(fid)), {
    noteId,
    image,
    name: name.slice(0, 120),
    createdBy: auth.currentUser!.uid,
    createdAt: serverTimestamp(),
  }).catch(reportWriteError);
}

export function deleteNoteFile(fid: string, id: string) {
  deleteDoc(doc(filesCol(fid), id)).catch(reportWriteError);
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
