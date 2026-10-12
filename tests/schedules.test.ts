import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
import { dayMessage, nextSchoolDay } from '../src/data/schedules';

const days = ['', 'חשבון\nאנגלית', 'מדעים\n\n ספורט ', '', '', ''];

describe('sending tomorrow’s timetable', () => {
  it('on Monday evening sends Tuesday, numbered', () => {
    expect(dayMessage('רומי', days, new Date(2026, 9, 12, 20)).text).toBe('📚 המערכת של רומי למחר, יום שלישי 13.10:\n1. מדעים\n2. ספורט');
  });

  it('on Friday skips Saturday to Sunday', () => {
    expect(nextSchoolDay(new Date(2026, 9, 16)).getDay()).toBe(0);
    expect(dayMessage('רומי', days, new Date(2026, 9, 16)).text).toBe('📚 אין שיעורים במערכת של רומי ליום ראשון 18.10');
  });

  it('keeps lines that already start with a number or hour', () => {
    expect(dayMessage('רומי', ['', '', '8:00 חשבון\n9:00 אנגלית'], new Date(2026, 9, 12)).text).toContain('\n8:00 חשבון\n9:00 אנגלית');
  });
});
