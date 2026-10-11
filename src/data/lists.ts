import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

/** A named checklist ("תיק למכון", "ציוד לטיול"). Its lines live in listEntries. */
export interface FamilyList {
  id: string;
  title: string;
  emoji: string;
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

export function updateList(fid: string, id: string, fields: Partial<Pick<FamilyList, 'title' | 'emoji'>>) {
  updateDoc(doc(listsCol(fid), id), { ...fields, ...stamp() }).catch(reportWriteError);
}

/** Removes the list and every line in it. */
export function deleteList(fid: string, id: string, entries: ListEntry[]) {
  const b = writeBatch(db);
  for (const e of entries) b.delete(doc(entriesCol(fid), e.id));
  b.delete(doc(listsCol(fid), id));
  b.commit().catch(reportWriteError);
}

/** Adds one line per comma or new line, after the existing ones. */
export function addEntries(fid: string, listId: string, text: string, after: number) {
  const parts = text.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
  parts.forEach((t, i) =>
    setDoc(doc(entriesCol(fid)), { listId, text: t.slice(0, 120), done: false, order: after + i + 1, ...stamp() }).catch(reportWriteError),
  );
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
