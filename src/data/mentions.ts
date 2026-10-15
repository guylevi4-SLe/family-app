/**
 * Tagging in the chat: "@שגב" notifies Segev, "@כולם" the whole family.
 * A member is tagged by the first word of their name.
 */
export const EVERYONE = 'כולם';

interface Person {
  id: string;
  displayName: string;
}

export const firstName = (m: Person) => m.displayName.trim().split(/\s+/)[0];

const LETTER = /[\p{L}\p{N}_]/u;

/** Is "@name" in the text as a whole word (not the start of a longer one)? */
function hasTag(text: string, name: string) {
  const tag = `@${name}`;
  for (let i = text.indexOf(tag); i >= 0; i = text.indexOf(tag, i + 1)) {
    const next = text[i + tag.length];
    if (!next || !LETTER.test(next)) return true;
  }
  return false;
}

/** Who a message tags, without the sender. */
export function taggedIds(text: string, members: Person[], me: string) {
  const others = members.filter((m) => m.id !== me);
  if (hasTag(text, EVERYONE)) return others.map((m) => m.id);
  return others.filter((m) => firstName(m) && hasTag(text, firstName(m))).map((m) => m.id);
}

/** The "@…" being typed at the end of the text, or null. */
export function typingTag(text: string) {
  const m = text.match(/(^|\s)@([\p{L}\p{N}_]*)$/u);
  return m ? m[2] : null;
}

/** Names to offer for the "@…" being typed: family members (not me) and "כולם". */
export function suggestTags(text: string, members: Person[], me: string) {
  const typed = typingTag(text);
  if (typed === null) return [];
  const names = [...members.filter((m) => m.id !== me).map(firstName), EVERYONE];
  return names.filter((n) => n && n.toLowerCase().startsWith(typed.toLowerCase()) && n !== typed);
}

/** The text with the "@…" being typed completed to "@name ". */
export function completeTag(text: string, name: string) {
  return text.replace(/@[\p{L}\p{N}_]*$/u, `@${name} `);
}

/** Splits text into plain parts and tags, for showing tags highlighted. */
export function splitTags(text: string, names: string[]): { text: string; tag: boolean }[] {
  const known = new Set([...names, EVERYONE]);
  const out: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/@([\p{L}\p{N}_]+)/gu)) {
    if (!known.has(m[1])) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index), tag: false });
    out.push({ text: m[0], tag: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tag: false });
  return out;
}

/**
 * Completes the "@…" being typed when only one thing fits: a chat command
 * ("@רש" → "@רשימה: ", at the start only) or a name ("@ש" → "@שגב ").
 * Null while more than one fits ("@ר" with רשימה, רומי and רוית).
 */
export function autoCompleteTag(text: string, names: string[], commands: string[]) {
  const typed = typingTag(text);
  if (!typed) return null;
  const atStart = /^\s*@[\p{L}\p{N}_]*$/u.test(text);
  const fits = [
    ...(atStart ? commands.filter((c) => c.startsWith(typed)).map((c) => `@${c}: `) : []),
    ...[...new Set([...names, EVERYONE])].filter((n) => n && n.toLowerCase().startsWith(typed.toLowerCase())).map((n) => `@${n} `),
  ];
  if (fits.length !== 1) return null;
  const done = text.replace(/@[\p{L}\p{N}_]*$/u, fits[0]);
  return done === text ? null : done;
}
