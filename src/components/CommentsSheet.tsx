import { useEffect, useRef, useState } from 'react';
import { addComment, deleteComment, shrinkPhoto, type Comment, type TargetType } from '../data/comments';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

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
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const list = comments
    .filter((c) => c.targetType === type && c.targetId === targetId)
    .sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity));

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [list.length]);

  const send = () => {
    if (!text.trim() && !photo) return;
    addComment(familyId, type, targetId, text, photo ?? undefined);
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
              {c.image && (
                <button type="button" className="comment-photo" aria-label="הגדלת התמונה" onClick={() => setViewing(c.image!)}>
                  <img src={c.image} alt="תמונה שצורפה" />
                </button>
              )}
              {c.text && <p>{c.text}</p>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {photo && (
          <div className="photo-preview">
            <img src={photo} alt="התמונה שתישלח" />
            <button type="button" className="small" onClick={() => setPhoto(null)}>
              הסרת התמונה
            </button>
          </div>
        )}
        {photoError && <p className="error">{photoError}</p>}
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
          <button className="primary add-button" aria-label="שליחה" disabled={busy || (!text.trim() && !photo)}>
            ↑
          </button>
        </form>
      </div>
      {viewing && (
        <div className="photo-viewer" role="dialog" aria-label="תמונה" onClick={(e) => { e.stopPropagation(); setViewing(null); }}>
          <img src={viewing} alt="תמונה מוגדלת" />
        </div>
      )}
    </div>
  );
}
