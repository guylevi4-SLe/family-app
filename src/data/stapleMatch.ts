import { normalize } from './departments';
import type { ParsedItem } from './parse';

interface StapleLike {
  id: string;
  name: string;
  staple?: boolean;
  usualQty?: string;
  checked: boolean;
  deleted: boolean;
}

/**
 * The staple a typed product means: one with exactly that name, or else the only
 * staple whose name starts with the typed words ("נטורינה" → "נטורינה בטעם נטרלי").
 */
export function matchStaple<T extends StapleLike>(name: string, items: Iterable<T>): T | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  const staples = [...items].filter((i) => i.staple);
  const exact = staples.find((s) => normalize(s.name) === n);
  if (exact) return exact;
  const starts = staples.filter((s) => normalize(s.name).startsWith(`${n} `));
  return starts.length === 1 ? starts[0] : undefined;
}

/** Typed products, each one that means a staple put on the list as that staple (its name, its usual quantity). */
export function preferStaples<T extends StapleLike>(parsed: ParsedItem[], items: Iterable<T>): (ParsedItem & { id?: string })[] {
  const all = [...items];
  return parsed.map((p) => {
    const s = matchStaple(p.name, all);
    return s ? { id: s.id, name: s.name, qty: p.qty || s.usualQty || '' } : p;
  });
}

/** Staples not on the list whose name holds what is being typed; ones starting with it first. */
export function suggestStaples<T extends StapleLike>(typed: string, items: Iterable<T>, limit = 3): T[] {
  const n = normalize(typed);
  if (n.length < 2) return [];
  const found = [...items].filter((i) => {
    if (!i.staple || !(i.deleted || i.checked)) return false;
    const name = normalize(i.name);
    return name !== n && name.includes(n);
  });
  const starts = (i: T) => (normalize(i.name).startsWith(n) ? 0 : 1);
  return found.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'he')).slice(0, limit);
}
