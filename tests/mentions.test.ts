import { describe, expect, it } from 'vitest';
import { autoCompleteTag, completeTag, splitTags, suggestTags, taggedIds, typingTag } from '../src/data/mentions';

const members = [
  { id: 'g', displayName: 'גיא לוי' },
  { id: 's', displayName: 'שגב' },
  { id: 'r1', displayName: 'רומי' },
  { id: 'r2', displayName: 'רוית לוי' },
];

describe('chat tags', () => {
  it('finds who is tagged, by first name, not the sender', () => {
    expect(taggedIds('@שגב תביא חלב', members, 'g')).toEqual(['s']);
    expect(taggedIds('היי @רומי ו@רוית', members, 'g')).toEqual(['r1', 'r2']);
    expect(taggedIds('@גיא', members, 'g')).toEqual([]);
    expect(taggedIds('@רומיות', members, 'g')).toEqual([]);
    expect(taggedIds('אוכל מוכן @כולם', members, 'g')).toEqual(['s', 'r1', 'r2']);
    expect(taggedIds('בלי תיוג', members, 'g')).toEqual([]);
  });

  it('offers names for the "@…" being typed', () => {
    expect(typingTag('היי @ר')).toBe('ר');
    expect(typingTag('מייל a@b')).toBeNull();
    expect(suggestTags('@ר', members, 'g')).toEqual(['רומי', 'רוית']);
    expect(suggestTags('@', members, 'g')).toEqual(['שגב', 'רומי', 'רוית', 'כולם']);
    expect(suggestTags('@ק', members, 'g')).toEqual([]);
    expect(suggestTags('שלום', members, 'g')).toEqual([]);
    expect(completeTag('היי @רו', 'רוית')).toBe('היי @רוית ');
  });

  it('splits a message into text and highlighted tags', () => {
    expect(splitTags('היי @שגב ו@מישהו', ['שגב'])).toEqual([
      { text: 'היי ', tag: false },
      { text: '@שגב', tag: true },
      { text: ' ו@מישהו', tag: false },
    ]);
  });
});

describe('completing "@…" when only one thing fits', () => {
  const names = ['שגב', 'רומי', 'רוית'];
  const commands = ['קניות', 'משימה', 'יומן', 'רשימה'];
  it('completes commands at the start and names anywhere', () => {
    expect(autoCompleteTag('@רש', names, commands)).toBe('@רשימה: ');
    expect(autoCompleteTag('@ק', names, commands)).toBe('@קניות: ');
    expect(autoCompleteTag('@ר', names, commands)).toBeNull();
    expect(autoCompleteTag('@רו', names, commands)).toBeNull();
    expect(autoCompleteTag('@רומ', names, commands)).toBe('@רומי ');
    expect(autoCompleteTag('היי @ש', names, commands)).toBe('היי @שגב ');
    expect(autoCompleteTag('היי @רש', names, commands)).toBeNull();
    expect(autoCompleteTag('@כ', names, commands)).toBe('@כולם ');
    expect(autoCompleteTag('@', names, commands)).toBeNull();
  });
});
