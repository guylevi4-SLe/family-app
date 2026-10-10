import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

export interface FamilyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for events lasting several days, else '' or missing
  time: string; // HH:MM or ''
  location: string;
  people: string[];
  deleted: boolean;
  pending: boolean;
}

export type EventFields = Pick<FamilyEvent, 'title' | 'date' | 'time' | 'location' | 'people'> & { endDate: string };

/** Last day of the event (the start day for one-day events). */
export const lastDay = (e: Pick<FamilyEvent, 'date' | 'endDate'>) => (e.endDate && e.endDate > e.date ? e.endDate : e.date);

/** True when the event takes place on the given day. */
export const coversDay = (e: Pick<FamilyEvent, 'date' | 'endDate'>, day: string) => e.date <= day && day <= lastDay(e);

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
    endDate: fields.endDate && fields.endDate > fields.date ? fields.endDate : '',
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

function toUtcStamp(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function range(e: FamilyEvent) {
  if (!e.time) {
    const [y, m, d] = lastDay(e).split('-').map(Number);
    const next = isoDate(new Date(y, m - 1, d + 1));
    return { allDay: true, start: e.date.replace(/-/g, ''), end: next.replace(/-/g, '') };
  }
  const [hh, mm] = e.time.split(':').map(Number);
  const endH = String(Math.min(hh + 1, 23)).padStart(2, '0');
  return { allDay: false, start: toUtcStamp(e.date, e.time), end: toUtcStamp(lastDay(e), `${endH}:${String(mm).padStart(2, '0')}`) };
}

export function googleCalendarLink(e: FamilyEvent) {
  const r = range(e);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${r.start}/${r.end}` });
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function downloadIcs(e: FamilyEvent) {
  const r = range(e);
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//family-app//HE',
    'BEGIN:VEVENT',
    `UID:${e.id}@family-app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND:${r.end}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'event.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
