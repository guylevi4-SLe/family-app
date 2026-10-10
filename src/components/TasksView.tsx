import { useState } from 'react';
import { addTask, updateTask, type Task } from '../data/tasks';
import { downloadIcs, googleCalendarLink, isoDate, type FamilyEvent } from '../data/events';
import { memberName, useFamily } from './FamilyContext';
import { CommentButton } from './CommentButton';

type Filter = 'all' | 'mine';

export function TasksView({ tasks }: { tasks: Task[] | undefined }) {
  const { familyId, me, members } = useFamily();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);

  const live = (tasks ?? []).filter((t) => !t.deleted && (filter === 'all' || t.assignee === me.id));
  const open = live
    .filter((t) => !t.done)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title, 'he'));
  const done = live.filter((t) => t.done);
  const today = isoDate(new Date());

  const submit = () => {
    if (!title.trim()) return;
    addTask(familyId, title, assignee, due || null);
    setTitle('');
    setDue('');
  };

  return (
    <main className="list-page">
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="add-box">
          <input
            value={title}
            maxLength={120}
            placeholder="משימה חדשה, למשל: להוציא את הכלב"
            aria-label="משימה חדשה"
            enterKeyHint="send"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="primary add-button" aria-label="הוספת משימה" disabled={!title.trim()}>
            +
          </button>
        </div>
        <div className="task-options">
          <div className="assign-row">
            <span className="assign-label">למי:</span>
            <div className="chips" role="group" aria-label="אחראי">
              <button type="button" className={assignee === null ? 'chip on' : 'chip'} onClick={() => setAssignee(null)}>
                כולם
              </button>
              {members.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={assignee === m.id ? 'chip on' : 'chip'}
                  onClick={() => setAssignee(m.id)}
                >
                  {m.displayName.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          {title.trim() && (
            <label className="inline-label">
              עד
              <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="תאריך יעד" />
            </label>
          )}
        </div>
      </form>

      <div className="segmented" role="group" aria-label="סינון">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          של כולם
        </button>
        <button className={filter === 'mine' ? 'on' : ''} onClick={() => setFilter('mine')}>
          שלי
        </button>
      </div>

      {tasks !== undefined && open.length === 0 && <p className="empty">אין משימות פתוחות 🎉</p>}
      {open.length > 0 && (
        <section className="dept">
          <ul>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} today={today} onEdit={() => setEditing(t)} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="dept bought">
          <button className="link" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            הושלמו ({done.length}) {showDone ? '▴' : '▾'}
          </button>
          {showDone && (
            <ul>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} onEdit={() => setEditing(t)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && <TaskSheet task={(tasks ?? []).find((t) => t.id === editing.id) ?? editing} members={members} onClose={() => setEditing(null)} />}
    </main>
  );

  function TaskRow({ task, today, onEdit }: { task: Task; today: string; onEdit: () => void }) {
    const who = memberName(members, task.assignee);
    const overdue = !task.done && task.due && task.due < today;
    return (
      <li className={`row ${task.done ? 'checked' : ''}`}>
        <button
          className="check-area"
          aria-pressed={task.done}
          onClick={() => updateTask(familyId, task.id, { done: !task.done })}
        >
          <span className="box round" aria-hidden="true">{task.done ? '✓' : ''}</span>
          <span className="name">
            {task.title}
            <span className="sub">
              {who && <span className="who-tag">{who}</span>}
              {task.due && <span className={overdue ? 'due overdue' : 'due'}>{formatDue(task.due, today)}</span>}
            </span>
          </span>
          {task.pending && <span className="pending-dot" aria-label="ממתין לסנכרון" />}
        </button>
        <CommentButton type="task" id={task.id} title={task.title} />
        <button className="icon-button edit" aria-label={`עריכת ${task.title}`} onClick={onEdit}>
          ✎
        </button>
      </li>
    );
  }
}

function formatDue(due: string, today: string) {
  if (due === today) return 'היום';
  const [y, m, d] = due.split('-').map(Number);
  const t = new Date();
  const tomorrow = isoDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
  if (due === tomorrow) return 'מחר';
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function TaskSheet({ task, members, onClose }: { task: Task; members: { id: string; displayName: string }[]; onClose: () => void }) {
  const { familyId } = useFamily();
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState<string | null>(task.assignee);
  const [due, setDue] = useState(task.due ?? '');
  const [free, setFree] = useState(true);
  // A dated task can be copied to a personal calendar as an all-day item.
  const asEvent: FamilyEvent | null = due
    ? { id: task.id, title: title.trim() || task.title, date: due, endDate: '', time: '', location: '', people: [], deleted: false, pending: false }
    : null;

  const save = () => {
    updateTask(familyId, task.id, { title: title.trim() || task.title, assignee, due: due || null });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={save}>
      <div className="sheet" role="dialog" aria-label={`עריכת ${task.title}`} onClick={(e) => e.stopPropagation()}>
        <label>
          משימה
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          אחראי
          <select value={assignee ?? ''} onChange={(e) => setAssignee(e.target.value || null)}>
            <option value="">כולם</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          תאריך יעד
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {asEvent && (
          <div className="calendar-export">
            <span className="field-label">הוספה ליומן האישי (העתק חד־פעמי, שינויים כאן לא יתעדכנו שם)</span>
            <label className="check-line">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              להציג אותי כפנוי (לא לחסום לי את היום)
            </label>
            <div className="inline">
              <a className="button-link" href={googleCalendarLink(asEvent, free)} target="_blank" rel="noopener noreferrer">
                יומן Google
              </a>
              <button type="button" className="small" onClick={() => downloadIcs(asEvent, free)}>
                יומן Apple
              </button>
            </div>
          </div>
        )}
        <CommentButton type="task" id={task.id} title={task.title} always />
        <div className="sheet-actions">
          <button className="primary" onClick={save}>
            שמירה
          </button>
          <button
            className="danger"
            onClick={() => {
              if (!window.confirm(`למחוק את המשימה "${task.title}"?`)) return;
              updateTask(familyId, task.id, { deleted: true });
              onClose();
            }}
          >
            מחיקה
          </button>
        </div>
      </div>
    </div>
  );
}
