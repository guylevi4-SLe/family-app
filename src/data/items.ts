import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { OTHER, guessDepartment, normalize } from './departments';

export interface Item {
  id: string;
  name: string;
  norm: string;
  qty: string;
  category: string;
  checked: boolean;
  deleted: boolean;
  /** 'high' = דחוף, 'low' = לא דחוף; empty or missing = רגיל. */
  urgency?: Urgency;
  addedAt?: Timestamp | null;
  /** When it was last marked bought; older items don't have it. */
  checkedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  updatedBy: string;
  pending: boolean;
}

/** How a quantity shows: a bare number is a count of units ("2" → "2 יח׳"); anything else as typed. */
export function qtyLabel(qty: string) {
  return /^\d+$/.test(qty.trim()) ? `${qty.trim()} יח׳` : qty;
}

export type Urgency = '' | 'high' | 'low';

/** Urgent items first, "not urgent" ones last; otherwise in the order they were added. */
export function byUrgency(a: Item, b: Item) {
  const rank = (i: Item) => (i.urgency === 'high' ? 0 : i.urgency === 'low' ? 2 : 1);
  return rank(a) - rank(b) || (a.addedAt?.toMillis() ?? Infinity) - (b.addedAt?.toMillis() ?? Infinity);
}

export { parseItems, type ParsedItem } from './parse';
import type { ParsedItem } from './parse';

/** Firestore document id for a product: its normalized name, made path-safe. */
export function itemId(norm: string): string {
  const id = norm.replace(/\//g, '∕').replace(/^\.+$/, '_').slice(0, 120);
  return id.startsWith('__') ? `_${id}` : id;
}

const itemsCol = (fid: string) => collection(db, 'families', fid, 'items');

/**
 * Adds products. Because the id is the normalized name, two people adding
 * "חלב" offline end up with one item, and re-adding a bought or deleted item
 * brings it back. Only the fields written here change, so concurrent edits
 * to other fields are kept.
 */
export function addItems(
  fid: string,
  parsed: ParsedItem[],
  existing: Map<string, Item>,
  overrides: Map<string, string>,
) {
  const uid = auth.currentUser!.uid;
  const batch = writeBatch(db);
  for (const p of parsed) {
    const norm = normalize(p.name);
    const id = itemId(norm);
    const prev = existing.get(id);
    const active = prev && !prev.checked && !prev.deleted;
    batch.set(
      doc(itemsCol(fid), id),
      {
        name: p.name,
        norm,
        // Already on the list: keep its quantity unless a new one was typed.
        qty: p.qty || (active ? prev.qty : ''),
        category: prev?.category && prev.category !== OTHER ? prev.category : guessDepartment(norm, overrides),
        checked: false,
        deleted: false,
        // Bought or deleted before: it comes back as a plain item, not urgent from last time.
        ...(active ? {} : { addedAt: serverTimestamp(), urgency: '' }),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }
  // Writes are queued locally when offline; don't wait for the server.
  batch.commit().catch(reportWriteError);
}

export function updateItem(fid: string, id: string, fields: Partial<Pick<Item, 'name' | 'qty' | 'category' | 'checked' | 'deleted' | 'urgency'>>) {
  updateDoc(doc(itemsCol(fid), id), {
    ...fields,
    ...(fields.checked ? { checkedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser!.uid,
  }).catch(reportWriteError);
}

/** Remembers a department correction for this family and applies it. */
export function setCategory(fid: string, item: Item, category: string) {
  setDoc(doc(db, 'families', fid, 'categoryOverrides', itemId(item.norm)), { category }).catch(reportWriteError);
  updateItem(fid, item.id, { category });
}

export function clearChecked(fid: string, items: Item[]) {
  const batch = writeBatch(db);
  const uid = auth.currentUser!.uid;
  for (const it of items) {
    batch.update(doc(itemsCol(fid), it.id), { deleted: true, updatedAt: serverTimestamp(), updatedBy: uid });
  }
  batch.commit().catch(reportWriteError);
}

/** Removes an item from "recently deleted" for good. */
export function purgeItem(fid: string, id: string) {
  deleteDoc(doc(itemsCol(fid), id)).catch(reportWriteError);
}

export function reportWriteError(e: unknown) {
  console.error('write rejected', e);
  window.dispatchEvent(new CustomEvent('write-error', { detail: String(e) }));
}
