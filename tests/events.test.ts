import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
import { expandEvents, googleCalendarLink, icsText, timeLabel, type FamilyEvent } from '../src/data/events';

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
  it('skips the weeks that were cancelled', () => {
    const out = expandEvents([{ ...base, repeat: 'weekly', skipDates: ['2026-10-22'] }], '2026-10-01', '2026-11-05');
    expect(out.map((e) => e.date)).toEqual(['2026-10-15', '2026-10-29', '2026-11-05']);
  });
  it('leaves one-off events alone', () => {
    expect(expandEvents([base], '2026-01-01', '2026-02-01')).toEqual([base]);
  });
});

describe('calendar export', () => {
  const lesson = {
    id: 'e1', title: 'שיעור פרטי', date: '2026-10-15', endDate: '', time: '16:00', location: '', people: [],
    repeat: 'weekly', repeatUntil: '2026-11-26', deleted: false,
  } as unknown as FamilyEvent;
  it('uses Israeli local time with a time zone, not UTC', () => {
    const ics = icsText(lesson);
    expect(ics).toContain('DTSTART;TZID=Asia/Jerusalem:20261015T160000');
    expect(ics).toContain('DTEND;TZID=Asia/Jerusalem:20261015T170000');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261126T235959Z');
  });
  it('leaves the cancelled weeks out of the copy', () => {
    expect(icsText({ ...lesson, skipDates: ['2026-10-22'] })).toContain('EXDATE;TZID=Asia/Jerusalem:20261022T160000');
    expect(icsText({ ...lesson, time: '', skipDates: ['2026-10-22'] })).toContain('EXDATE;VALUE=DATE:20261022');
    expect(icsText(lesson)).not.toContain('EXDATE');
  });
  it('google link carries the time zone', () => {
    const url = new URL(googleCalendarLink(lesson));
    expect(url.searchParams.get('dates')).toBe('20261015T160000/20261015T170000');
    expect(url.searchParams.get('ctz')).toBe('Asia/Jerusalem');
  });
});

describe('end time', () => {
  const base = { id: 'e', title: 'חוג', date: '2026-11-03', endDate: '', time: '17:30', location: '', people: [], deleted: false, pending: false };
  it('shows "17:30–18:15" and copies to Google with that length', () => {
    expect(timeLabel({ time: '17:30', endTime: '18:15' })).toBe('17:30–18:15');
    expect(timeLabel({ time: '17:30', endTime: '' })).toBe('17:30');
    expect(googleCalendarLink({ ...base, endTime: '18:15' })).toContain('dates=20261103T173000%2F20261103T181500');
    expect(googleCalendarLink(base)).toContain('dates=20261103T173000%2F20261103T183000');
  });
});
