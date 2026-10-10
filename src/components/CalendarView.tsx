import { useState } from 'react';
import {
  dayLabel,
  deleteEvent,
  downloadIcs,
  googleCalendarLink,
  isoDate,
  saveEvent,
  type EventFields,
  type FamilyEvent,
} from '../data/events';
import { memberName, useFamily } from './FamilyContext';
import { CommentButton } from './CommentButton';

export function CalendarView({ events }: { events: FamilyEvent[] | undefined }) {
  const { members } = useFamily();
  const [editing, setEditing] = useState<FamilyEvent | 'new' | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = isoDate(new Date());

  const live = (events ?? []).filter((e) => !e.deleted);
  const sorted = live.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  const upcoming = sorted.filter((e) => e.date >= today);
  const past = sorted.filter((e) => e.date < today).reverse().slice(0, 20);

  const byDay = new Map<string, FamilyEvent[]>();
  for (const e of upcoming) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date)!.push(e);
  }

  return (
    <main className="list-page">
      <button className="primary big add-event" onClick={() => setEditing('new')}>
        + אירוע חדש
      </button>

      {events !== undefined && upcoming.length === 0 && <p className="empty">אין אירועים קרובים</p>}

      {[...byDay].map(([date, list]) => (
        <section key={date} className="dept">
          <h2>{dayLabel(date)}</h2>
          <ul>
            {list.map((e) => (
              <EventRow key={e.id} event={e} members={members} onOpen={() => setEditing(e)} />
            ))}
          </ul>
        </section>
      ))}

      {past.length > 0 && (
        <section className="dept bought">
          <button className="link muted" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
            אירועים שעברו {showPast ? '▴' : '▾'}
          </button>
          {showPast && (
            <ul>
              {past.map((e) => (
                <EventRow key={e.id} event={e} members={members} onOpen={() => setEditing(e)} showDate />
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <EventSheet
          event={editing === 'new' ? null : (live.find((e) => e.id === editing.id) ?? editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function EventRow({
  event,
  members,
  onOpen,
  showDate = false,
}: {
  event: FamilyEvent;
  members: { id: string; displayName: string }[];
  onOpen: () => void;
  showDate?: boolean;
}) {
  const people = event.people.map((p) => memberName(members, p)).filter(Boolean);
  return (
    <li className="row">
      <button className="check-area" onClick={onOpen}>
        <span className="time">{event.time || 'כל היום'}</span>
        <span className="name">
          {event.title}
          <span className="sub">
            {showDate && <span>{dayLabel(event.date)}</span>}
            {event.location && <span>📍 {event.location}</span>}
            {people.length > 0 && <span className="who-tag">{people.join(', ')}</span>}
          </span>
        </span>
        {event.pending && <span className="pending-dot" aria-label="ממתין לסנכרון" />}
      </button>
      <CommentButton type="event" id={event.id} title={event.title} />
    </li>
  );
}

function EventSheet({ event, onClose }: { event: FamilyEvent | null; onClose: () => void }) {
  const { familyId, members } = useFamily();
  const [f, setF] = useState<EventFields>(
    event
      ? { title: event.title, date: event.date, time: event.time, location: event.location, people: event.people }
      : { title: '', date: isoDate(new Date()), time: '', location: '', people: [] },
  );
  const set = (patch: Partial<EventFields>) => setF((prev) => ({ ...prev, ...patch }));
  const valid = f.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.date);

  const save = () => {
    if (!valid) return;
    saveEvent(familyId, event?.id ?? null, f);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={event ? `עריכת ${event.title}` : 'אירוע חדש'} onClick={(e) => e.stopPropagation()}>
        <label>
          מה
          <input value={f.title} maxLength={120} placeholder="למשל: חוג כדורסל" onChange={(e) => set({ title: e.target.value })} autoFocus={!event} />
        </label>
        <div className="two-cols">
          <label>
            תאריך
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label>
            שעה (לא חובה)
            <input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
          </label>
        </div>
        <label>
          איפה (לא חובה)
          <input value={f.location} maxLength={120} onChange={(e) => set({ location: e.target.value })} />
        </label>
        <div>
          <span className="field-label">מי משתתף</span>
          <div className="chips" role="group" aria-label="מי משתתף">
            {members.map((m) => {
              const on = f.people.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => set({ people: on ? f.people.filter((p) => p !== m.id) : [...f.people, m.id] })}
                >
                  {m.displayName.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {event && (
          <div className="calendar-export">
            <span className="field-label">הוספה ליומן האישי (העתק חד־פעמי, שינויים כאן לא יתעדכנו שם)</span>
            <div className="inline">
              <a className="button-link" href={googleCalendarLink(event)} target="_blank" rel="noopener noreferrer">
                יומן Google
              </a>
              <button type="button" className="small" onClick={() => downloadIcs(event)}>
                יומן Apple
              </button>
            </div>
            <CommentButton type="event" id={event.id} title={event.title} always />
          </div>
        )}

        <div className="sheet-actions">
          <button className="primary" onClick={save} disabled={!valid}>
            שמירה
          </button>
          {event && (
            <button
              className="danger"
              onClick={() => {
                deleteEvent(familyId, event.id);
                onClose();
              }}
            >
              מחיקה
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
