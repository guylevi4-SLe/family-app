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

export const LIST_EMOJIS = ['📋', '🏋️', '🏕️', '✈️', '🏖️', '🎒', '🎁', '🧳', '🏠', '🔑', '🛠️', '🎉'];

const listsCol = (fid: string) => collection(db, 'families', fid, 'lists');
const entriesCol = (fid: string) => collection(db, 'families', fid, 'listEntries');
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

export function updateList(fid: string, id: string, fields: Partial<Pick<FamilyList, 'title' | 'emoji' | 'categories'>>) {
  updateDoc(doc(listsCol(fid), id), { ...fields, ...stamp() }).catch(reportWriteError);
}

/** Removes the list and every line in it. */
export function deleteList(fid: string, id: string, entries: Pick<ListEntry, 'id'>[]) {
  const b = writeBatch(db);
  for (const e of entries) b.delete(doc(entriesCol(fid), e.id));
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
