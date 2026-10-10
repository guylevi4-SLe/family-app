import { useEffect, useRef, useState } from 'react';
import { addComment, deleteComment, type Comment, type TargetType } from '../data/comments';
import { useFamily } from './FamilyContext';

export function CommentsSheet({
  type,
  targetId,
  title,
  comments,
  onClose,
}: {
  type: TargetType;
  targetId: string;
  title: string;
  comments: Comment[];
  onClose: () => void;
}) {
  const { familyId, me } = useFamily();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const list = comments
    .filter((c) => c.targetType === type && c.targetId === targetId)
    .sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity));

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [list.length]);

  const send = () => {
    if (!text.trim()) return;
    addComment(familyId, type, targetId, text);
    setText('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={`תגובות על ${title}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>💬 {title}</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="comments">
          {list.length === 0 && <p className="muted">אין עדיין תגובות. מה דעתך?</p>}
          {list.map((c) => (
            <div key={c.id} className={`comment ${c.authorUid === me.id ? 'mine' : ''}`}>
              <div className="comment-meta">
                <strong>{c.authorName}</strong>
                <span className="muted">
                  {c.pending ? 'ממתין לשליחה' : c.createdAt?.toDate().toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {(c.authorUid === me.id || me.role === 'admin') && (
                  <button className="link muted" aria-label="מחיקת תגובה" onClick={() => deleteComment(familyId, c.id)}>
                    מחיקה
                  </button>
                )}
              </div>
              <p>{c.text}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form
          className="add-box comment-box"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={1}
            value={text}
            maxLength={1000}
            placeholder="כתיבת תגובה…"
            aria-label="כתיבת תגובה"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="primary add-button" aria-label="שליחה" disabled={!text.trim()}>
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
