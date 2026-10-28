import type { Item } from '../data/items';
import type { Task } from '../data/tasks';
import type { ReactNode } from 'react';
import { dayLabel, expandEvents, lastDay, isoDate, type FamilyEvent } from '../data/events';
import { useFamily } from './FamilyContext';
import type { Screen } from './Home';
import { Icon, type IconName } from './Icon';
import { defaultScheduleUid, type Schedule } from '../data/schedules';
import type { FamilyList } from '../data/lists';
import { birthdaysBetween, type Birthday } from '../data/birthdays';
import { Cake } from 'lucide-react';
import { InlineIcon } from './ChatIcons';

export function Dashboard({
  items,
  tasks,
  events,
  schedules,
  lists,
  birthdays,
  unreadChat,
  go,
  openSchedule,
  openList,
}: {
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
  schedules: Schedule[] | undefined;
  lists: FamilyList[] | undefined;
  birthdays: Birthday[] | undefined;
  /** Chat messages from others since this phone last opened the chat. */
  unreadChat: number;
  go: (s: Screen) => void;
  openSchedule: (uid: string) => void;
  openList: (id: string | null) => void;
}) {
  const { me, members } = useFamily();
  const toBuy = (items ?? []).filter((i) => !i.deleted && !i.checked);
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
    ...upcoming.map((e) => ({ key: `${e.id}:${e.date}`, date: e.date < today ? today : e.date, time: e.time, title: e.title, now: e.date < today, bday: false })),
    ...birthdaysBetween(birthdays ?? [], today, isoDate(inTwoWeeks)).map((b) => ({
      key: `bd:${b.birthday.id}`,
      date: b.date,
      time: '',
      title: `יום הולדת ל${b.birthday.name}${b.age !== null ? ` (${b.age})` : ''}`,
      now: false,
      bday: true,
    })),
  ].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));

  const live = (schedules ?? []).filter((s) => members.some((m) => m.id === s.id));
  const shown = live.find((s) => s.id === defaultScheduleUid(schedules, members.map((m) => m.id), me.id));
  // Every list and note, those in a locked folder too (folders themselves aren't counted).
  const notes = (lists ?? []).filter((l) => l.kind !== 'folder').length;
  const next = agenda[0];

  return (
    <main className="dashboard">
      <p className="greeting">{greeting(new Date(), me.displayName)}</p>
      <div className="tile-grid">
        {/* The square opens the shopping squares; "לרשימה" goes straight to the list, for the store. The count is on the square's badge. */}
        <Tile
          icon="cart"
          title="קניות"
          count={toBuy.length}
          onClick={() => go('shop')}
          action={{ label: 'לרשימה', onClick: () => go('list') }}
        />
        <Tile icon="tasks" title="משימות" count={open.length} onClick={() => go('tasks')}>
          {open.length === 0 ? 'אין משימות פתוחות' : mine.length > 0 ? `${mine.length} שלך` : `${open.length} פתוחות`}
        </Tile>
        <Tile className="schedule-tile" icon="book" title="מערכת שעות" onClick={() => openSchedule(shown?.id ?? me.id)}>
          {schedules === undefined ? '' : shown ? 'לחיצה לפתיחה' : 'לחיצה להעלאה'}
        </Tile>
        <Tile className="lists-tile" icon="list" title="פתקים" onClick={() => openList(null)}>
          {notes === 0 ? 'לחיצה ליצירה' : notes === 1 ? 'רשימה או פתק אחד' : `${notes} רשימות ופתקים`}
        </Tile>
        <Tile icon="calendar" title="יומן" onClick={() => go('calendar')}>
          {next ? (
            <>
              {next.now ? 'עכשיו' : dayLabel(next.date).split(' · ')[0]}: {next.bday && <InlineIcon icon={Cake} size={14} />}
              {next.title}
            </>
          ) : (
            'אין אירועים קרובים'
          )}
        </Tile>
        <Tile icon="chat" title="צ׳אט" count={unreadChat} onClick={() => go('chat')}>
          {unreadChat === 0 ? 'אין הודעות חדשות' : unreadChat === 1 ? 'הודעה חדשה' : `${unreadChat} הודעות חדשות`}
        </Tile>
      </div>
    </main>
  );
}

function Tile({ icon, title, count = 0, className, onClick, action, children }: { icon: IconName; title: string; count?: number; className?: string; onClick: () => void; action?: { label: string; onClick: () => void }; children?: ReactNode }) {
  const inner = (
    <>
      <span className="tile-icon"><Icon name={icon} size={26} /></span>
      {count > 0 && <span className="tile-count">{count}</span>}
      <span className="tile-text">
        <h2>{title}</h2>
        {children && <span className="tile-body">{children}</span>}
      </span>
    </>
  );
  // A tile with its own button: two buttons side by side in one square, since a button can't hold another.
  if (action) {
    return (
      <div className={`tile with-action${className ? ` ${className}` : ''}`}>
        <button className="tile-main" onClick={onClick}>{inner}</button>
        <button className="tile-action" onClick={action.onClick}>{action.label}</button>
      </div>
    );
  }
  return (
    <button className={`tile${className ? ` ${className}` : ''}`} onClick={onClick}>
      {inner}
    </button>
  );
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "ערב טוב, גיא · יום ראשון 18.10", by the time of day. */
function greeting(d: Date, name: string) {
  const h = d.getHours();
  const hello = h >= 5 && h < 12 ? 'בוקר טוב' : h >= 12 && h < 17 ? 'צהריים טובים' : h >= 17 && h < 22 ? 'ערב טוב' : 'לילה טוב';
  return `${hello}, ${name} · יום ${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}
