import { describe, expect, it } from 'vitest';
import { hasFormatting, lineDir, parseInline, parseLine, toggleCheck, togglePrefix, toWhatsApp, wrapSelection } from '../src/data/noteFormat';

describe('note formatting', () => {
  it('reads WhatsApp marks and our own', () => {
    expect(parseInline('לא לשכוח *הדרכון* היום')).toEqual([
      { text: 'לא לשכוח ', marks: [] },
      { text: 'הדרכון', marks: ['b'] },
      { text: ' היום', marks: [] },
    ]);
    expect(parseInline('++קו++ ו==מרקר==').map((r) => r.marks)).toEqual([['u'], []]);
    expect(parseInline('*_שניהם_*')).toEqual([{ text: 'שניהם', marks: ['b', 'i'] }]);
  });
  it('leaves plain text alone', () => {
    expect(hasFormatting('שער חניה: 1234\nאזעקה: 9876')).toBe(false);
    expect(hasFormatting('file_name_here and a * b * c')).toBe(false);
    expect(hasFormatting('# קודים')).toBe(true);
    expect(hasFormatting('[ ] לקנות חלב')).toBe(true);
  });
  it('finds web addresses', () => {
    expect(parseInline('המתכון: https://example.com/a_b_c. תודה')).toEqual([
      { text: 'המתכון: ', marks: [] },
      { text: 'https://example.com/a_b_c', marks: [], href: 'https://example.com/a_b_c' },
      { text: '. תודה', marks: [] },
    ]);
    expect(parseInline('https://x.co/_a_ ~b~')).toEqual([
      { text: 'https://x.co/_a_', marks: [], href: 'https://x.co/_a_' },
      { text: ' ', marks: [] },
      { text: 'b', marks: ['s'] },
    ]);
    expect(parseInline('*www.shop.co.il*')).toEqual([{ text: 'www.shop.co.il', marks: ['b'], href: 'https://www.shop.co.il' }]);
    expect(parseInline('(ראו http://a.com)')[1]).toEqual({ text: 'http://a.com', marks: [], href: 'http://a.com' });
    expect(parseInline('nohttps://a.com').some((r) => r.href)).toBe(false);
    expect(hasFormatting('אתר: www.example.com')).toBe(true);
    expect(hasFormatting('www. ו-https://')).toBe(false);
  });
  it('reads line kinds', () => {
    expect(parseLine('## בית')).toEqual({ kind: 'h2', text: 'בית' });
    expect(parseLine('[x] נעשה')).toEqual({ kind: 'check', done: true, text: 'נעשה' });
    expect(parseLine('2. שני')).toEqual({ kind: 'number', n: '2', text: 'שני' });
  });
  it('wraps and unwraps a selection', () => {
    const v = 'את הדרכון שלי';
    const r = wrapSelection(v, 3, 9, '*');
    expect(r.value).toBe('את *הדרכון* שלי');
    expect(r.value.slice(r.start, r.end)).toBe('הדרכון');
    expect(wrapSelection(r.value, r.start, r.end, '*').value).toBe(v);
    expect(wrapSelection('אבג', 3, 3, '++')).toEqual({ value: 'אבג++++', start: 5, end: 5 });
  });
  it('toggles a line prefix', () => {
    expect(togglePrefix('שורה\nשנייה', 6, 6, '# ').value).toBe('שורה\n# שנייה');
    expect(togglePrefix('# שורה', 3, 3, '# ').value).toBe('שורה');
    expect(togglePrefix('- א\n- ב', 0, 7, '[ ] ').value).toBe('[ ] א\n[ ] ב');
  });
  it('ticks a checkbox and shares in WhatsApp style', () => {
    expect(toggleCheck('[ ] א\n[x] ב', 0)).toBe('[x] א\n[x] ב');
    expect(toggleCheck('[ ] א\n[x] ב', 1)).toBe('[ ] א\n[ ] ב');
    expect(toWhatsApp('# כותרת\n[ ] משימה\n++קו++ ==מרקר== *מודגש*')).toBe('*כותרת*\n☐ משימה\nקו *מרקר* *מודגש*');
  });
  it('gives the cursor line the direction of its first letter', () => {
    const v = 'קניות!\nHello world!\n- 2 eggs\n\n123';
    expect(lineDir(v, 3)).toBe('rtl');
    expect(lineDir(v, v.indexOf('!', 10) + 1)).toBe('ltr');
    expect(lineDir(v, v.indexOf('eggs'))).toBe('ltr');
    expect(lineDir(v, v.length - 4)).toBe(null);
    expect(lineDir(v, v.length)).toBe(null);
    expect(lineDir('Call דנה', 0)).toBe('ltr');
  });
});
