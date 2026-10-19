import { useRef, useState } from 'react';
import { deleteSchedule, saveSchedule, scheduleImage, type Schedule } from '../data/schedules';
import { memberName, useFamily } from './FamilyContext';
import { ZoomViewer } from './ZoomViewer';
import { BookOpen } from 'lucide-react';
import { InlineIcon } from './ChatIcons';

/** Shows a member's weekly timetable; they (or an admin) can upload a PDF or photo to replace it. */
export function ScheduleSheet({
  schedules,
  initialUid,
  onClose,
}: {
  schedules: Schedule[] | undefined;
  initialUid: string;
  onClose: () => void;
}) {
  const { familyId, me, members } = useFamily();
  const [uid, setUid] = useState(initialUid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const schedule = schedules?.find((s) => s.id === uid);
  const canEdit = uid === me.id || me.role === 'admin';
  const whose = uid === me.id ? 'שלי' : `של ${memberName(members, uid)}`;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      await saveSchedule(familyId, uid, await scheduleImage(file));
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ. נסו PDF אחר או צילום');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="מערכת שעות" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2><InlineIcon icon={BookOpen} size={20} />מערכת השעות {whose}</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {members.length > 1 && (
          <div className="chips" role="group" aria-label="של מי">
            {members.map((m) => (
              <button key={m.id} type="button" className={m.id === uid ? 'chip on' : 'chip'} aria-pressed={m.id === uid} onClick={() => { setUid(m.id); setZoom(false); }}>
                {m.id === me.id ? 'שלי' : m.displayName.split(' ')[0]}
                {schedules?.some((s) => s.id === m.id) && <InlineIcon icon={BookOpen} size={14} />}
              </button>
            ))}
          </div>
        )}
        {schedule ? (
          <>
            <button type="button" className="schedule-img" aria-label="פתיחה במסך מלא" onClick={() => setZoom(true)}>
              <img src={schedule.image} alt={`מערכת השעות ${whose}`} />
            </button>
            <p className="muted small-print">
              {schedule.pending
                ? 'ממתין לשליחה'
                : `עודכן ${schedule.updatedAt?.toDate().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }) ?? ''}${schedule.updatedBy !== uid ? ` ע״י ${memberName(members, schedule.updatedBy)}` : ''} · לחיצה על התמונה פותחת במסך מלא`}
            </p>
            {zoom && <ZoomViewer src={schedule.image} alt={`מערכת השעות ${whose}`} onClose={() => setZoom(false)} />}
          </>
        ) : (
          <p className="muted">עדיין לא הועלתה מערכת שעות.</p>
        )}
        {error && <p className="error">{error}</p>}
        {canEdit && (
          <div className="schedule-actions">
            <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" hidden aria-label="בחירת קובץ מערכת" onChange={(e) => pick(e.target.files?.[0])} />
            <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'מעלה…' : schedule ? 'החלפה במערכת חדשה (PDF או צילום)' : 'העלאת מערכת (PDF או צילום)'}
            </button>
            {schedule && (
              <button className="small" disabled={busy} onClick={() => deleteSchedule(familyId, uid)}>
                מחיקה
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
