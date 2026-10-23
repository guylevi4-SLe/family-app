import type { Timestamp } from 'firebase/firestore';
import { normalize } from './departments';

/** One price paid for a product, kept apart from the shopping list (whose rows come and go). */
export interface PriceEntry {
  id: string;
  key: string;
  name: string;
  price: number;
  /** 'kg' for a price per kilo (meat, fruit, vegetables); missing means per item. */
  unit?: PriceUnit;
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

export type PriceUnit = '' | 'kg';

/** "₪39.90 לק״ג" for a price per kilo, "₪6.90" otherwise. */
export const priceLabel = (e: Pick<PriceEntry, 'price' | 'unit'>) => `${formatPrice(e.price)}${e.unit === 'kg' ? ' לק״ג' : ''}`;

/** Departments whose products are usually sold by weight. */
const BY_WEIGHT = new Set(['פירות וירקות', 'בשר עוף ודגים']);

/** The unit a new price starts with: the one used last for this product, else by weight for produce and meat. */
export function defaultUnit(last: PriceEntry | undefined, category: string): PriceUnit {
  if (last) return last.unit ?? '';
  return BY_WEIGHT.has(category) ? 'kg' : '';
}

/** The cheapest price of each unit that has more than one price; per kilo and per item are never compared. */
export function cheapestByUnit(history: PriceEntry[]) {
  const best = new Map<PriceUnit, number>();
  const count = new Map<PriceUnit, number>();
  for (const h of history) {
    const u = h.unit ?? '';
    count.set(u, (count.get(u) ?? 0) + 1);
    best.set(u, Math.min(best.get(u) ?? Infinity, h.price));
  }
  return (h: PriceEntry) => (count.get(h.unit ?? '') ?? 0) > 1 && h.price === best.get(h.unit ?? '');
}

const NUMBER_WORDS: Record<string, number> = {
  חצי: 0.5, רבע: 0.25, אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5,
};
const KILO = new Set(['קילו', 'ק"ג', 'קג', "ק'ג", 'קילוגרם', 'קילוגרמים']);
const GRAM = new Set(['גרם', 'גר', "גר'"]);

/** Kilos in a typed quantity ("1.5 ק״ג", "חצי קילו", "קילו וחצי", "500 גרם"), or null when it is not a weight. */
export function weightKg(qty: string): number | null {
  const tokens = qty
    .replace(/[״”]/g, '"').replace(/[׳`]/g, "'")
    .replace(/(\d)(?=[א-ת])/g, '$1 ')
    .trim().split(/\s+/);
  let amount: number | null = null;
  let kg: number | null = null;
  for (const t of tokens) {
    const n = /^\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NUMBER_WORDS[t];
    const half = t === 'וחצי' ? 0.5 : t === 'ורבע' ? 0.25 : 0;
    if (kg === null && amount === null && n !== undefined) amount = n;
    else if (kg === null && KILO.has(t)) kg = amount ?? 1;
    else if (kg === null && amount !== null && GRAM.has(t)) kg = amount / 1000;
    // "1 וחצי קילו" and "קילו וחצי".
    else if (half && kg === null && amount !== null) amount += half;
    else if (half && kg !== null) kg += half;
    else return null;
  }
  return kg && kg > 0 && kg < 1000 ? kg : null;
}

/** About what this quantity costs at a price per kilo ("1.5 ק״ג" at ₪40 → 60), or null. */
export function estimateTotal(qty: string, last: PriceEntry | undefined): number | null {
  if (last?.unit !== 'kg') return null;
  const kg = weightKg(qty);
  return kg ? Math.round(kg * last.price) : null;
}

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
