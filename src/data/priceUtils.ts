import type { Timestamp } from 'firebase/firestore';
import { normalize } from './departments';

/** One price paid for a product, kept apart from the shopping list (whose rows come and go). */
export interface PriceEntry {
  id: string;
  key: string;
  name: string;
  price: number;
  store: string;
  at?: Timestamp | null;
  by: string;
}

/** Products match by name, forgiving spacing and geresh: "קוטג'" and "קוטג" are one product. */
export function priceKey(name: string): string {
  return normalize(name).replace(/['"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** "6.90" from a typed price ("6.9", "6,90", "₪7"), or null. */
export function parsePrice(text: string): number | null {
  const n = Number(text.replace(/[₪\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

export const formatPrice = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;

const time = (e: PriceEntry) => e.at?.toMillis() ?? Date.now();

/** Every product's prices, newest first. */
export function pricesByKey(entries: PriceEntry[] | undefined) {
  const map = new Map<string, PriceEntry[]>();
  for (const e of [...(entries ?? [])].sort((a, b) => time(b) - time(a))) {
    if (!map.has(e.key)) map.set(e.key, []);
    map.get(e.key)!.push(e);
  }
  return map;
}

/** Stores the family has used, most recent first. */
export function knownStores(entries: PriceEntry[] | undefined): string[] {
  const seen = new Set<string>();
  for (const e of [...(entries ?? [])].sort((a, b) => time(b) - time(a))) if (e.store) seen.add(e.store);
  return [...seen];
}

/**
 * Kinds bought before that start with this name: for "קוטג'", the
 * "קוטג' 3%" and "קוטג' טרה" that have prices.
 */
export function similarKinds(name: string, byKey: Map<string, PriceEntry[]>) {
  const key = priceKey(name);
  if (!key) return [];
  return [...byKey.entries()]
    .filter(([k]) => k !== key && k.startsWith(`${key} `))
    .map(([, list]) => list[0])
    .slice(0, 8);
}

export function ago(e: PriceEntry): string {
  const days = Math.floor((Date.now() - time(e)) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return 'לפני שבוע';
  if (days < 60) return `לפני ${Math.round(days / 7)} שבועות`;
  return `לפני ${Math.round(days / 30)} חודשים`;
}
