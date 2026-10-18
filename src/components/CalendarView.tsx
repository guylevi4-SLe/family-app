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
import { birthdaysBetween, birthdayTitle, type Birthday, type BirthdayOn } from '../data/birthdays';
import { whenLabel } from './BirthdaysSheet';
import { memberName, useFamily } from './FamilyContext';
import { CommentButton } from './CommentButton';
import { MoreMenu } from './MoreMenu';
import { BookOpen, CalendarClock, CalendarDays, CalendarPlus, Cake, ChevronLeft, ChevronRight, List, ListChecks, ListTodo, Plus } from 'lucide-react';

type Mode = 'list' | 'month';
const MODE_KEY = 'calendarMode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'month';
  } catch {
    return 'month';
  }
}

export function CalendarView({
  events,
  tasks,
  birthdays,
  openSchedule,
  openBirthdays,
}: {
  events: FamilyEvent[] | undefined;
  tasks: Task[] | undefined;
  birthdays: Birthday[] | undefined;
  openSchedule: () => void;
  openBirthdays: (id: string | null) => void;
}) {
  const { members } = useFamily();
  const [editing, setEditing] = useState<FamilyEvent | 'new' | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [quick, setQuick] = useState<'events' | 'tasks' | null>(null);
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

  const [y, m] = selected.split('-').map(Number);
  const monthTitle = new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  // Moving a month selects its first day, or today in the current month.
  const shiftMonth = (delta: number) => {
    const d = isoDate(new Date(y, m - 1 + delta, 1));
    setSelected(d.slice(0, 7) === today.slice(0, 7) ? today : d);
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

  const monthBirthdays = birthdaysBetween(birthdays ?? [], shift(-370), shift(370));
  const byDay = new Map<string, { events: FamilyEvent[]; tasks: Task[]; birthdays: BirthdayOn[] }>();
  const slot = (d: string) => {
    if (!byDay.has(d)) byDay.set(d, { events: [], tasks: [], birthdays: [] });
    return byDay.get(d)!;
  };
  for (const b of birthdaysBetween(birthdays ?? [], today, shift(92))) slot(b.date).birthdays.push(b);
  // A trip that already started is listed under today.
  for (const e of upcoming) slot(e.date < today ? today : e.date).events.push(e);
  for (const t of openDated) slot(t.due).tasks.push(t);
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b));

  const openNewEvent = (date: string | null) => {
    setNewDate(date);
    setEditing('new');
  };

  return (
    <div className="planner-body">
      {/* One thin bar: the month (or "upcoming"), the view switch and the ⋮ menu. */}
      <div className="cal-bar">
        {mode === 'month' ? (
          <div className="cal-month">
            <button className="icon-button" aria-label="החודש הקודם" onClick={() => shiftMonth(-1)}>
              <ChevronRight size={22} aria-hidden="true" />
            </button>
            <h2>{monthTitle}</h2>
            <button className="icon-button" aria-label="החודש הבא" onClick={() => shiftMonth(1)}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            {selected.slice(0, 7) !== today.slice(0, 7) && (
              <button className="chip cal-today" onClick={() => setSelected(today)}>
                היום
              </button>
            )}
          </div>
        ) : (
          <h2 className="cal-title">הקרוב</h2>
        )}
        <button
          className="more-button"
          aria-label={mode === 'month' ? 'תצוגת רשימה' : 'לוח חודשי'}
          onClick={() => setMode(mode === 'month' ? 'list' : 'month')}
        >
          {mode === 'month' ? <List size={22} aria-hidden="true" /> : <CalendarDays size={22} aria-hidden="true" />}
        </button>
        <MoreMenu
          title="יומן"
          items={[
            { label: 'אירועים קרובים', icon: <CalendarClock size={20} />, onClick: () => setQuick('events') },
            { label: 'משימות', icon: <ListChecks size={20} />, onClick: () => setQuick('tasks') },
            { label: 'מערכת שעות', icon: <BookOpen size={20} />, onClick: openSchedule },
            { label: 'ימי הולדת', icon: <Cake size={20} />, onClick: () => openBirthdays(null) },
          ]}
        />
      </div>

      {mode === 'month' ? (
        <MonthView
          events={monthEvents}
          tasks={dated}
          birthdays={monthBirthdays}
          onOpenBirthday={openBirthdays}
          selected={selected}
          onSelect={setSelected}
          onOpenEvent={setEditing}
        />
      ) : (
        <>
          {events !== undefined && days.length === 0 && <p className="empty">אין אירועים קרובים</p>}

          {days.map(([date, list]) => (
            <section key={date} className="dept">
              <h2>{dayLabel(date)}</h2>
              <ul>
                {list.birthdays.map((b) => (
                  <BirthdayRow key={b.birthday.id} on={b} onOpen={() => openBirthdays(b.birthday.id)} />
                ))}
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

      <div className="fab-wrap">
        <MoreMenu
          label="הוספה"
          className="fab"
          icon={<Plus size={28} strokeWidth={2.4} aria-hidden="true" />}
          title={mode === 'month' ? `הוספה ל${dayLabel(selected)}` : 'הוספה ליומן'}
          items={[
            { label: 'אירוע חדש', icon: <CalendarPlus size={20} />, onClick: () => openNewEvent(mode === 'month' ? selected : null) },
            { label: 'משימה ליומן', icon: <ListTodo size={20} />, onClick: () => setAddingTask(mode === 'month' ? selected : today) },
          ]}
        />
      </div>

      {editing && (
        <EventSheet
          event={editing === 'new' ? null : (live.find((e) => e.id === editing.id) ?? editing)}
          initialDate={newDate ?? today}
          onClose={() => setEditing(null)}
        />
      )}
      {addingTask && <TaskOnDateSheet date={addingTask} onClose={() => setAddingTask(null)} />}
      {quick === 'events' && (
        <UpcomingEventsSheet
          events={upcoming}
          today={today}
          onOpen={(e) => {
            setQuick(null);
            setEditing(e);
          }}
          onClose={() => setQuick(null)}
        />
      )}
      {quick === 'tasks' && <OpenTasksSheet tasks={tasks} onClose={() => setQuick(null)} />}
    </div>
  );
}

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function MonthView({
  events,
  tasks,
  birthdays,
  onOpenBirthday,
  selected,
  onSelect,
  onOpenEvent,
}: {
  events: FamilyEvent[];
  tasks: (Task & { due: string })[];
  birthdays: BirthdayOn[];
  onOpenBirthday: (id: string) => void;
  selected: string;
  onSelect: (d: string) => void;
  onOpenEvent: (e: FamilyEvent) => void;
}) {
  const { members } = useFamily();
  const [y, m] = selected.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const today = isoDate(new Date());
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);

  const dayEvents = events
    .filter((e) => coversDay(e, selected))
    .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  const dayTasks = tasks.filter((t) => t.due === selected);
  const dayBirthdays = birthdays.filter((b) => b.date === selected);

  return (
    <div className="month">
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
          const bd = birthdays.filter((b) => b.date === d).length;
          const cls = ['day', d === today ? 'today' : '', d === selected ? 'sel' : ''].join(' ');
          return (
            <button key={d} className={cls} aria-label={`${dayLabel(d)}: ${ev} אירועים, ${tk} משימות${bd ? `, ${bd} ימי הולדת` : ''}`} onClick={() => onSelect(d)}>
              <span className="num">{Number(d.slice(8))}</span>
              <span className="marks">
                {ev > 0 && <i className="mark ev" />}
                {tk > 0 && <i className="mark tk" />}
                {bd > 0 && <i className="mark bd" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="legend">
        <i className="mark ev" /> אירוע <i className="mark tk" /> משימה <i className="mark bd" /> יום הולדת
      </p>

      <section className="dept">
        <h2>{dayLabel(selected)}</h2>
        {dayEvents.length + dayTasks.length + dayBirthdays.length === 0 ? (
          <p className="muted day-empty">אין כלום ביום הזה</p>
        ) : (
          <ul>
            {dayBirthdays.map((b) => (
              <BirthdayRow key={b.birthday.id} on={b} onOpen={() => onOpenBirthday(b.birthday.id)} />
            ))}
            {dayEvents.map((e) => (
              <EventRow key={e.id} event={e} members={members} onOpen={() => onOpenEvent(e)} />
            ))}
            {dayTasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BirthdayRow({ on, onOpen }: { on: BirthdayOn; onOpen: () => void }) {
  return (
    <li className="row birthday-row">
      <button className="check-area" onClick={onOpen}>
        <span className="time bday-icon" aria-hidden="true">🎂</span>
        <span className="name">
          {birthdayTitle(on.birthday).replace('🎂 ', '')}
          <span className="sub">
            <span className="kind-tag">יום הולדת</span>
            <span>{whenLabel(on)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function TaskRow({ task, showDate = false }: { task: Task; showDate?: boolean }) {
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
            {showDate && task.due && <span>{dayLabel(task.due)}</span>}
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

/** From the ⋮ menu: only the coming events (next 3 months), by day. */
function UpcomingEventsSheet({
  events,
  today,
  onOpen,
  onClose,
}: {
  events: FamilyEvent[];
  today: string;
  onOpen: (e: FamilyEvent) => void;
  onClose: () => void;
}) {
  const { members } = useFamily();
  const byDay = new Map<string, FamilyEvent[]>();
  // A trip that already started is listed under today.
  for (const e of events) {
    const d = e.date < today ? today : e.date;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e);
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="אירועים קרובים" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>אירועים קרובים</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {byDay.size === 0 && <p className="empty">אין אירועים קרובים</p>}
        {[...byDay].map(([date, list]) => (
          <section key={date} className="dept">
            <h2>{dayLabel(date)}</h2>
            <ul>
              {list.map((e) => (
                <EventRow key={`${e.id}:${e.date}`} event={e} members={members} onOpen={() => onOpen(e)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** From the ⋮ menu: open tasks, dated ones first by date, then the rest (same order as the tasks tab). */
function OpenTasksSheet({ tasks, onClose }: { tasks: Task[] | undefined; onClose: () => void }) {
  const open = (tasks ?? [])
    .filter((t) => !t.deleted && !t.done)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title, 'he'));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="משימות" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>משימות</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {tasks !== undefined && open.length === 0 && <p className="empty">אין משימות פתוחות 🎉</p>}
        {open.length > 0 && (
          <section className="dept">
            <ul>
              {open.map((t) => (
                <TaskRow key={t.id} task={t} showDate />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
