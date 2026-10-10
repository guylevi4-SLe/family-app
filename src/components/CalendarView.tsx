import { useState } from 'react';
import {
  coversDay,
  dayLabel,
  expandEvents,
  lastDay,
  repeatLabel,
  untilLabel,
  deleteEvent,
  downloadIcs,
  googleCalendarLink,
  isoDate,
  saveEvent,
  type EventFields,
  type FamilyEvent,
} from '../data/events';
import { addTask, toggleDone, type Task } from '../data/tasks';
import { memberName, useFamily } from './FamilyContext';
import { CommentButton } from './CommentButton';

type Mode = 'list' | 'month';
const MODE_KEY = 'calendarMode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'month' ? 'month' : 'list';
  } catch {
    return 'list';
  }
}

export function CalendarView({
  events,
  tasks,
  openSchedule,
}: {
  events: FamilyEvent[] | undefined;
  tasks: Task[] | undefined;
  openSchedule: () => void;
}) {
  const { members } = useFamily();
  const [editing, setEditing] = useState<FamilyEvent | 'new' | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [mode, setModeState] = useState<Mode>(readMode);
  const today = isoDate(new Date());
  const [selected, setSelected] = useState(today);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* optional */
    }
  };

  const live = (events ?? []).filter((e) => !e.deleted);
  const sorted = live.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  const shift = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return isoDate(d);
  };
  // Weekly events show once per week: the next 3 months in the list, ±1 year in the month view.
  const upcoming = expandEvents(sorted, today, shift(92))
    .filter((e) => lastDay(e) >= today)
    .sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  const monthEvents = expandEvents(live, shift(-370), shift(370));
  const past = sorted.filter((e) => e.repeat !== 'weekly' && lastDay(e) < today).reverse().slice(0, 20);
  const dated = (tasks ?? []).filter((t) => !t.deleted && t.due) as (Task & { due: string })[];
  const openDated = dated.filter((t) => !t.done && t.due >= today);

  const byDay = new Map<string, { events: FamilyEvent[]; tasks: Task[] }>();
  const slot = (d: string) => {
    if (!byDay.has(d)) byDay.set(d, { events: [], tasks: [] });
    return byDay.get(d)!;
  };
  // A trip that already started is listed under today.
  for (const e of upcoming) slot(e.date < today ? today : e.date).events.push(e);
  for (const t of openDated) slot(t.due).tasks.push(t);
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b));

  const openNewEvent = (date: string | null) => {
    setNewDate(date);
    setEditing('new');
  };

  return (
    <main className="list-page">
      <button className="small schedule-open" onClick={openSchedule}>
        📚 מערכת שעות
      </button>
      <div className="segmented" role="group" aria-label="תצוגה">
        <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
          רשימה
        </button>
        <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
          לוח חודשי
        </button>
      </div>

      {mode === 'month' ? (
        <MonthView
          events={monthEvents}
          tasks={dated}
          selected={selected}
          onSelect={setSelected}
          onOpenEvent={setEditing}
          onAddEvent={() => openNewEvent(selected)}
          onAddTask={() => setAddingTask(selected)}
        />
      ) : (
        <>
          <div className="calendar-add">
            <button className="primary" onClick={() => openNewEvent(null)}>
              + אירוע חדש
            </button>
            <button onClick={() => setAddingTask(today)}>+ משימה ליומן</button>
          </div>

          {events !== undefined && days.length === 0 && <p className="empty">אין אירועים קרובים</p>}

          {days.map(([date, list]) => (
            <section key={date} className="dept">
              <h2>{dayLabel(date)}</h2>
              <ul>
                {list.events.map((e) => (
                  <EventRow key={`${e.id}:${e.date}`} event={e} members={members} onOpen={() => setEditing(e)} />
                ))}
                {list.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
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
        </>
      )}

      {editing && (
        <EventSheet
          event={editing === 'new' ? null : (live.find((e) => e.id === editing.id) ?? editing)}
          initialDate={newDate ?? today}
          onClose={() => setEditing(null)}
        />
      )}
      {addingTask && <TaskOnDateSheet date={addingTask} onClose={() => setAddingTask(null)} />}
    </main>
  );
}

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function MonthView({
  events,
  tasks,
  selected,
  onSelect,
  onOpenEvent,
  onAddEvent,
  onAddTask,
}: {
  events: FamilyEvent[];
  tasks: (Task & { due: string })[];
  selected: string;
  onSelect: (d: string) => void;
  onOpenEvent: (e: FamilyEvent) => void;
  onAddEvent: () => void;
  onAddTask: () => void;
}) {
  const { members } = useFamily();
  const [y, m] = selected.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const today = isoDate(new Date());
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onSelect(isoDate(d));
  };

  const dayEvents = events
    .filter((e) => coversDay(e, selected))
    .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  const dayTasks = tasks.filter((t) => t.due === selected);

  return (
    <div className="month">
      <div className="month-head">
        <button className="icon-button" aria-label="החודש הקודם" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>{first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</h2>
        <button className="icon-button" aria-label="החודש הבא" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="month-grid" role="grid" aria-label="לוח חודשי">
        {WEEKDAYS.map((w) => (
          <span key={w} className="weekday">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const ev = events.filter((e) => coversDay(e, d)).length;
          const tk = tasks.filter((t) => t.due === d && !t.done).length;
          const cls = ['day', d === today ? 'today' : '', d === selected ? 'sel' : ''].join(' ');
          return (
            <button key={d} className={cls} aria-label={`${dayLabel(d)}: ${ev} אירועים, ${tk} משימות`} onClick={() => onSelect(d)}>
              <span className="num">{Number(d.slice(8))}</span>
              <span className="marks">
                {ev > 0 && <i className="mark ev" />}
                {tk > 0 && <i className="mark tk" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="legend">
        <i className="mark ev" /> אירוע <i className="mark tk" /> משימה
      </p>

      <section className="dept">
        <h2>{dayLabel(selected)}</h2>
        {dayEvents.length + dayTasks.length === 0 ? (
          <p className="muted day-empty">אין כלום ביום הזה</p>
        ) : (
          <ul>
            {dayEvents.map((e) => (
              <EventRow key={e.id} event={e} members={members} onOpen={() => onOpenEvent(e)} />
            ))}
            {dayTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
        <div className="calendar-add">
          <button className="primary" onClick={onAddEvent}>
            + אירוע ביום הזה
          </button>
          <button onClick={onAddTask}>+ משימה ביום הזה</button>
        </div>
      </section>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { familyId, members } = useFamily();
  const who = memberName(members, task.assignee);
  return (
    <li className={`row ${task.done ? 'checked' : ''}`}>
      <button className="check-area" aria-pressed={task.done} onClick={() => toggleDone(familyId, task)}>
        <span className="box round" aria-hidden="true">{task.done ? '✓' : ''}</span>
        <span className="name">
          {task.title}
          <span className="sub">
            <span className="kind-tag">משימה</span>
            {who && <span className="who-tag">{who}</span>}
          </span>
        </span>
        {task.pending && <span className="pending-dot" aria-label="ממתין לסנכרון" />}
      </button>
      <CommentButton type="task" id={task.id} title={task.title} />
    </li>
  );
}

function TaskOnDateSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { familyId, members } = useFamily();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(date);
  const [assignee, setAssignee] = useState<string | null>(null);
  const save = () => {
    if (!title.trim()) return;
    addTask(familyId, title, assignee, due || null);
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="משימה ליומן" onClick={(e) => e.stopPropagation()}>
        <label>
          משימה
          <input value={title} maxLength={120} placeholder="למשל: לקנות מתנה לסבתא" onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          תאריך
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div>
          <span className="field-label">למי</span>
          <div className="chips" role="group" aria-label="אחראי">
            <button type="button" className={assignee === null ? 'chip on' : 'chip'} onClick={() => setAssignee(null)}>
              כולם
            </button>
            {members.map((m) => (
              <button type="button" key={m.id} className={assignee === m.id ? 'chip on' : 'chip'} onClick={() => setAssignee(m.id)}>
                {m.displayName.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet-actions">
          <button className="primary" onClick={save} disabled={!title.trim()}>
            הוספה
          </button>
        </div>
      </div>
    </div>
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
            {untilLabel(event) && <span className="until">{untilLabel(event)}</span>}
            {repeatLabel(event) && <span className="until">{repeatLabel(event)}</span>}
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

function EventSheet({ event, initialDate, onClose }: { event: FamilyEvent | null; initialDate: string; onClose: () => void }) {
  const { familyId, members } = useFamily();
  const [f, setF] = useState<EventFields>(
    event
      ? {
          title: event.title,
          date: event.date,
          endDate: event.endDate ?? '',
          repeat: event.repeat ?? '',
          repeatUntil: event.repeatUntil ?? '',
          time: event.time,
          location: event.location,
          people: event.people,
        }
      : { title: '', date: initialDate, endDate: '', repeat: '', repeatUntil: '', time: '', location: '', people: [] },
  );
  const set = (patch: Partial<EventFields>) => setF((prev) => ({ ...prev, ...patch }));
  const [multi, setMulti] = useState(Boolean(event?.endDate));
  const [free, setFree] = useState(true);
  const valid =
    f.title.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.date) &&
    (!multi || (f.endDate && f.endDate > f.date)) &&
    (!f.repeat || !f.repeatUntil || f.repeatUntil > f.date);

  const save = () => {
    if (!valid) return;
    saveEvent(familyId, event?.id ?? null, multi ? { ...f, repeat: '', repeatUntil: '' } : { ...f, endDate: '' });
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
            {multi ? 'מתאריך' : 'תאריך'}
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          {multi ? (
            <label>
              עד תאריך
              <input type="date" value={f.endDate} min={f.date} onChange={(e) => set({ endDate: e.target.value })} />
            </label>
          ) : (
            <label>
              שעה (לא חובה)
              <input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
          )}
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => {
              setMulti(e.target.checked);
              set(e.target.checked ? { endDate: f.endDate > f.date ? f.endDate : nextDay(f.date), time: '', repeat: '' } : { endDate: '' });
            }}
          />
          כמה ימים (למשל טיול או חופשה)
        </label>
        {!multi && (
          <label className="check-line">
            <input type="checkbox" checked={f.repeat === 'weekly'} onChange={(e) => set({ repeat: e.target.checked ? 'weekly' : '' })} />
            חוזר כל שבוע (למשל חוג או שיעור פרטי)
          </label>
        )}
        {!multi && f.repeat === 'weekly' && (
          <label>
            עד תאריך (לא חובה)
            <input type="date" value={f.repeatUntil} min={f.date} onChange={(e) => set({ repeatUntil: e.target.value })} />
          </label>
        )}
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
            <label className="check-line">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              להציג אותי כפנוי (לא לחסום לי את היום)
            </label>
            <div className="inline">
              <a className="button-link" href={googleCalendarLink(event, free)} target="_blank" rel="noopener noreferrer">
                יומן Google
              </a>
              <button type="button" className="small" onClick={() => downloadIcs(event, free)}>
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
                if (!window.confirm(event.repeat === 'weekly' ? `למחוק את "${event.title}" מכל השבועות?` : `למחוק את האירוע "${event.title}"?`)) return;
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

function nextDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + 1));
}
