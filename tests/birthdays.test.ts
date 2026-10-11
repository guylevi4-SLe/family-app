import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
import { birthdayGoogleLink, birthdaysBetween, birthdaysIcs, nextBirthday, type Birthday } from '../src/data/birthdays';

const b = (over: Partial<Birthday>): Birthday => ({ id: 'b', name: 'סבתא', day: 12, month: 3, year: null, group: 'family', pending: false, ...over });

describe('birthdays', () => {
  it('finds birthdays in a range across the new year, with the age turned', () => {
    const out = birthdaysBetween([b({ id: 'a', day: 30, month: 12, year: 1950 }), b({ id: 'c', day: 2, month: 1 })], '2026-12-01', '2027-01-31');
    expect(out.map((o) => [o.birthday.id, o.date, o.age])).toEqual([['a', '2026-12-30', 76], ['c', '2027-01-02', null]]);
  });
  it('29 February falls on 28 February in other years', () => {
    expect(nextBirthday(b({ day: 29, month: 2, year: 2000 }), '2027-01-01')).toMatchObject({ date: '2027-02-28', age: 27 });
    expect(nextBirthday(b({ day: 29, month: 2 }), '2028-01-01').date).toBe('2028-02-29');
  });
  it('today still counts as the next birthday', () => {
    expect(nextBirthday(b({}), '2026-03-12').date).toBe('2026-03-12');
    expect(nextBirthday(b({}), '2026-03-13').date).toBe('2027-03-12');
  });
  it('exports as a yearly all-day event', () => {
    const ics = birthdaysIcs([b({ year: 1950 })]);
    expect(ics).toContain('DTSTART;VALUE=DATE:19500312');
    expect(ics).toContain('RRULE:FREQ=YEARLY');
    const url = new URL(birthdayGoogleLink(b({ year: 1950 })));
    expect(url.searchParams.get('dates')).toBe('19500312/19500313');
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=YEARLY');
  });
});
