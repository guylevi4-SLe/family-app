/** How long a bought item stays under "נקנו בשבוע האחרון" before it leaves the list. */
export const BOUGHT_DAYS = 7;

interface Stamp {
  toMillis(): number;
}

export interface BoughtLike {
  checked: boolean;
  deleted: boolean;
  checkedAt?: Stamp | null;
  updatedAt?: Stamp | null;
}

/**
 * When the item was marked bought. Items ticked before checkedAt existed, or
 * by a device still running an older version, fall back to updatedAt; the
 * later of the two is used so a stale checkedAt never expires an item early.
 * A timestamp still waiting for the server counts as now.
 */
export function boughtAt(it: BoughtLike, now: number): number {
  const checked = it.checkedAt?.toMillis() ?? 0;
  const updated = it.updatedAt?.toMillis() ?? 0;
  return Math.max(checked, updated) || now;
}

/** Splits bought items into those from the last week and those to take off the list. */
export function splitBought<T extends BoughtLike>(items: T[], now: number): { recent: T[]; expired: T[] } {
  const cutoff = now - BOUGHT_DAYS * 86400000;
  const recent: T[] = [];
  const expired: T[] = [];
  for (const it of items) {
    if (it.deleted || !it.checked) continue;
    (boughtAt(it, now) < cutoff ? expired : recent).push(it);
  }
  return { recent, expired };
}
