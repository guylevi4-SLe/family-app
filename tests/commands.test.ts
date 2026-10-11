import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));
import { findList, parseCommand, parseWhen, splitListCommand, suggestCommands } from '../src/data/commands';

// Sunday 11 October 2026.
const today = new Date(2026, 9, 11);
const members = [
  { id: 'r', displayName: 'רומי לוי' },
  { id: 'g', displayName: 'גיא לוי' },
];

describe('parseCommand', () => {
  it.each([
    ['@ק חלב, 2 לחם', 'shop', 'חלב, 2 לחם'],
    ['@ק: חלב', 'shop', 'חלב'],
    ['@קניות ביצים', 'shop', 'ביצים'],
    ['  @מ תור לרופא', 'task', 'תור לרופא'],
    ['@י חוג חמישי', 'event', 'חוג חמישי'],
    ['@ר ציוד לים: כובע', 'list', 'ציוד לים: כובע'],
  ])('%s', (text, kind, body) => {
    expect(parseCommand(text)).toEqual({ kind, body });
  });

  it.each(['קניתי חלב', 'מה עם @ק', '@קקק חלב', 'email@ק.com', '@ חלב'])('leaves "%s" as a message', (text) => {
    expect(parseCommand(text)).toBeNull();
  });

  it('offers commands while typing @', () => {
    expect(suggestCommands('@').map((c) => c.key)).toEqual(['ק', 'מ', 'י', 'ר']);
    expect(suggestCommands('@ר').map((c) => c.key)).toEqual(['ר']);
    expect(suggestCommands('@ק ')).toEqual([]);
    expect(suggestCommands('שלום')).toEqual([]);
  });
});

describe('parseWhen', () => {
  const when = (t: string, take = false) => parseWhen(t, today, members, take);

  it('reads a weekday and a time, keeping the name in an event title', () => {
    expect(when('רומי שיעור פרטי חמישי 17:00')).toEqual({
      title: 'רומי שיעור פרטי',
      date: '2026-10-15',
      time: '17:00',
      weekly: false,
      people: ['r'],
    });
  });

  it.each([
    ['היום', '2026-10-11'],
    ['מחר', '2026-10-12'],
    ['מחרתיים', '2026-10-13'],
    ['ביום שלישי', '2026-10-13'],
    ['בראשון', '2026-10-11'],
    ['20.10', '2026-10-20'],
    ['ב-3/1', '2027-01-03'],
    ['5.11.26', '2026-11-05'],
  ])('%s → %s', (word, date) => {
    expect(when(`פגישה ${word}`).date).toBe(date);
    expect(when(`פגישה ${word}`).title).toBe('פגישה');
  });

  it('reads times written with ב and בשעה', () => {
    expect(when('חוג ב-16:30').time).toBe('16:30');
    expect(when('חוג בשעה 9:05').time).toBe('09:05');
  });

  it('understands a weekly event', () => {
    const w = when('חוג כל יום חמישי 17:00');
    expect(w).toMatchObject({ title: 'חוג', date: '2026-10-15', weekly: true, time: '17:00' });
  });

  it('takes "לרומי" out of a task title as its assignee', () => {
    expect(when('תור לרופא שיניים מחר לרומי', true)).toMatchObject({ title: 'תור לרופא שיניים', date: '2026-10-12', people: ['r'] });
  });

  it('leaves text without a date alone', () => {
    expect(when('להחליף נורה')).toMatchObject({ title: 'להחליף נורה', date: null, time: '' });
  });
});

describe('lists', () => {
  it('splits the list name from its lines', () => {
    expect(splitListCommand('ציוד לים: כובע, קרם הגנה')).toEqual({ listName: 'ציוד לים', items: 'כובע, קרם הגנה' });
    expect(splitListCommand('כובע, קרם')).toBeNull();
  });

  const lists = [{ title: 'ציוד לים' }, { title: 'תיק למכון' }, { title: 'דברים לטיסה' }];
  it.each([
    ['ציוד לים', 'ציוד לים'],
    ['ציוד ים', 'ציוד לים'],
    ['ציוד הים', 'ציוד לים'],
    ['תיק מכון', 'תיק למכון'],
    ['דברים לטיסא', 'דברים לטיסה'],
  ])('"%s" finds "%s"', (name, title) => {
    expect(findList(lists, name)?.title).toBe(title);
  });

  it('does not guess a different list', () => {
    expect(findList(lists, 'ציוד לסקי')).toBeNull();
    expect(findList(lists, 'ים')).toBeNull();
  });
});
