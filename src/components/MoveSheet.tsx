import { Check, Folder, Notebook } from 'lucide-react';
import { folderPath, lockOf, type FamilyList } from '../data/lists';
import { rememberedKey } from '../data/noteCrypto';
import { LockMark } from './LockMark';

/**
 * Picks the folder a note moves to. From a swiped row (`quick`), folders that
 * would lock or unlock the note are left for the note's own ⋮ menu, since that
 * move re-encrypts its text and files.
 */
export function MoveSheet({
  all,
  note,
  quick,
  onPick,
  onClose,
}: {
  all: FamilyList[];
  note: FamilyList;
  quick?: boolean;
  onPick: (folderId: string) => void;
  onClose: () => void;
}) {
  const current = all.some((l) => l.id === note.parentId && l.kind === 'folder') ? note.parentId ?? '' : '';
  const sameLock = (id: string) => {
    const lock = lockOf(all, id);
    return lock ? note.lockFolder === lock.id : !note.lockFolder;
  };
  const targets = [
    { id: '', label: 'בלי תיקייה (ראשי)', locked: false, shut: false },
    ...all
      .filter((l) => l.kind === 'folder')
      .map((f) => {
        const lock = lockOf(all, f.id);
        return { id: f.id, label: folderPath(all, f.id).join(' › '), locked: !!lock, shut: !!lock && !rememberedKey(lock.salt) };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'he')),
  ];
  const held = quick && targets.some((t) => t.id !== current && !sameLock(t.id));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet more-sheet" role="dialog" aria-label={`העברה לתיקייה: ${note.title}`} onClick={(e) => e.stopPropagation()}>
        <strong className="more-title">להעביר את "{note.title}" אל</strong>
        <ul className="more-items">
          {targets.map((t) => (
            <li key={t.id || 'root'}>
              <button
                className="more-item"
                disabled={t.id === current || t.shut || (quick && !sameLock(t.id))}
                onClick={() => {
                  onClose();
                  onPick(t.id);
                }}
              >
                <span className="more-icon" aria-hidden="true">{t.id ? <Folder size={20} /> : <Notebook size={20} />}</span>
                {t.locked && <LockMark />}
                {t.label}
                {t.id === current && <Check className="move-current" size={18} aria-label="כאן עכשיו" />}
              </button>
            </li>
          ))}
        </ul>
        {held && <p className="muted note-hint">כדי להעביר לתיקייה נעולה או ממנה, פותחים את הפתק ובוחרים ⋮ ואז "העברה לתיקייה".</p>}
        {targets.some((t) => t.shut) && <p className="muted note-hint">תיקייה נעולה זמינה אחרי שפותחים אותה עם הסיסמה.</p>}
        <button className="more-cancel" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}
