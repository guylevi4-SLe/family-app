// WhatsApp-style marks in notes: *bold* _italic_ ~strike~, plus our own
// ++underline++ ==highlight==, "# " / "## " headings, "> " quotes,
// "- " bullets, "1. " numbers and "[ ] " / "[x] " checkboxes.

export type Inline = { text: string; marks: Mark[] };
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

/** Splits text into runs with their marks; a mark needs a non-space inside and no letter just outside. */
export function parseInline(text: string, outer: Mark[] = []): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
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
    return line.kind !== 'p' && line.kind !== 'empty' ? true : line.kind === 'p' && parseInline(line.text).some((r) => r.marks.length);
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
