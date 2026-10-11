import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

export interface FamilyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for events lasting several days, else '' or missing
  repeat?: '' | 'weekly'; // a weekly event (a lesson every Thursday)
  repeatUntil?: string; // last possible date of a weekly event, '' = no end
  seriesStart?: string; // on a shown occurrence: the series' first date (not stored)
  time: string; // HH:MM or ''
  location: string;
  people: string[];
  deleted: boolean;
  pending: boolean;
}

export type EventFields = Pick<FamilyEvent, 'title' | 'date' | 'time' | 'location' | 'people'> & {
  endDate: string;
  repeat: '' | 'weekly';
  repeatUntil: string;
};

/** Last day of the event (the start day for one-day events). */
export const lastDay = (e: Pick<FamilyEvent, 'date' | 'endDate'>) => (e.endDate && e.endDate > e.date ? e.endDate : e.date);

/** True when the event takes place on the given day. */
export const coversDay = (e: Pick<FamilyEvent, 'date' | 'endDate'>, day: string) => e.date <= day && day <= lastDay(e);

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
};

/**
 * Every event as shown between `from` and `to` (inclusive): one-off events as
 * they are, weekly ones as one copy per week carrying `seriesStart`.
 */
export function expandEvents(list: FamilyEvent[], from: string, to: string): FamilyEvent[] {
  const out: FamilyEvent[] = [];
  for (const e of list) {
    if (e.repeat !== 'weekly') {
      out.push(e);
      continue;
    }
    const end = e.repeatUntil && e.repeatUntil < to ? e.repeatUntil : to;
    let d = e.date;
    if (d < from) {
      const [y1, m1, d1] = d.split('-').map(Number);
      const [y2, m2, d2] = from.split('-').map(Number);
      const weeks = Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (7 * 86400000));
      d = addDays(d, weeks * 7);
      if (d < from) d = addDays(d, 7);
    }
    for (; d <= end; d = addDays(d, 7)) out.push({ ...e, date: d, endDate: '', seriesStart: e.date });
  }
  return out;
}

/** "כל יום ה׳" (and "עד 30.6" when it ends) for weekly events, else ''. */
export function repeatLabel(e: Pick<FamilyEvent, 'repeat' | 'repeatUntil' | 'date'>) {
  if (e.repeat !== 'weekly') return '';
  const [y, m, d] = e.date.split('-').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'long' });
  if (!e.repeatUntil) return `🔁 כל ${day}`;
  const [uy, um, ud] = e.repeatUntil.split('-').map(Number);
  return `🔁 כל ${day} עד ${new Date(uy, um - 1, ud).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`;
}

/** "עד יום ג׳ · 13.10" for multi-day events, else ''. */
export function untilLabel(e: Pick<FamilyEvent, 'date' | 'endDate'>) {
  if (lastDay(e) === e.date) return '';
  const [y, m, d] = lastDay(e).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `עד ${dt.toLocaleDateString('he-IL', { weekday: 'short' })} ${dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`;
}

const eventsCol = (fid: string) => collection(db, 'families', fid, 'events');

export function saveEvent(fid: string, id: string | null, fields: EventFields) {
  const uid = auth.currentUser!.uid;
  const clean = {
    title: fields.title.trim().slice(0, 120),
    date: fields.date,
    endDate: fields.repeat ? '' : fields.endDate && fields.endDate > fields.date ? fields.endDate : '',
    repeat: fields.repeat,
    repeatUntil: fields.repeat && fields.repeatUntil > fields.date ? fields.repeatUntil : '',
    time: fields.time,
    location: fields.location.trim().slice(0, 120),
    people: fields.people.slice(0, 20),
  };
  const write = id
    ? updateDoc(doc(eventsCol(fid), id), { ...clean, updatedAt: serverTimestamp(), updatedBy: uid })
    : setDoc(doc(eventsCol(fid)), {
        ...clean,
        deleted: false,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
  write.catch(reportWriteError);
}

export function deleteEvent(fid: string, id: string, deleted = true) {
  updateDoc(doc(eventsCol(fid), id), { deleted, updatedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid }).catch(
    reportWriteError,
  );
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(date: string) {
  const today = new Date();
  const t = isoDate(today);
  const tomorrow = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('he-IL', { weekday: 'long' });
  const short = dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  if (date === t) return `היום · ${short}`;
  if (date === tomorrow) return `מחר · ${short}`;
  return `${weekday} · ${short}`;
}

// ---------- "add to my calendar" (one-time copy, not a sync) ----------

// Event times are Israeli wall-clock times. They are exported as local times in
// Asia/Jerusalem (not UTC) so calendars show the right zone and weekly repeats
// keep their hour across the summer/winter clock change.
const TZ = 'Asia/Jerusalem';

function localStamp(date: string, time: string) {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function range(e: FamilyEvent) {
  if (!e.time) {
    const [y, m, d] = lastDay(e).split('-').map(Number);
    const next = isoDate(new Date(y, m - 1, d + 1));
    return { allDay: true, start: e.date.replace(/-/g, ''), end: next.replace(/-/g, '') };
  }
  const [hh, mm] = e.time.split(':').map(Number);
  const endH = String(Math.min(hh + 1, 23)).padStart(2, '0');
  return { allDay: false, start: localStamp(e.date, e.time), end: localStamp(lastDay(e), `${endH}:${String(mm).padStart(2, '0')}`) };
}

function rrule(e: FamilyEvent) {
  return e.repeatUntil ? `FREQ=WEEKLY;UNTIL=${e.repeatUntil.replace(/-/g, '')}T235959Z` : 'FREQ=WEEKLY';
}

/** `free`: the copy is marked "available" so it doesn't block the person's day. */
export function googleCalendarLink(e: FamilyEvent, free = true) {
  const r = range(e);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${r.start}/${r.end}` });
  if (!r.allDay) params.set('ctz', TZ);
  // trp covers timed events, crm covers all-day ones.
  params.set('trp', String(!free));
  params.set('crm', free ? 'AVAILABLE' : 'BUSY');
  if (e.location) params.set('location', e.location);
  if (e.repeat === 'weekly') params.set('recur', `RRULE:${rrule(e)}`);
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Israel: summer time from the Friday before the last Sunday of March, until the last Sunday of October.
const JERUSALEM = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'DTSTART:19700327T020000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:IDT',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'DTSTART:19701025T020000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:IST',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function icsText(e: FamilyEvent, free = true) {
  const r = range(e);
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//family-app//HE',
    ...(r.allDay ? [] : JERUSALEM),
    'BEGIN:VEVENT',
    `UID:${e.id}@family-app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART;TZID=${TZ}:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND;TZID=${TZ}:${r.end}`,
    `SUMMARY:${esc(e.title)}`,
    `TRANSP:${free ? 'TRANSPARENT' : 'OPAQUE'}`,
    ...(free ? ['X-MICROSOFT-CDO-BUSYSTATUS:FREE'] : []),
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.repeat === 'weekly' ? [`RRULE:${rrule(e)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(e: FamilyEvent, free = true) {
  saveIcsFile(icsText(e, free));
}

/** Hands a calendar file to the phone, which offers to add it to the calendar app. */
export function saveIcsFile(text: string, name = 'event.ics') {
  const blob = new Blob([text], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
