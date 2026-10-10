import type { Item } from '../data/items';
import type { Task } from '../data/tasks';
import { dayLabel, lastDay, untilLabel, isoDate, type FamilyEvent } from '../data/events';
import { memberName, useFamily } from './FamilyContext';
import type { View } from './Home';
import { Icon } from './Icon';
import type { Schedule } from '../data/schedules';

export function Dashboard({
  items,
  tasks,
  events,
  schedules,
  go,
  openSchedule,
}: {
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
  schedules: Schedule[] | undefined;
  go: (v: View) => void;
  openSchedule: (uid: string) => void;
}) {
  const { me, members } = useFamily();
  const toBuy = (items ?? []).filter((i) => !i.deleted && !i.checked);
  const open = (tasks ?? []).filter((t) => !t.deleted && !t.done);
  const mine = open.filter((t) => t.assignee === me.id);
  const today = isoDate(new Date());
  const upcoming = (events ?? [])
    .filter((e) => !e.deleted && lastDay(e) >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const mySchedule = schedules?.find((s) => s.id === me.id);

  return (
    <main className="dashboard">
      {mySchedule && (
        <button className="tile schedule-tile" onClick={() => openSchedule(me.id)}>
          <div className="tile-head">
            <span className="tile-icon"><Icon name="book" /></span>
            <h2>המערכת שלי</h2>
          </div>
          <img className="schedule-thumb" src={mySchedule.image} alt="" />
        </button>
      )}
      <button className="tile" onClick={() => go('list')}>
        <div className="tile-head">
          <span className="tile-icon"><Icon name="cart" /></span>
          <h2>רשימת קניות</h2>
          <span className="tile-count">{toBuy.length}</span>
        </div>
        <p className="tile-body">
          {toBuy.length === 0 ? 'הרשימה ריקה' : toBuy.slice(0, 6).map((i) => i.name).join(' · ') + (toBuy.length > 6 ? ' …' : '')}
        </p>
      </button>

      <button className="tile" onClick={() => go('tasks')}>
        <div className="tile-head">
          <span className="tile-icon"><Icon name="tasks" /></span>
          <h2>משימות</h2>
          <span className="tile-count">{open.length}</span>
        </div>
        <p className="tile-body">
          {open.length === 0
            ? 'אין משימות פתוחות'
            : mine.length > 0
              ? `${mine.length} שלך: ${mine.slice(0, 3).map((t) => t.title).join(' · ')}`
              : open.slice(0, 3).map((t) => `${t.title}${t.assignee ? ` (${memberName(members, t.assignee)})` : ''}`).join(' · ')}
        </p>
      </button>

      <button className="tile" onClick={() => go('calendar')}>
        <div className="tile-head">
          <span className="tile-icon"><Icon name="calendar" /></span>
          <h2>יומן</h2>
        </div>
        <div className="tile-body">
          {upcoming.length === 0 ? (
            'אין אירועים קרובים'
          ) : (
            <ul className="tile-events">
              {upcoming.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <span className="muted">
                    {e.date < today ? 'עכשיו' : dayLabel(e.date).split(' · ')[0]}
                    {e.time ? ` ${e.time}` : ''}
                  </span>{' '}
                  {e.title}
                  {untilLabel(e) && <span className="muted"> ({untilLabel(e)})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </button>
    </main>
  );
}
