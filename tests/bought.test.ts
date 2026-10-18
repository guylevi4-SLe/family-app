import { describe, expect, it } from 'vitest';
import { boughtAt, splitBought, type BoughtLike } from '../src/data/bought';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 18, 12);
const at = (ms: number) => ({ toMillis: () => ms });
const item = (id: string, fields: Partial<BoughtLike>) => ({ id, checked: true, deleted: false, ...fields });

describe('bought in the last week', () => {
  it('keeps a week of bought items and expires older ones', () => {
    const { recent, expired } = splitBought(
      [
        item('fresh', { checkedAt: at(now - 2 * DAY), updatedAt: at(now - 2 * DAY) }),
        item('edge', { checkedAt: at(now - 7 * DAY + 1000) }),
        item('old', { checkedAt: at(now - 8 * DAY), updatedAt: at(now - 8 * DAY) }),
        item('open', { checked: false, updatedAt: at(now - 30 * DAY) }),
        item('gone', { deleted: true, updatedAt: at(now - 30 * DAY) }),
      ],
      now,
    );
    expect(recent.map((i) => i.id)).toEqual(['fresh', 'edge']);
    expect(expired.map((i) => i.id)).toEqual(['old']);
  });
  it('falls back to the last update for items ticked before the change', () => {
    expect(boughtAt(item('a', { updatedAt: at(now - 3 * DAY) }), now)).toBe(now - 3 * DAY);
    const { expired } = splitBought([item('a', { updatedAt: at(now - 10 * DAY) })], now);
    expect(expired).toHaveLength(1);
  });
  it('never expires early because of a stale tick time', () => {
    // Re-ticked on a device running the old version: checkedAt is old, updatedAt is new.
    const it = item('a', { checkedAt: at(now - 20 * DAY), updatedAt: at(now - DAY) });
    expect(splitBought([it], now).recent).toHaveLength(1);
  });
  it('treats a time not yet confirmed by the server as now', () => {
    expect(boughtAt(item('a', { checkedAt: null, updatedAt: null }), now)).toBe(now);
  });
});
