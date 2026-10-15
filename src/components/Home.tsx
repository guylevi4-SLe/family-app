import { BrandLogo } from './BrandLogo';
import { useEffect, useMemo, useState } from 'react';
import { useComments, useTargetComments, useDoc, useEvents, useItems, useMembers, useOnline, usePendingRequests, useSchedules, useTasks, useLists, useListEntries, useBirthdays, usePrivateNotes } from '../data/hooks';
import type { Member } from '../data/family';
import { commentKey, type TargetType } from '../data/comments';
import { ShoppingList } from './ShoppingList';
import { FamilySettings } from './FamilySettings';
import { Dashboard } from './Dashboard';
import { TasksView } from './TasksView';
import { CalendarView } from './CalendarView';
import { CommentsSheet } from './CommentsSheet';
import { ChatView } from './ChatView';
import { ScheduleSheet } from './ScheduleSheet';
import { ListsView } from './ListsView';
import { BirthdaysSheet } from './BirthdaysSheet';
import { ErrorBoundary } from './ErrorBoundary';
import { defaultScheduleUid } from '../data/schedules';
import { Icon, type IconName } from './Icon';
import { clearBadge, takePendingUrl } from '../push';
import { FamilyContext } from './FamilyContext';

interface Family {
  name: string;
  deptOrder: string[];
}

export type View = 'home' | 'list' | 'calendar' | 'lists' | 'chat';
/** Where a screen can be opened: the bottom-bar screens, plus the calendar's tasks side. */
export type Screen = View | 'tasks';

/** How many chat messages are read at a time (the rest load on request). */
const CHAT_PAGE = 50;

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'list', label: 'קניות', icon: 'cart' },
  { id: 'calendar', label: 'יומן', icon: 'calendar' },
  { id: 'lists', label: 'רשימות', icon: 'list' },
  { id: 'chat', label: 'צ׳אט', icon: 'chat' },
];

export const START_KEY = 'startScreen';
const isScreen = (v: unknown): v is Screen => v === 'tasks' || VIEWS.some((x) => x.id === v);

export function readCachedStart(): Screen | null {
  try {
    const v = localStorage.getItem(START_KEY);
    return isScreen(v) ? v : null;
  } catch {
    return null;
  }
}

export function Home({ familyId, me, startScreen }: { familyId: string; me: Member; startScreen?: string | null }) {
  const family = useDoc<Family>(['families', familyId]);
  const items = useItems(familyId);
  const tasks = useTasks(familyId);
  const events = useEvents(familyId);
  const [chatSize, setChatSize] = useState(CHAT_PAGE);
  const comments = useComments(familyId, chatSize);
  const targetComments = useTargetComments(familyId);
  const schedules = useSchedules(familyId);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const familyLists = useLists(familyId);
  const privateNotes = usePrivateNotes(familyId, me.id);
  // Private notes join the family's lists and notes; each viewer gets only their own.
  const lists = useMemo(
    () => (familyLists ? [...familyLists, ...(privateNotes ?? []).filter((p) => !familyLists.some((l) => l.id === p.id))] : familyLists),
    [familyLists, privateNotes],
  );
  const listEntries = useListEntries(familyId);
  const [listId, setListId] = useState<string | null>(null);
  // The lists screen remembers its last tab: checklists (null) or notes ('' or a folder).
  const [noteFolder, setNoteFolderState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('listsTab') === 'notes' ? '' : null;
    } catch {
      return null;
    }
  });
  const setNoteFolder = (f: string | null) => {
    setNoteFolderState(f);
    try {
      localStorage.setItem('listsTab', f === null ? 'lists' : 'notes');
    } catch {
      /* private mode: the tab just isn't remembered */
    }
  };
  const birthdays = useBirthdays(familyId);
  // undefined: closed; null: the whole book; an id: that birthday.
  const [birthdayOpen, setBirthdayOpen] = useState<string | null | undefined>(undefined);
  const members = useMembers(familyId);
  const online = useOnline();
  const isAdmin = me.role === 'admin';
  const requests = usePendingRequests(familyId, isAdmin);
  const firstScreen: Screen = readCachedStart() ?? (isScreen(startScreen) ? startScreen : 'home');
  const [view, setView] = useState<View>(firstScreen === 'tasks' ? 'calendar' : firstScreen);
  const [plan, setPlan] = usePlanTab(firstScreen === 'tasks' ? 'tasks' : undefined);
  const go = (s: Screen) => {
    if (s === 'tasks' || s === 'calendar') setPlan(s === 'tasks' ? 'tasks' : 'schedule');
    setView(s === 'tasks' ? 'calendar' : s);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writeError, setWriteError] = useState('');

  const [thread, setThread] = useState<{ type: TargetType; id: string; title: string } | null>(null);

  // A tapped notification opens the app at /?open=comments&type=…&id=…
  const [deepLink, setDeepLink] = useState<DeepLink | null>(() => readDeepLink(location.href));
  useEffect(() => {
    // Opening the app (not via the notification itself) still lands on the newest notification.
    const openPending = async () => {
      const url = await takePendingUrl();
      clearBadge();
      const link = url && readDeepLink(url);
      if (link) setDeepLink(link);
    };
    openPending();
    const onVisible = () => document.visibilityState === 'visible' && openPending();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-url') {
        takePendingUrl(); // already handled by the tap
        setDeepLink(readDeepLink(e.data.url));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);
  useEffect(() => {
    if (!deepLink) return;
    if (deepLink === 'chat') {
      setThread(null);
      setView('chat');
      setDeepLink(null);
      history.replaceState(null, '', '/');
      return;
    }
    const list = deepLink.type === 'item' ? items : deepLink.type === 'task' ? tasks : events;
    if (list === undefined) return; // wait for data
    const target = list.find((x) => x.id === deepLink.id) as { name?: string; title?: string } | undefined;
    setThread({ ...deepLink, title: target?.name ?? target?.title ?? '' });
    go(deepLink.type === 'item' ? 'list' : deepLink.type === 'task' ? 'tasks' : 'calendar');
    setDeepLink(null);
    history.replaceState(null, '', '/');
  }, [deepLink, items, tasks, events]);

  // Swipe sideways to move between the bottom-bar screens. Deliberately firm:
  // a long, fast, clearly horizontal swipe, never inside sheets, inputs or
  // things that scroll sideways, so scrolling a list never switches screens.
  const overlayOpen = Boolean(thread || settingsOpen || scheduleFor || birthdayOpen !== undefined);
  useEffect(() => {
    if (overlayOpen) return;
    let start: { x: number; y: number; t: number } | null = null;
    const blocked = (el: EventTarget | null) =>
      el instanceof Element && Boolean(el.closest('input, textarea, select, .sheet-backdrop, .zoom-viewer, .chips, .month-grid, .bottom-nav, [data-no-swipe]'));
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && !blocked(e.target) && t.clientX > 24 && t.clientX < window.innerWidth - 24 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const fast = Date.now() - start.t < 900;
      start = null;
      if (!fast || Math.abs(dx) < Math.max(80, window.innerWidth * 0.25) || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (document.body.classList.contains('kb-open')) return;
      // RTL: the next screen sits to the left, so a right-to-left swipe moves forward.
      setView((v) => {
        const i = VIEWS.findIndex((x) => x.id === v) + (dx < 0 ? 1 : -1);
        return i >= 0 && i < VIEWS.length ? VIEWS[i].id : v;
      });
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [overlayOpen]);

  useEffect(() => {
    const onError = () => setWriteError('שינוי אחד לא נשמר בשרת. ייתכן שההרשאות שלך השתנו.');
    window.addEventListener('write-error', onError);
    return () => window.removeEventListener('write-error', onError);
  }, []);

  // iOS keeps fixed elements behind the on-screen keyboard; track its height
  // so the bottom add box rides above it and the nav bar hides while typing.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${kb}px`);
      document.body.classList.toggle('kb-open', kb > 80);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of targetComments ?? []) {
      if (c.targetType === 'chat') continue;
      const k = commentKey(c.targetType, c.targetId);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [targetComments]);

  const openTaskCount = (tasks ?? []).filter((t) => !t.deleted && !t.done).length;
  const pendingCount = [items, tasks, events, comments, lists, listEntries, birthdays].reduce((n, rows) => n + (rows?.filter((r) => r.pending).length ?? 0), 0);
  const requestCount = requests?.length ?? 0;
  const title = view === 'home' ? (family?.name ?? '') : VIEWS.find((v) => v.id === view)!.label;

  return (
    <FamilyContext.Provider
      value={{
        familyId,
        me,
        members: members ?? [],
        commentCounts,
        openComments: (type, id, t) => setThread({ type, id, title: t }),
      }}
    >
      <div className="app">
        <header className="topbar">
          <h1 className="with-logo">
            {view === 'home' ? (
              <BrandLogo className="title-logo" size={34} />
            ) : (
              // On every other screen the logo is the way back home.
              <button type="button" className="logo-home" aria-label="חזרה למסך הבית" onClick={() => go('home')}>
                <BrandLogo className="title-logo" size={34} />
              </button>
            )}
            {title}
          </h1>
          <SyncBadge online={online} pending={pendingCount} />
          <button className="icon-button" aria-label="הגדרות" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" />
            {requestCount > 0 && <span className="dot" aria-label={`${requestCount} בקשות הצטרפות`} />}
          </button>
        </header>

        {isAdmin && requestCount > 0 && (
          <button className="banner" onClick={() => setSettingsOpen(true)}>
            {requestCount === 1 ? 'בקשת הצטרפות אחת ממתינה לאישורך' : `${requestCount} בקשות הצטרפות ממתינות לאישורך`}
          </button>
        )}
        {writeError && (
          <button className="banner error-banner" onClick={() => setWriteError('')}>
            {writeError}
          </button>
        )}

        <ErrorBoundary resetKey={view}>
        {view === 'home' && <Dashboard items={items} tasks={tasks} events={events} schedules={schedules} lists={lists} listEntries={listEntries} birthdays={birthdays} go={go} openSchedule={setScheduleFor} openList={(id) => { setListId(id); if (!id) setNoteFolder(null); setView('lists'); }} />}
        {view === 'list' && <ShoppingList familyId={familyId} items={items} deptOrder={family?.deptOrder} />}
        {view === 'calendar' && (
          <main className="list-page planner">
            <div className="planner-tabs" role="tablist" aria-label="יומן ומשימות">
              <button role="tab" aria-selected={plan === 'schedule'} className={plan === 'schedule' ? 'on' : ''} onClick={() => setPlan('schedule')}>
                <Icon name="calendar" size={18} /> לו״ז
              </button>
              <button role="tab" aria-selected={plan === 'tasks'} className={plan === 'tasks' ? 'on' : ''} onClick={() => setPlan('tasks')}>
                <Icon name="tasks" size={18} /> משימות
                {openTaskCount > 0 && <span className="planner-count">{openTaskCount}</span>}
              </button>
            </div>
            {plan === 'tasks' ? (
              <TasksView tasks={tasks} />
            ) : (
              <CalendarView events={events} tasks={tasks} birthdays={birthdays} openBirthdays={setBirthdayOpen} openSchedule={() => setScheduleFor(defaultScheduleUid(schedules, (members ?? []).map((m) => m.id), me.id))} />
            )}
          </main>
        )}
        {view === 'lists' && <ListsView lists={lists} entries={listEntries} openId={listId} setOpenId={setListId} folder={noteFolder} setFolder={setNoteFolder} />}
        {view === 'chat' && <ChatView comments={comments} hasOlder={(comments?.length ?? 0) >= chatSize} showOlder={() => setChatSize((n) => n + CHAT_PAGE)} items={items} tasks={tasks} events={events} lists={lists} listEntries={listEntries} go={go} openList={(id) => { setListId(id); setView('lists'); }} />}
        </ErrorBoundary>

        <nav className="bottom-nav" aria-label="ניווט">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => {
                // Tapping "רשימות" again goes back to the top of its tab.
                if (v.id === 'lists' && view === 'lists') { setListId(null); if (noteFolder) setNoteFolder(''); }
                setView(v.id);
              }}>
              <Icon name={v.icon} />
              {v.label}
            </button>
          ))}
        </nav>

        {thread && (
          <CommentsSheet type={thread.type} targetId={thread.id} title={thread.title} comments={targetComments ?? []} onClose={() => setThread(null)} />
        )}

        {birthdayOpen !== undefined && <BirthdaysSheet birthdays={birthdays} initialId={birthdayOpen} onClose={() => setBirthdayOpen(undefined)} />}

        {scheduleFor && <ScheduleSheet schedules={schedules} initialUid={scheduleFor} onClose={() => setScheduleFor(null)} />}

        {settingsOpen && (
          <FamilySettings
            familyId={familyId}
            me={me}
            deptOrder={family?.deptOrder}
            pendingWrites={pendingCount}
            startScreen={readCachedStart() ?? (isScreen(startScreen) ? startScreen : 'home')}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </FamilyContext.Provider>
  );
}

type PlanTab = 'schedule' | 'tasks';
const PLAN_KEY = 'planTab';

/** Which side of the calendar screen is showing; remembered on this phone. */
function usePlanTab(initial?: PlanTab) {
  const [tab, setTab] = useState<PlanTab>(() => {
    if (initial) return initial;
    try {
      return localStorage.getItem(PLAN_KEY) === 'tasks' ? 'tasks' : 'schedule';
    } catch {
      return 'schedule';
    }
  });
  const set = (t: PlanTab) => {
    setTab(t);
    try {
      localStorage.setItem(PLAN_KEY, t);
    } catch {
      /* optional */
    }
  };
  return [tab, set] as const;
}

function SyncBadge({ online, pending }: { online: boolean; pending: number }) {
  if (!online) {
    return (
      <span className="sync offline" role="status">
        אין חיבור{pending > 0 ? ` · ${pending} ממתינים` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="sync pending" role="status">
        מסנכרן {pending}…
      </span>
    );
  }
  return (
    <span className="sync ok" role="status" aria-label="הכול מסונכרן">
      ✓
    </span>
  );
}

type DeepLink = { type: Exclude<TargetType, 'chat'>; id: string } | 'chat';

function readDeepLink(href: string): DeepLink | null {
  const q = new URL(href, location.origin).searchParams;
  if (q.get('open') === 'chat') return 'chat';
  const type = q.get('type');
  const id = q.get('id');
  if (q.get('open') !== 'comments' || !id || !['item', 'task', 'event'].includes(type ?? '')) return null;
  return { type: type as Exclude<TargetType, 'chat'>, id };
}
