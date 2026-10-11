import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';
import { isoDate, saveIcsFile } from './events';

export const BIRTHDAY_GROUPS = [
  { id: 'family', label: 'משפחה קרובה' },
  { id: 'extended', label: 'משפחה מורחבת' },
  { id: 'friends', label: 'חברים' },
  { id: 'other', label: 'אחר' },
] as const;
export type BirthdayGroup = (typeof BIRTHDAY_GROUPS)[number]['id'];

/** A birthday the family keeps; the year is optional (it only adds the age). */
export interface Birthday {
  id: string;
  name: string;
  day: number;
  month: number; // 1-12
  year: number | null;
  group: BirthdayGroup;
  pending: boolean;
}

export type BirthdayFields = Pick<Birthday, 'name' | 'day' | 'month' | 'year' | 'group'>;

const col = (fid: string) => collection(db, 'families', fid, 'birthdays');
const clean = (f: BirthdayFields) => ({
  name: f.name.trim().slice(0, 60),
  day: f.day,
  month: f.month,
  year: f.year,
  group: f.group,
  updatedAt: serverTimestamp(),
  updatedBy: auth.currentUser!.uid,
});

export function addBirthday(fid: string, f: BirthdayFields) {
  addDoc(col(fid), clean(f)).catch(reportWriteError);
}
export function updateBirthday(fid: string, id: string, f: BirthdayFields) {
  updateDoc(doc(col(fid), id), clean(f)).catch(reportWriteError);
}
export function deleteBirthday(fid: string, id: string) {
  deleteDoc(doc(col(fid), id)).catch(reportWriteError);
}

export const daysInMonth = (month: number, year = 2024) => new Date(year, month, 0).getDate();

/** The birthday's date in a given year (29 Feb falls on 28 Feb in other years). */
export function dateIn(b: Pick<Birthday, 'day' | 'month'>, year: number) {
  return isoDate(new Date(year, b.month - 1, Math.min(b.day, daysInMonth(b.month, year))));
}

export interface BirthdayOn {
  birthday: Birthday;
  date: string; // YYYY-MM-DD
  age: number | null;
}

/** Every birthday that falls between two dates (inclusive), with the age turned. */
export function birthdaysBetween(list: Birthday[], from: string, to: string): BirthdayOn[] {
  const out: BirthdayOn[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const b of list) {
      const date = dateIn(b, y);
      if (date >= from && date <= to) out.push({ birthday: b, date, age: b.year && b.year <= y ? y - b.year : null });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.birthday.name.localeCompare(b.birthday.name, 'he'));
}

/** The next time it comes round, today included. */
export function nextBirthday(b: Birthday, today = isoDate(new Date())): BirthdayOn {
  const y = Number(today.slice(0, 4));
  const date = dateIn(b, y) >= today ? dateIn(b, y) : dateIn(b, y + 1);
  const year = Number(date.slice(0, 4));
  return { birthday: b, date, age: b.year && b.year <= year ? year - b.year : null };
}

export function daysUntil(date: string, today = isoDate(new Date())) {
  const [a, b] = [today, date].map((d) => new Date(`${d}T12:00:00`).getTime());
  return Math.round((b - a) / 86_400_000);
}

export const birthdayTitle = (b: Pick<Birthday, 'name'>) => `🎂 יום הולדת ל${b.name}`;

// ---------- add to a personal calendar, repeating every year ----------

function firstDate(b: Birthday) {
  // Start from the birth year when known, so the calendar shows past years too.
  return dateIn(b, b.year ?? new Date().getFullYear()).replace(/-/g, '');
}
function nextDay(yyyymmdd: string) {
  const d = new Date(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6)) + 1);
  return isoDate(d).replace(/-/g, '');
}

export function birthdayGoogleLink(b: Birthday) {
  const start = firstDate(b);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: birthdayTitle(b),
    dates: `${start}/${nextDay(start)}`,
    recur: 'RRULE:FREQ=YEARLY',
    crm: 'AVAILABLE',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function vevent(b: Birthday) {
  const start = firstDate(b);
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VEVENT',
    `UID:birthday-${b.id}@family-app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${nextDay(start)}`,
    'RRULE:FREQ=YEARLY',
    `SUMMARY:${esc(birthdayTitle(b))}`,
    'TRANSP:TRANSPARENT',
    'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
    'END:VEVENT',
  ];
}

/** One calendar file holding one or many birthdays. */
export function birthdaysIcs(list: Birthday[]) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//family-app//HE', ...list.flatMap(vevent), 'END:VCALENDAR'].join('\r\n');
}

export function downloadBirthdays(list: Birthday[]) {
  saveIcsFile(birthdaysIcs(list), list.length === 1 ? 'birthday.ics' : 'birthdays.ics');
}
