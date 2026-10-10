import {
  collection,
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
  addedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  updatedBy: string;
  pending: boolean;
}

export interface ParsedItem {
  name: string;
  qty: string;
}

const UNIT = String.raw`(?:ק"ג|קג|ק'ג|קילו|גרם|גר'?|ליטר|ל'|מ"ל|יח'?|יחידות|חבילות|חבילה|בקבוקים|בקבוק|קופסאות|קופסה|שקיות|שקית)`;
const TRAILING_QTY = new RegExp(String.raw`^(.*?)\s*(?:x|X|×)?\s*(\d+(?:[.,]\d+)?\s*${UNIT}?)$`);
const LEADING_QTY = new RegExp(String.raw`^(\d+(?:[.,]\d+)?\s*${UNIT}?)\s+(.+)$`);

/**
 * Splits free text into products. Accepts one per line or comma-separated,
 * with an optional quantity before or after the name: "חלב 2", "2 ק"ג עגבניות".
 */
export function parseItems(text: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,،;]+/)) {
    const part = raw.replace(/^[\s\-•*·]+/, '').trim();
    if (!part) continue;
    let name = part;
    let qty = '';
    const lead = part.match(LEADING_QTY);
    const trail = part.match(TRAILING_QTY);
    if (lead) {
      qty = lead[1].trim();
      name = lead[2].trim();
    } else if (trail && trail[1].trim()) {
      name = trail[1].trim();
      qty = trail[2].trim();
    }
    // Names like "חלב 3%" are a product, not a quantity.
    if (/%$/.test(part)) {
      name = part;
      qty = '';
    }
    const norm = normalize(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ name: name.slice(0, 80), qty: qty.slice(0, 30) });
  }
  return out;
}

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
        ...(active ? {} : { addedAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }
  // Writes are queued locally when offline; don't wait for the server.
  batch.commit().catch(reportWriteError);
}

export function updateItem(fid: string, id: string, fields: Partial<Pick<Item, 'name' | 'qty' | 'category' | 'checked' | 'deleted'>>) {
  updateDoc(doc(itemsCol(fid), id), {
    ...fields,
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

export function reportWriteError(e: unknown) {
  console.error('write rejected', e);
  window.dispatchEvent(new CustomEvent('write-error', { detail: String(e) }));
}
