import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
import { expandEvents, type FamilyEvent } from '../src/data/events';

const base: FamilyEvent = { id: 'e', title: 'שיעור פרטי', date: '2026-10-15', time: '16:00', location: '', people: [], deleted: false, pending: false };

describe('weekly events', () => {
  it('repeats every 7 days inside the window, from the first date on', () => {
    const out = expandEvents([{ ...base, repeat: 'weekly' }], '2026-10-01', '2026-11-05');
    expect(out.map((e) => e.date)).toEqual(['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05']);
    expect(out[1].seriesStart).toBe('2026-10-15');
  });
  it('starts at the first week inside the window and stops at the end date', () => {
    const out = expandEvents([{ ...base, repeat: 'weekly', repeatUntil: '2026-12-01' }], '2026-11-20', '2027-01-01');
    expect(out.map((e) => e.date)).toEqual(['2026-11-26']);
  });
  it('leaves one-off events alone', () => {
    expect(expandEvents([base], '2026-01-01', '2026-02-01')).toEqual([base]);
  });
});
