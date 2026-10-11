import { useEffect, useRef, useState } from 'react';
import { addComment, deleteComment, editComment, shrinkPhoto, type Comment, type TargetType } from '../data/comments';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

export const byTime = (a: Comment, b: Comment) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity);

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
  const [viewing, setViewing] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = comments.filter((c) => c.targetType === type && c.targetId === targetId).sort(byTime);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [list.length]);

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
            <CommentBubble key={c.id} c={c} onPhoto={setViewing} />
          ))}
          <div ref={endRef} />
        </div>
        <Composer type={type} targetId={targetId} placeholder="כתיבת תגובה…" label="כתיבת תגובה" />
      </div>
      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export function CommentBubble({ c, onPhoto }: { c: Comment; onPhoto: (src: string) => void }) {
  const { familyId, me, members } = useFamily();
  const [draft, setDraft] = useState<string | null>(null);
  const mine = c.authorUid === me.id;
  const save = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t !== c.text && (t || c.image)) editComment(familyId, c.id, t);
    setDraft(null);
  };
  return (
    <div className={`comment ${mine ? 'mine' : ''}`}>
      <div className="comment-meta">
        <strong>{c.authorName}</strong>
        <span className="muted">
          {c.pending ? 'ממתין לשליחה' : c.createdAt?.toDate().toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {c.editedAt !== undefined && ' · נערך'}
        </span>
        {mine && draft === null && (
          <button className="link muted" aria-label="עריכת הודעה" onClick={() => setDraft(c.text)}>
            עריכה
          </button>
        )}
        {(mine || me.role === 'admin') && draft === null && (
          <button className="link muted" aria-label="מחיקת הודעה" onClick={() => deleteComment(familyId, c.id)}>
            מחיקה
          </button>
        )}
      </div>
      {c.image && (
        <button type="button" className="comment-photo" aria-label="הגדלת התמונה" onClick={() => onPhoto(c.image!)}>
          <img src={c.image} alt="תמונה שצורפה" />
        </button>
      )}
      {draft !== null ? (
        <div className="comment-edit">
          <textarea
            aria-label="עריכת ההודעה"
            value={draft}
            maxLength={1000}
            rows={Math.min(6, Math.max(2, draft.split('\n').length))}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="comment-edit-actions">
            <button className="primary" disabled={!draft.trim() && !c.image} onClick={save}>
              שמירה
            </button>
            <button onClick={() => setDraft(null)}>ביטול</button>
          </div>
        </div>
      ) : (
        c.text && <p>{c.text}</p>
      )}
      {c.notify && c.notify.length > 0 && (
        <span className="notified">🔔 {c.notify.map((u) => members.find((m) => m.id === u)?.displayName.split(' ')[0]).filter(Boolean).join(', ')}</span>
      )}
    </div>
  );
}

export function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="photo-viewer" role="dialog" aria-label="תמונה" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <img src={src} alt="תמונה מוגדלת" />
    </div>
  );
}

/** Text box with photo and "notify" chips, shared by comments and the family chat. */
export function Composer({
  type,
  targetId,
  placeholder,
  label,
  notifyLabel = 'הודעה ל',
}: {
  type: TargetType;
  targetId: string;
  placeholder: string;
  label: string;
  notifyLabel?: string;
}) {
  const { familyId, me, members } = useFamily();
  const [notify, setNotify] = useState<string[]>([]);
  const others = members.filter((m) => m.id !== me.id);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const send = () => {
    if (!text.trim() && !photo) return;
    addComment(familyId, type, targetId, text, photo ?? undefined, notify);
    setText('');
    setPhoto(null);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    setBusy(true);
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setPhotoError('לא הצלחנו לטעון את התמונה. נסו תמונה אחרת');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {photo && (
        <div className="photo-preview">
          <img src={photo} alt="התמונה שתישלח" />
          <button type="button" className="small" onClick={() => setPhoto(null)}>
            הסרת התמונה
          </button>
        </div>
      )}
      {photoError && <p className="error">{photoError}</p>}
      {others.length > 0 && (
        <div className="notify-row">
          <span className="assign-label">🔔 {notifyLabel}:</span>
          <div className="chips" role="group" aria-label={notifyLabel}>
            {others.map((m) => {
              const on = notify.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => setNotify(on ? notify.filter((x) => x !== m.id) : [...notify, m.id])}
                >
                  {m.displayName.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <form
        className="add-box comment-box"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="בחירת תמונה"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="photo-button"
          aria-label="צירוף תמונה"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="camera" size={22} />
        </button>
        <textarea
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="primary add-button" aria-label="שליחה" disabled={busy || (!text.trim() && !photo)}>
          ↑
        </button>
      </form>
    </>
  );
}
