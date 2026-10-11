import { isoDate } from './events';

/**
 * Short chat commands that add things without leaving the chat:
 * "@ק חלב, 2 לחם" (shopping), "@מ תור לרופא מחר לרומי" (task),
 * "@י רומי שיעור פרטי חמישי 17:00" (calendar), "@ר ציוד לים: כובע, קרם" (list).
 */
export type CommandKind = 'shop' | 'task' | 'event' | 'list';

export const COMMANDS: { kind: CommandKind; key: string; word: string; emoji: string; label: string; example: string }[] = [
  { kind: 'shop', key: 'ק', word: 'קניות', emoji: '🛒', label: 'לקניות', example: 'חלב, 2 לחם' },
  { kind: 'task', key: 'מ', word: 'משימה', emoji: '✅', label: 'משימה', example: 'תור לרופא מחר לרומי' },
  { kind: 'event', key: 'י', word: 'יומן', emoji: '📅', label: 'ליומן', example: 'רומי חוג חמישי 17:00' },
  { kind: 'list', key: 'ר', word: 'רשימה', emoji: '📋', label: 'לרשימה', example: 'ציוד לים: כובע, קרם' },
];

const COMMAND_RE = /^\s*@\s?([֐-׿]+)\s*:?\s*([\s\S]*)$/;

/** The command at the start of a chat message, or null for an ordinary message. */
export function parseCommand(text: string): { kind: CommandKind; body: string } | null {
  const m = text.match(COMMAND_RE);
  if (!m) return null;
  const c = COMMANDS.find((x) => x.key === m[1] || x.word === m[1]);
  return c ? { kind: c.kind, body: m[2].trim() } : null;
}

/** "@ק" typed on its own becomes "@קניות: ", ready for the items. */
export function expandCommand(text: string): string | null {
  const m = text.match(/^@([\u0590-\u05FF])$/);
  const c = m && COMMANDS.find((x) => x.key === m[1]);
  return c ? `@${c.word}: ` : null;
}

/** Commands to offer while the person is typing "@…" at the start of a message. */
export function suggestCommands(text: string) {
  const m = text.match(/^\s*@([֐-׿]*)$/);
  if (!m) return [];
  return COMMANDS.filter((c) => !m[1] || c.key.startsWith(m[1]) || c.word.startsWith(m[1]));
}

// ---------- dates, times and people in free text ----------

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export interface When {
  /** The text with the date, time and (for tasks) the person taken out. */
  title: string;
  date: string | null;
  time: string;
  weekly: boolean;
  /** Members named in the text ("לרומי", or "רומי" at word level). */
  people: string[];
}

/** Strips one leading "ב"/"ל"/"ה" and a maqaf ("ב־17:00", "בחמישי"). */
const bare = (w: string) => w.replace(/^[בלה][־-]?(?=[\dA-Za-z\u0590-\u05FF])/, '');

function nextWeekday(today: Date, day: number) {
  const diff = (day - today.getDay() + 7) % 7;
  return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
}

function explicitDate(w: string, today: Date): string | null {
  const m = w.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1) return null;
  // "3.1" written in October means next January.
  if (!m[3] && isoDate(dt) < isoDate(today)) y += 1;
  return isoDate(new Date(y, mo - 1, d));
}

/**
 * Reads "היום", "מחר", "מחרתיים", a weekday ("חמישי", "ביום חמישי", "כל חמישי"),
 * a date ("15.10") and a time ("17:00", "ב-17:00") out of free text.
 * With `takePeople`, "לרומי" also names who it is for and leaves the title.
 */
export function parseWhen(
  text: string,
  today: Date,
  members: { id: string; displayName: string }[],
  takePeople: boolean,
): When {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const keep: string[] = [];
  let date: string | null = null;
  let time = '';
  let weekly = false;
  const people = new Set<string>();
  const firstNames = members.map((m) => ({ id: m.id, name: m.displayName.split(' ')[0] })).filter((m) => m.name);

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[,.!?]+$/, '') || words[i];
    const b = bare(w);
    if (w === 'בשעה' || w === 'ב' || w === 'ב-' || w === 'ב־') continue;
    const tm = b.match(/^(\d{1,2}):(\d{2})$/);
    if (tm && Number(tm[1]) < 24 && Number(tm[2]) < 60) {
      time = `${tm[1].padStart(2, '0')}:${tm[2]}`;
      continue;
    }
    if (!date && (w === 'היום' || w === 'מחר' || w === 'מחרתיים')) {
      const add = w === 'היום' ? 0 : w === 'מחר' ? 1 : 2;
      date = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + add));
      continue;
    }
    if (w === 'כל' && i + 1 < words.length) {
      const nxt = bare(words[i + 1].replace(/^יום$/, ''));
      const d = DAYS.indexOf(nxt === '' ? bare(words[i + 2] ?? '') : nxt);
      if (d >= 0) {
        weekly = true;
        date = nextWeekday(today, d);
        i += nxt === '' ? 2 : 1;
        continue;
      }
    }
    if (b === 'יום' && i + 1 < words.length && DAYS.includes(bare(words[i + 1].replace(/[,.]+$/, '')))) continue;
    const day = DAYS.indexOf(b);
    if (!date && day >= 0) {
      date = nextWeekday(today, day);
      continue;
    }
    const ex: string | null = date ? null : explicitDate(b, today);
    if (ex) {
      date = ex;
      continue;
    }
    const person = firstNames.find((m) => b === m.name || w === m.name);
    if (person) {
      people.add(person.id);
      // For a task "לרומי" says who does it; for an event the name stays in the title.
      if (takePeople && w.startsWith('ל')) continue;
    }
    keep.push(words[i]);
  }
  return { title: keep.join(' ').replace(/^[\s,:-]+|[\s,:-]+$/g, ''), date, time, weekly, people: [...people] };
}

// ---------- lists ----------

/** "ציוד לים: כובע, קרם הגנה" → list name and its lines. */
export function splitListCommand(body: string): { listName: string; items: string } | null {
  const i = body.search(/[:\n]/);
  if (i <= 0) return null;
  const listName = body.slice(0, i).trim();
  const items = body.slice(i + 1).trim();
  return listName && items ? { listName, items } : null;
}

/** Spelling-insensitive key: no spaces, quotes or leading ה/ל on each word. */
export const listKey = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w.replace(/^[הל](?=[֐-׿]{2})/, ''))
    .join('')
    .replace(/["'״׳`/\-־.,]/g, '');

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** The existing list the person meant, allowing a small typo ("ציוד ים" → "ציוד לים"). */
export function findList<T extends { title: string }>(lists: T[], name: string): T | null {
  const k = listKey(name);
  const exact = lists.find((l) => listKey(l.title) === k);
  if (exact) return exact;
  if (k.length < 4) return null;
  const close = lists.filter((l) => distance(listKey(l.title), k) <= 1);
  return close.length === 1 ? close[0] : null;
}
