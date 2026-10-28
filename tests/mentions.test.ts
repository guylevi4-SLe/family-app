import { describe, expect, it } from 'vitest';
import { expandTags, leadingCommand, completeTag, splitTags, suggestTags, taggedIds, typingTag } from '../src/data/mentions';

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

describe('a command at the start, once it is certain', () => {
  const names = ['שגב', 'רומי', 'רוית'];
  const commands = ['קניות', 'משימה', 'יומן', 'רשימה', 'פתק'];
  it('takes it when only it fits, or a space or colon follows', () => {
    expect(leadingCommand('@פ', names, commands)).toEqual({ word: 'פתק', typed: 'פ', rest: '' });
    expect(leadingCommand('@ר', names, commands)).toBeNull();
    expect(leadingCommand('@ר ', names, commands)).toEqual({ word: 'רשימה', typed: 'ר', rest: '' });
    expect(leadingCommand('@רש', names, commands)?.word).toBe('רשימה');
    expect(leadingCommand('@רו', names, commands)).toBeNull();
    expect(leadingCommand('@רומי ', names, commands)).toBeNull();
    expect(leadingCommand('@קניות: חלב, לחם', names, commands)).toEqual({ word: 'קניות', typed: 'קניות', rest: 'חלב, לחם' });
    expect(leadingCommand('היי @פ', names, commands)).toBeNull();
    expect(leadingCommand('@שגב', names, commands)).toBeNull();
  });
});

describe('expanding "@…" when only one thing fits', () => {
  const names = ['שגב', 'רומי', 'רוית'];
  const commands = ['קניות', 'משימה', 'יומן', 'רשימה', 'פתק'];
  it('expands commands at the start and names anywhere', () => {
    expect(expandTags('@רש ציוד: כובע', names, commands)).toBe('@רשימה ציוד: כובע');
    expect(expandTags('@פ קוד לשער', names, commands)).toBe('@פתק קוד לשער');
    expect(expandTags('@ר ציוד: כובע', names, commands)).toBe('@ר ציוד: כובע');
    expect(expandTags('@רו', names, commands)).toBe('@רו');
    expect(expandTags('@רומ תביאי', names, commands)).toBe('@רומי תביאי');
    expect(expandTags('היי @ש ו@רוי', names, commands)).toBe('היי @שגב ו@רוית');
    expect(expandTags('היי @רש', names, commands)).toBe('היי @רש');
    expect(expandTags('@כ אוכל', names, commands)).toBe('@כולם אוכל');
    expect(expandTags('מייל a@ש.com', names, commands)).toBe('מייל a@ש.com');
    expect(expandTags('@שגב', names, commands)).toBe('@שגב');
  });
});
