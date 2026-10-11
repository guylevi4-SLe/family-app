import { useEffect, useRef, useState } from 'react';
import { CHAT_ID, type Comment, type TargetType } from '../data/comments';
import type { Item } from '../data/items';
import type { Task } from '../data/tasks';
import type { FamilyEvent } from '../data/events';
import { byTime, CommentBubble, Composer, PhotoViewer } from './CommentsSheet';
import { useFamily } from './FamilyContext';

const KIND: Record<Exclude<TargetType, 'chat'>, string> = { item: '🛒', task: '✅', event: '📅' };

/**
 * One family conversation. Chat messages show as bubbles; comments written on a
 * product, task or event show as a short line that opens that item.
 */
export function ChatView({
  comments,
  items,
  tasks,
  events,
}: {
  comments: Comment[] | undefined;
  items: Item[] | undefined;
  tasks: Task[] | undefined;
  events: FamilyEvent[] | undefined;
}) {
  const { openComments } = useFamily();
  const [viewing, setViewing] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = [...(comments ?? [])].sort(byTime);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [list.length]);

  const titleOf = (c: Comment) => {
    const rows: { id: string; name?: string; title?: string }[] =
      (c.targetType === 'item' ? items : c.targetType === 'task' ? tasks : events) ?? [];
    const t = rows.find((r) => r.id === c.targetId);
    return t?.name ?? t?.title ?? (c.targetType === 'item' ? c.targetId : '');
  };

  return (
    <main className="list-page chat-page">
      <div className="comments chat">
        {comments === undefined && <p className="muted">טוען…</p>}
        {comments?.length === 0 && <p className="muted">עדיין אין הודעות. כתבו משהו למשפחה!</p>}
        {list.map((c) => {
          if (c.targetType === 'chat') return <CommentBubble key={c.id} c={c} onPhoto={setViewing} />;
          const title = titleOf(c);
          return (
            <button key={c.id} type="button" className="chat-ref" onClick={() => openComments(c.targetType, c.targetId, title)}>
              <span aria-hidden="true">{KIND[c.targetType]}</span>
              <span>
                <strong>{c.authorName}</strong> על <strong>{title || 'פריט שנמחק'}</strong>: {c.text || '📷 תמונה'}
              </span>
            </button>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat-compose">
        <Composer type="chat" targetId={CHAT_ID} placeholder="הודעה למשפחה…" label="כתיבת הודעה" notifyLabel="הודעה ל" />
      </div>
      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
