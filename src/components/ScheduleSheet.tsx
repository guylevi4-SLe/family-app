import { useRef, useState } from 'react';
import { SCHOOL_DAYS, dayMessage, deleteSchedule, nextSchoolDay, saveSchedule, saveScheduleDays, scheduleImage, type Schedule } from '../data/schedules';
import { shareText } from './CommentsSheet';
import { Icon } from './Icon';
import { memberName, useFamily } from './FamilyContext';
import { ZoomViewer } from './ZoomViewer';

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
  const [draft, setDraft] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const schedule = schedules?.find((s) => s.id === uid);
  const canEdit = uid === me.id || me.role === 'admin';
  const whose = uid === me.id ? 'שלי' : `של ${memberName(members, uid)}`;
  const hasDays = !!schedule?.days?.some((d) => d.trim());
  const next = nextSchoolDay(new Date());
  const nextLabel = next.getDay() === (new Date().getDay() + 1) % 7 ? 'למחר' : `ליום ${SCHOOL_DAYS[next.getDay()]}`;
  const sendNext = () => shareText(dayMessage(memberName(members, uid).split(' ')[0], schedule?.days, new Date()).text);
  const saveDays = async () => {
    if (!draft) return;
    await saveScheduleDays(familyId, uid, draft);
    setDraft(null);
  };

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
          <h2>📚 מערכת השעות {whose}</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {members.length > 1 && (
          <div className="chips" role="group" aria-label="של מי">
            {members.map((m) => (
              <button key={m.id} type="button" className={m.id === uid ? 'chip on' : 'chip'} aria-pressed={m.id === uid} onClick={() => { setUid(m.id); setZoom(false); setDraft(null); }}>
                {m.id === me.id ? 'שלי' : m.displayName.split(' ')[0]}
                {schedules?.some((s) => s.id === m.id) ? ' 📚' : ''}
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
            {draft ? (
              <div className="schedule-days">
                <p className="muted small-print">
                  {!hasDays && schedule.suggested?.some((d) => d.trim()) ? 'Claude קרא את זה מהמערכת. כדאי לבדוק ולתקן לפני השמירה. ' : ''}
                  שיעור בכל שורה. אפשר לכתוב גם שעה, למשל "8:00 חשבון".
                </p>
                {SCHOOL_DAYS.map((name, i) => (
                  <label key={name}>
                    <span>יום {name}</span>
                    <textarea
                      rows={Math.max(3, draft[i].split('\n').length)}
                      value={draft[i]}
                      onChange={(e) => setDraft(draft.map((d, j) => (j === i ? e.target.value : d)))}
                    />
                  </label>
                ))}
                <div className="schedule-actions">
                  <button className="primary" onClick={saveDays}>שמירה</button>
                  <button className="small" onClick={() => setDraft(null)}>ביטול</button>
                </div>
              </div>
            ) : hasDays ? (
              <div className="schedule-send">
                <button type="button" className="ask-whatsapp" onClick={sendNext}>
                  <Icon name="whatsapp" size={18} /> שליחת המערכת {nextLabel} בוואטסאפ
                </button>
                {canEdit && (
                  <button type="button" className="link-button" onClick={() => setDraft(SCHOOL_DAYS.map((_, i) => schedule.days?.[i] ?? ''))}>
                    עריכת השיעורים לפי יום
                  </button>
                )}
              </div>
            ) : schedule.readStatus === 'reading' ? (
              <p className="muted schedule-reading">⏳ Claude קורא את המערכת…</p>
            ) : canEdit && schedule.suggested?.some((d) => d.trim()) ? (
              <div className="schedule-send">
                <button type="button" className="ask-whatsapp" onClick={() => setDraft(SCHOOL_DAYS.map((_, i) => schedule.suggested?.[i] ?? ''))}>
                  ✨ Claude קרא את המערכת. לבדוק ולאשר
                </button>
              </div>
            ) : (
              canEdit && (
                <div className="schedule-send">
                  {schedule.readStatus === 'failed' && <p className="muted small-print">לא הצלחנו לקרוא את המערכת אוטומטית.</p>}
                  <button type="button" className="ask-whatsapp" onClick={() => setDraft(SCHOOL_DAYS.map(() => ''))}>
                    📝 הוספת שיעורים לפי יום, כדי לשלוח יום אחד בוואטסאפ
                  </button>
                </div>
              )
            )}
            {zoom && <ZoomViewer src={schedule.image} alt={`מערכת השעות ${whose}`} onClose={() => setZoom(false)} />}
          </>
        ) : (
          <p className="muted">עדיין לא הועלתה מערכת שעות.</p>
        )}
        {error && <p className="error">{error}</p>}
        {canEdit && !draft && (
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
