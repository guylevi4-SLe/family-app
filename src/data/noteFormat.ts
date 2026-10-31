// WhatsApp-style marks in notes: *bold* _italic_ ~strike~, plus our own
// ++underline++ ==highlight==, "# " / "## " headings, "> " quotes,
// "- " bullets, "1. " numbers and "[ ] " / "[x] " checkboxes.

export type Inline = { text: string; marks: Mark[]; href?: string };
export type Mark = 'b' | 'i' | 's' | 'u' | 'hl';

export type Line =
  | { kind: 'h1' | 'h2' | 'quote' | 'bullet' | 'p'; text: string }
  | { kind: 'number'; n: string; text: string }
  | { kind: 'check'; done: boolean; text: string }
  | { kind: 'empty' };

const MARKS: [string, Mark][] = [
  ['++', 'u'],
  ['==', 'hl'],
  ['*', 'b'],
  ['_', 'i'],
  ['~', 's'],
];

const word = /[\p{L}\p{N}]/u;

// A web address, without punctuation that usually ends the sentence around it.
const URL_AT = /^(?:https?:\/\/|www\.)[^\s]+/i;
function urlAt(text: string, i: number) {
  if (i > 0 && word.test(text[i - 1])) return null;
  const m = text.slice(i).match(URL_AT);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?'")\]]+$/, '');
  return url.length > 4 && !/^www\.$/i.test(url) ? url : null;
}

/** Splits text into runs with their marks; a mark needs a non-space inside and no letter just outside. */
export function parseInline(text: string, outer: Mark[] = []): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    // Addresses first, so a _ or ~ inside one isn't read as a mark.
    const url = urlAt(text, i);
    if (url) {
      if (plain) out.push({ text: plain, marks: outer });
      plain = '';
      out.push({ text: url, marks: outer, href: /^www\./i.test(url) ? `https://${url}` : url });
      i += url.length;
      continue;
    }
    let hit: { end: number; mark: Mark; open: number } | null = null;
    if (i === 0 || !word.test(text[i - 1])) {
      for (const [m, mark] of MARKS) {
        if (!text.startsWith(m, i)) continue;
        const from = i + m.length;
        const end = text.indexOf(m, from);
        if (end <= from) continue;
        const inner = text.slice(from, end);
        if (/^\s|\s$/.test(inner) || inner.includes('\n')) continue;
        if (end + m.length < text.length && word.test(text[end + m.length])) continue;
        hit = { end, mark, open: m.length };
        break;
      }
    }
    if (!hit) {
      plain += text[i++];
      continue;
    }
    if (plain) out.push({ text: plain, marks: outer });
    plain = '';
    out.push(...parseInline(text.slice(i + hit.open, hit.end), [...outer, hit.mark]));
    i = hit.end + hit.open;
  }
  if (plain) out.push({ text: plain, marks: outer });
  return out;
}

export function parseLine(raw: string): Line {
  if (!raw.trim()) return { kind: 'empty' };
  let m: RegExpMatchArray | null;
  if ((m = raw.match(/^## (.*)$/))) return { kind: 'h2', text: m[1] };
  if ((m = raw.match(/^# (.*)$/))) return { kind: 'h1', text: m[1] };
  if ((m = raw.match(/^> ?(.*)$/))) return { kind: 'quote', text: m[1] };
  if ((m = raw.match(/^\[( |x|X)\] ?(.*)$/))) return { kind: 'check', done: m[1] !== ' ', text: m[2] };
  if ((m = raw.match(/^[-•] (.*)$/))) return { kind: 'bullet', text: m[1] };
  if ((m = raw.match(/^(\d{1,3})[.)] (.*)$/))) return { kind: 'number', n: m[1], text: m[2] };
  return { kind: 'p', text: raw };
}

/** True when the note uses any mark, so it is worth showing formatted. */
export function hasFormatting(text: string) {
  return text.split('\n').some((l) => {
    const line = parseLine(l);
    return line.kind !== 'p' && line.kind !== 'empty' ? true : line.kind === 'p' && parseInline(line.text).some((r) => r.marks.length || r.href);
  });
}

/** Ticks or unticks the checkbox on line `index`. */
export function toggleCheck(text: string, index: number) {
  const lines = text.split('\n');
  const l = lines[index] ?? '';
  lines[index] = /^\[ \]/.test(l) ? l.replace(/^\[ \]/, '[x]') : l.replace(/^\[[xX]\]/, '[ ]');
  return lines.join('\n');
}

/** The note as WhatsApp shows it: our own marks become ones it knows (or plain text). */
export function toWhatsApp(text: string) {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,2} (.+)$/, '*$1*')
        .replace(/^\[ \] ?/, '☐ ')
        .replace(/^\[[xX]\] ?/, '☑ ')
        .replace(/\+\+([^+\n]+)\+\+/g, '$1')
        .replace(/==([^=\n]+)==/g, '*$1*'),
    )
    .join('\n');
}

export type Edit = { value: string; start: number; end: number };

/** Wraps the selection in a mark (or removes it when already wrapped); with no selection, puts the cursor between a new pair. */
export function wrapSelection(value: string, start: number, end: number, mark: string): Edit {
  const sel = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark) && sel) {
    return { value: before.slice(0, -mark.length) + sel + after.slice(mark.length), start: start - mark.length, end: end - mark.length };
  }
  if (sel.length > mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, -mark.length);
    return { value: before + inner + after, start, end: start + inner.length };
  }
  // Keep spaces the selection picked up outside the marks ("word " → "*word* ").
  const lead = sel.match(/^\s*/)![0];
  const trail = sel.match(/\s*$/)![0];
  const core = sel.slice(lead.length, sel.length - trail.length);
  const next = before + lead + mark + core + mark + trail + after;
  const s = start + lead.length + mark.length;
  return { value: next, start: s, end: s + core.length };
}

/** Adds the prefix to the start of each selected line, or removes it when all of them have it. */
export function togglePrefix(value: string, start: number, end: number, prefix: string): Edit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const strip = /^(#{1,2} |> |[-•] |\[[ xX]\] |\d{1,3}[.)] )/;
  const all = lines.every((l) => l.startsWith(prefix));
  const nextLines = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l.replace(strip, '')));
  const block = nextLines.join('\n');
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
  const delta = block.length - (lineEnd - lineStart);
  return { value: next, start: lines.length === 1 ? Math.max(lineStart, end + delta) : lineStart, end: Math.max(lineStart, end + delta) };
}

/** The direction of the line the cursor is on, from its first letter; null on a line with no letters. */
export function lineDir(value: string, at: number): 'ltr' | 'rtl' | null {
  const start = value.lastIndexOf('\n', at - 1) + 1;
  const end = value.indexOf('\n', at);
  const line = value.slice(start, end < 0 ? undefined : end);
  const first = line.match(/\p{L}/u);
  if (!first) return line.startsWith(RLM) ? 'rtl' : null;
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(first[0]) ? 'rtl' : 'ltr';
}

// A line with no letters (a phone number, a sum) has no direction of its own, and
// the browser would put it on the left. It follows the line above it instead
// (right to left at the top, or after an empty line). In the text box this needs
// an invisible right-to-left mark at its start, shown on screen but never saved.
const RLM = '\u200F';
const DIR_MARKS = /[\u200E\u200F]/g;
const isMark = (c: string) => c === '\u200E' || c === '\u200F';

/** The note's text without the invisible direction marks. */
export const stripMarks = (s: string) => s.replace(DIR_MARKS, '');

/** Each line's direction: from its first letter, or the line above it when it has none; null for an empty line. */
export function lineDirs(text: string): ('ltr' | 'rtl' | null)[] {
  let prev: 'ltr' | 'rtl' | null = null;
  return text.split('\n').map((line) => {
    if (!line.trim()) return (prev = null);
    const first = line.match(/\p{L}/u);
    return (prev = first ? (/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(first[0]) ? 'rtl' : 'ltr') : (prev ?? 'rtl'));
  });
}

/** The text as the text box shows it: a right-to-left mark before each letterless line that should sit on the right. */
export function markLines(text: string): string {
  const dirs = lineDirs(text);
  return text
    .split('\n')
    .map((line, i) => (dirs[i] === 'rtl' && !/\p{L}/u.test(line) ? RLM + line : line))
    .join('\n');
}

/** A place in the shown text, as a place in the saved text. */
export const toRaw = (shown: string, at: number) => stripMarks(shown.slice(0, at)).length;

/** A place in the saved text, as a place in the shown text (after any mark there). */
export function toShown(shown: string, at: number): number {
  let i = 0;
  for (let n = 0; i < shown.length && n < at; i++) if (!isMark(shown[i])) n++;
  while (i < shown.length && isMark(shown[i])) i++;
  return i;
}
