import { useEffect, useMemo, useState } from 'react';
import { useComments, useDoc, useEvents, useItems, useMembers, useOnline, usePendingRequests, useTasks } from '../data/hooks';
import type { Member } from '../data/family';
import { commentKey, type TargetType } from '../data/comments';
import { ShoppingList } from './ShoppingList';
import { FamilySettings } from './FamilySettings';
import { Dashboard } from './Dashboard';
import { TasksView } from './TasksView';
import { CalendarView } from './CalendarView';
import { CommentsSheet } from './CommentsSheet';
import { Icon, type IconName } from './Icon';
import { FamilyContext } from './FamilyContext';

interface Family {
  name: string;
  deptOrder: string[];
}

export type View = 'home' | 'list' | 'tasks' | 'calendar';

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'list', label: 'קניות', icon: 'cart' },
  { id: 'tasks', label: 'משימות', icon: 'tasks' },
  { id: 'calendar', label: 'יומן', icon: 'calendar' },
];

export const START_KEY = 'startScreen';

export function readCachedStart(): View | null {
  try {
    const v = localStorage.getItem(START_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as View) : null;
  } catch {
    return null;
  }
}

export function Home({ familyId, me, startScreen }: { familyId: string; me: Member; startScreen?: string | null }) {
  const family = useDoc<Family>(['families', familyId]);
  const items = useItems(familyId);
  const tasks = useTasks(familyId);
  const events = useEvents(familyId);
  const comments = useComments(familyId);
  const members = useMembers(familyId);
  const online = useOnline();
  const isAdmin = me.role === 'admin';
  const requests = usePendingRequests(familyId, isAdmin);
  const [view, setView] = useState<View>(
    () => readCachedStart() ?? (VIEWS.some((x) => x.id === startScreen) ? (startScreen as View) : 'home'),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [thread, setThread] = useState<{ type: TargetType; id: string; title: string } | null>(null);

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
    for (const c of comments ?? []) {
      const k = commentKey(c.targetType, c.targetId);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const pendingCount = [items, tasks, events, comments].reduce((n, rows) => n + (rows?.filter((r) => r.pending).length ?? 0), 0);
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
          <h1>{title}</h1>
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

        {view === 'home' && <Dashboard items={items} tasks={tasks} events={events} go={setView} />}
        {view === 'list' && <ShoppingList familyId={familyId} items={items} deptOrder={family?.deptOrder} />}
        {view === 'tasks' && <TasksView tasks={tasks} />}
        {view === 'calendar' && <CalendarView events={events} />}

        <nav className="bottom-nav" aria-label="ניווט">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}>
              <Icon name={v.icon} />
              {v.label}
            </button>
          ))}
        </nav>

        {thread && (
          <CommentsSheet type={thread.type} targetId={thread.id} title={thread.title} comments={comments ?? []} onClose={() => setThread(null)} />
        )}

        {settingsOpen && (
          <FamilySettings
            familyId={familyId}
            me={me}
            deptOrder={family?.deptOrder}
            pendingWrites={pendingCount}
            startScreen={(startScreen as View) ?? readCachedStart() ?? 'home'}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </FamilyContext.Provider>
  );
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
