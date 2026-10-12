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
          {list.length === 0 && (
            <p className="muted">
              {type === 'item' ? 'אין עדיין הערות. אפשר לכתוב הערה, לצרף תמונה, או לשאול מישהו בוואטסאפ.' : 'אין עדיין תגובות. מה דעתך?'}
            </p>
          )}
          {list.map((c) => (
            <CommentBubble key={c.id} c={c} onPhoto={setViewing} />
          ))}
          <div ref={endRef} />
        </div>
        <Composer
          type={type}
          targetId={targetId}
          placeholder={type === 'item' ? 'הערה על המוצר…' : 'כתיבת תגובה…'}
          label="כתיבת תגובה"
          askAbout={type === 'item' ? title : undefined}
        />
      </div>
      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export function CommentBubble({ c, onPhoto }: { c: Comment; onPhoto: (src: string) => void }) {
  const { familyId, me, members } = useFamily();
  const [draft, setDraft] = useState<string | null>(null);
  const mine = c.authorUid === me.id;
  const [menu, setMenu] = useState(false);
  // Near the bottom of the screen the menu opens upwards so the typing box never hides it.
  const [up, setUp] = useState(false);
  const openMenu = () => {
    setUp((menuRef.current?.getBoundingClientRect().top ?? 0) > window.innerHeight * 0.55);
    setMenu(true);
  };
  const press = useRef<number | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
  const canDelete = mine || me.role === 'admin';

  // A tap anywhere else, or Escape, closes the menu.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  // Holding a message opens the same menu, as in WhatsApp.
  const holdStart = (e: React.PointerEvent) => {
    if (draft !== null || e.pointerType === 'mouse') return;
    press.current = window.setTimeout(() => {
      openMenu();
      navigator.vibrate?.(10);
    }, 500);
  };
  const holdEnd = () => window.clearTimeout(press.current);

  const save = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t !== c.text && (t || c.image)) editComment(familyId, c.id, t);
    setDraft(null);
  };
  return (
    <div
      className={`comment ${mine ? 'mine' : ''}`}
      onPointerDown={holdStart}
      onPointerUp={holdEnd}
      onPointerCancel={holdEnd}
      onPointerMove={(e) => (Math.abs(e.movementX) + Math.abs(e.movementY) > 6 ? holdEnd() : undefined)}
      onContextMenu={(e) => {
        if (draft !== null) return;
        e.preventDefault();
        openMenu();
      }}
    >
      <div className="comment-meta">
        <strong>{c.authorName}</strong>
        <span className="muted">
          {c.pending ? 'ממתין לשליחה' : c.createdAt?.toDate().toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {c.editedAt !== undefined && ' · נערך'}
        </span>
        {draft === null && (
          <div className="msg-menu" ref={menuRef}>
            <button type="button" className="link muted msg-more" aria-label="אפשרויות להודעה" aria-haspopup="menu" aria-expanded={menu} onClick={() => (menu ? setMenu(false) : openMenu())}>
              ⋯
            </button>
            {menu && (
              <div className={up ? 'msg-menu-list up' : 'msg-menu-list'} role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); shareMessage(c); }}>
                  <Icon name="whatsapp" size={18} /> שיתוף
                </button>
                {mine && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setDraft(c.text); }}>
                    ✏️ עריכה
                  </button>
                )}
                {canDelete && (
                  <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); if (window.confirm('למחוק את ההודעה?')) deleteComment(familyId, c.id); }}>
                    🗑️ מחיקה
                  </button>
                )}
              </div>
            )}
          </div>
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

/**
 * Passes a message on: the phone's share sheet (WhatsApp, with its photo) on
 * touch devices, WhatsApp with the text ready on a computer.
 */
function shareMessage(c: Comment) {
  // Only the words: WhatsApp already shows who is sending them.
  return shareText(c.text, c.image, 'תמונה מהצ׳אט המשפחתי');
}

/** Phone share sheet (with the photo) on touch devices, WhatsApp on a computer. */
export async function shareText(text: string, image?: string, fallback = '📷 תמונה') {
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.share) {
    try {
      if (image) {
        const blob = await (await fetch(image)).blob();
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], ...(text ? { text } : {}) });
          return;
        }
      }
      await navigator.share({ text: text || fallback });
    } catch {
      /* the person closed the share sheet */
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text || fallback)}`, '_blank', 'noopener');
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
  notifyLabel = 'לתייג את',
  notifyFirst = false,
  onCommand,
  hints,
  autoComplete,
  askAbout,
}: {
  type: TargetType;
  targetId: string;
  placeholder: string;
  label: string;
  notifyLabel?: string;
  /** Show the tag chips above the text box (the chat) instead of below it. */
  notifyFirst?: boolean;
  /** Handles a command instead of sending it: 'done' clears the box, 'keep' leaves it to fix, null sends it as written. */
  onCommand?: (text: string) => 'done' | 'keep' | null;
  /** Shortcuts offered above the box for what is being typed. */
  hints?: (text: string) => { label: string; insert: string }[];
  /** Rewrites what was typed (a shortcut grown into its full form), or null to keep it. */
  autoComplete?: (text: string) => string | null;
  /** A product's name: offers to ask about it on WhatsApp ("which washing-up liquid?"). */
  askAbout?: string;
}) {
  const { familyId, me, members } = useFamily();
  const [notify, setNotify] = useState<string[]>([]);
  const others = members.filter((m) => m.id !== me.id);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    if (!text.trim() && !photo) return;
    const handled = !photo && onCommand?.(text);
    if (handled === 'keep') return;
    if (handled === 'done') {
      setText('');
      return;
    }
    addComment(familyId, type, targetId, text, photo ?? undefined, notify);
    setText('');
    setPhoto(null);
  };

  /** Sends the question on WhatsApp (with the photo) and keeps it in the item's notes. */
  const ask = () => {
    const q = text.trim();
    const message = `שאלה על "${askAbout}" מרשימת הקניות:${q ? `\n${q}` : ''}`;
    shareText(message, photo ?? undefined);
    addComment(familyId, type, targetId, `❓ ${q || 'נשלחה שאלה בוואטסאפ'}`, photo ?? undefined, notify);
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

  const tagRow = others.length > 0 && (
        <div className="notify-row">
          <span className="assign-label">{notifyFirst ? '🔔' : '🏷️'} {notifyLabel}:</span>
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
  );

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
      {hints && hints(text).length > 0 && (
        <div className="command-hints" role="group" aria-label="פקודות מהירות">
          {hints(text).map((h) => (
            <button type="button" key={h.insert} className="chip" onClick={() => {
                setText(h.insert);
                boxRef.current?.focus();
              }}>
              {h.label}
            </button>
          ))}
        </div>
      )}
      {notifyFirst && tagRow}
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
          ref={boxRef}
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => {
            const v = e.target.value;
            // Only while typing forward, so deleting back past "@קניות: " is not undone.
            setText((v.length > text.length && autoComplete?.(v)) || v);
          }}
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
      {!notifyFirst && tagRow}
      {askAbout && (
        <button type="button" className="ask-whatsapp" onClick={ask}>
          <Icon name="whatsapp" size={18} /> {text.trim() || photo ? 'לשלוח כשאלה בוואטסאפ' : 'שאלה על המוצר בוואטסאפ'}
        </button>
      )}
    </>
  );
}
