import type { Item } from '../data/items';
import { orderedDepartments } from '../data/departments';
import type { Task } from '../data/tasks';
import { dayLabel, expandEvents, lastDay, untilLabel, isoDate, type FamilyEvent } from '../data/events';
import { memberName, useFamily } from './FamilyContext';
import type { Screen } from './Home';
import { Icon } from './Icon';
import { ListIcon } from './ListIcon';
import { defaultScheduleUid, type Schedule } from '../data/schedules';
import { byPinThenTitle, type FamilyList, type ListEntry } from '../data/lists';
import { birthdaysBetween, type Birthday } from '../data/birthdays';

export function Dashboard({
  items,
  tasks,
  events,
  schedules,
  lists,
  listEntries,
  birthdays,
  deptOrder,
  go,
  openSchedule,
  openList,
}: {
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
  schedules: Schedule[] | undefined;
  lists: FamilyList[] | undefined;
  listEntries: ListEntry[] | undefined;
  birthdays: Birthday[] | undefined;
  deptOrder: string[] | undefined;
  go: (s: Screen) => void;
  openSchedule: (uid: string) => void;
  openList: (id: string | null) => void;
}) {
  const { me, members } = useFamily();
  // In the shopping list's own order: the family's department order, then the order they were added.
  const depts = orderedDepartments(deptOrder);
  const deptRank = (i: Item) => (depts.includes(i.category) ? depts.indexOf(i.category) : depts.length - 1);
  const toBuy = (items ?? [])
    .filter((i) => !i.deleted && !i.checked)
    .sort((a, b) => deptRank(a) - deptRank(b) || (a.addedAt?.toMillis() ?? Infinity) - (b.addedAt?.toMillis() ?? Infinity));
  const open = (tasks ?? []).filter((t) => !t.deleted && !t.done);
  const mine = open.filter((t) => t.assignee === me.id);
  const today = isoDate(new Date());
  const inTwoMonths = new Date();
  inTwoMonths.setDate(inTwoMonths.getDate() + 62);
  const upcoming = expandEvents((events ?? []).filter((e) => !e.deleted), today, isoDate(inTwoMonths))
    .filter((e) => lastDay(e) >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // Events and the next two weeks' birthdays, in date order.
  const inTwoWeeks = new Date();
  inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
  const agenda = [
    ...upcoming.map((e) => ({ key: `${e.id}:${e.date}`, date: e.date < today ? today : e.date, time: e.time, title: e.title, until: untilLabel(e), now: e.date < today })),
    ...birthdaysBetween(birthdays ?? [], today, isoDate(inTwoWeeks)).map((b) => ({
      key: `bd:${b.birthday.id}`,
      date: b.date,
      time: '',
      title: `🎂 יום הולדת ל${b.birthday.name}${b.age !== null ? ` (${b.age})` : ''}`,
      until: '',
      now: false,
    })),
  ].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));

  const live = (schedules ?? []).filter((s) => members.some((m) => m.id === s.id));
  const shown = live.find((s) => s.id === defaultScheduleUid(schedules, members.map((m) => m.id), me.id));
  const sortedLists = (lists ?? []).filter((l) => !l.kind || (l.kind === 'note' && l.pinned && !l.lockFolder)).sort(byPinThenTitle);
  const others = live.filter((s) => s.id !== me.id).map((s) => memberName(members, s.id));

  return (
    <main className="dashboard">
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

      {schedules !== undefined && (
        <button className="tile schedule-tile" onClick={() => openSchedule(shown?.id ?? me.id)}>
          <div className="tile-head">
            <span className="tile-icon"><Icon name="book" /></span>
            <h2>{shown?.id === me.id ? 'המערכת שלי' : 'מערכת שעות'}</h2>
          </div>
          {shown ? (
            <>
              <img className="schedule-thumb" src={shown.image} alt="" />
              {others.length > 0 && <p className="tile-body">{shown.id === me.id ? 'יש גם של: ' : 'של: '}{others.join(', ')}</p>}
            </>
          ) : (
            <p className="tile-body">עדיין לא הועלתה מערכת. לחיצה להעלאה</p>
          )}
        </button>
      )}

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
          {agenda.length === 0 ? (
            'אין אירועים קרובים'
          ) : (
            <ul className="tile-events">
              {agenda.slice(0, 4).map((e) => (
                <li key={e.key}>
                  <span className="muted">
                    {e.now ? 'עכשיו' : dayLabel(e.date).replace(' · ', ' ')}
                    {e.time ? ` ${e.time}` : ''}
                  </span>{' '}
                  {e.title}
                  {e.until && <span className="muted"> ({e.until})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </button>
      <section className="tile lists-tile">
        <button className="tile-head tile-link" onClick={() => openList(null)}>
          <span className="tile-icon"><Icon name="list" /></span>
          <h2>פתקים</h2>
          {sortedLists.length > 0 && <span className="tile-count">{sortedLists.length}</span>}
        </button>
        {sortedLists.length === 0 ? (
          <button className="tile-body tile-link muted" onClick={() => openList(null)}>
            רשימה לכל דבר (תיק למכון, ציוד לטיול) או פתק עם קבצים. לחיצה ליצירה
          </button>
        ) : (
          <ul className="tile-lists">
            {sortedLists.slice(0, 4).map((l) => {
              const mine = (listEntries ?? []).filter((e) => e.listId === l.id);
              const done = mine.filter((e) => e.done).length;
              return (
                <li key={l.id}>
                  <button onClick={() => openList(l.id)}>
                    <span className="tile-list-icon" aria-hidden="true"><ListIcon value={l.emoji} size={18} /></span>
                    <span className="tile-list-name">{l.pinned ? '📌 ' : ''}{l.title}</span>
                    <span className="muted">{mine.length ? `${done}/${mine.length}` : ''}</span>
                  </button>
                </li>
              );
            })}
            {sortedLists.length > 4 && (
              <li><button className="muted" onClick={() => openList(null)}>ועוד {sortedLists.length - 4}…</button></li>
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
