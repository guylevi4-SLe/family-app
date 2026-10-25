import { describe, expect, it } from 'vitest';
import { matchStaple, preferStaples, suggestStaples } from '../src/data/stapleMatch';

const item = (id: string, name: string, fields: Record<string, unknown> = {}) => ({ id, name, staple: true, checked: false, deleted: true, ...fields });
const items = [
  item('נטורינה', 'נטורינה בטעם נטרלי', { usualQty: '2' }),
  item('בולגרית', 'גבינה בולגרית'),
  item('לבנה', 'גבינה לבנה 9%'),
  item('חלב', 'חלב'),
  item('חלב סויה', 'חלב סויה', { staple: false }),
  item('קוטג', "קוטג' 5%", { deleted: false }),
];

describe('typed products that mean a staple', () => {
  it('takes the only staple that starts with the typed words', () => {
    expect(matchStaple('נטורינה', items)?.id).toBe('נטורינה');
  });
  it('prefers an exact name, so "חלב" stays milk', () => {
    expect(matchStaple('חלב', items)?.id).toBe('חלב');
  });
  it('leaves it as typed when several staples start with it, or only part of a word was typed', () => {
    expect(matchStaple('גבינה', items)).toBeUndefined();
    expect(matchStaple('נט', items)).toBeUndefined();
  });
  it('puts the staple on the list with its name and usual quantity, a typed quantity winning', () => {
    expect(preferStaples([{ name: 'נטורינה', qty: '' }, { name: 'לחם', qty: '' }], items)).toEqual([
      { id: 'נטורינה', name: 'נטורינה בטעם נטרלי', qty: '2' },
      { name: 'לחם', qty: '' },
    ]);
    expect(preferStaples([{ name: 'נטורינה', qty: '3' }], items)[0].qty).toBe('3');
  });
});

describe('suggestions while typing', () => {
  it('offers staples whose name starts with the typed text', () => {
    expect(suggestStaples('נט', items).map((s) => s.id)).toEqual(['נטורינה']);
    expect(suggestStaples('גבינה', items).map((s) => s.id)).toEqual(['בולגרית', 'לבנה']);
  });
  it('skips a staple where the typed text is only in a later word ("עגב" is not "רסק עגבניות")', () => {
    expect(suggestStaples('לבנה', items)).toEqual([]);
  });
  it('stays quiet for one letter, exact names and products not on the staples list', () => {
    expect(suggestStaples('נ', items)).toEqual([]);
    expect(suggestStaples('חלב', items)).toEqual([]);
    expect(suggestStaples('סויה', items)).toEqual([]);
  });
  it('still offers a staple already on the list, so it shows it is there', () => {
    expect(suggestStaples('קוטג', items).map((s) => s.id)).toEqual(['קוטג']);
  });
});
