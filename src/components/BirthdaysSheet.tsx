import { useState } from 'react';
import {
  BIRTHDAY_GROUPS,
  addBirthday,
  birthdayGoogleLink,
  daysInMonth,
  daysUntil,
  deleteBirthday,
  downloadBirthdays,
  nextBirthday,
  updateBirthday,
  type Birthday,
  type BirthdayFields,
  type BirthdayGroup,
  type BirthdayOn,
} from '../data/birthdays';
import { useFamily } from './FamilyContext';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString('he-IL', { month: 'long' }));
const groupLabel = (g: BirthdayGroup) => BIRTHDAY_GROUPS.find((x) => x.id === g)?.label ?? '';

export function whenLabel(on: BirthdayOn) {
  const n = daysUntil(on.date);
  const age = on.age !== null ? (n === 0 ? ` · מלאו ${on.age}` : ` · ימלאו ${on.age}`) : '';
  const when = n === 0 ? 'היום! 🎉' : n === 1 ? 'מחר' : `בעוד ${n} ימים`;
  return `${when}${age}`;
}

/** The family's birthday book: upcoming first, by group, each one can go to a personal calendar. */
export function BirthdaysSheet({
  birthdays,
  initialId,
  newOn,
  onClose,
}: {
  birthdays: Birthday[] | undefined;
  initialId: string | null;
  /** Opens straight on a new birthday on this day and month (from the calendar's "+"). */
  newOn?: { day: number; month: number };
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Birthday | 'new' | null>(() => (newOn ? 'new' : (birthdays?.find((b) => b.id === initialId) ?? null)));
  const [group, setGroup] = useState<BirthdayGroup | 'all'>('all');
  const upcoming = (birthdays ?? [])
    .filter((b) => group === 'all' || b.group === group)
    .map((b) => nextBirthday(b))
    .sort((a, b) => a.date.localeCompare(b.date) || a.birthday.name.localeCompare(b.birthday.name, 'he'));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall birthdays-sheet" role="dialog" aria-label="ימי הולדת" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <BirthdayForm birthday={editing === 'new' ? null : editing} on={editing === 'new' ? newOn : undefined} onDone={() => setEditing(null)} />
        ) : (
          <>
            <div className="sheet-head">
              <h2>🎂 ימי הולדת</h2>
              <button className="icon-button" aria-label="סגירה" onClick={onClose}>
                ✕
              </button>
            </div>
            <button className="primary" onClick={() => setEditing('new')}>
              + יום הולדת
            </button>
            {(birthdays?.length ?? 0) > 0 && (
              <div className="chips" role="group" aria-label="קבוצה">
                <button type="button" className={group === 'all' ? 'chip on' : 'chip'} onClick={() => setGroup('all')}>
                  הכול
                </button>
                {BIRTHDAY_GROUPS.filter((g) => birthdays?.some((b) => b.group === g.id)).map((g) => (
                  <button type="button" key={g.id} className={group === g.id ? 'chip on' : 'chip'} onClick={() => setGroup(g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            {birthdays !== undefined && birthdays.length === 0 && (
              <p className="empty">עוד אין ימי הולדת. אפשר להוסיף משפחה קרובה, משפחה מורחבת וחברים, והם יופיעו בלו״ז בכל שנה.</p>
            )}
            <ul className="bday-list">
              {upcoming.map((on) => {
                const n = daysUntil(on.date);
                const [, mm, dd] = on.date.split('-').map(Number);
                return (
                  <li key={on.birthday.id}>
                    <button className={`bday ${n === 0 ? 'today' : n <= 7 ? 'soon' : ''}`} onClick={() => setEditing(on.birthday)}>
                      <span className="bday-date">
                        <strong>{dd}</strong>
                        <span>{MONTHS[mm - 1]}</span>
                      </span>
                      <span className="bday-main">
                        <strong>{on.birthday.name}</strong>
                        <span className="muted">
                          {whenLabel(on)} · {groupLabel(on.birthday.group)}
                        </span>
                      </span>
                      {on.birthday.pending && <span className="pending-dot" aria-label="ממתין לסנכרון" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {(birthdays?.length ?? 0) > 1 && (
              <button className="small" onClick={() => downloadBirthdays(birthdays!)}>
                📅 כל ימי ההולדת ליומן אפל / אאוטלוק (קובץ אחד)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BirthdayForm({ birthday, on, onDone }: { birthday: Birthday | null; on?: { day: number; month: number }; onDone: () => void }) {
  const { familyId } = useFamily();
  const [f, setF] = useState<BirthdayFields>(
    birthday
      ? { name: birthday.name, day: birthday.day, month: birthday.month, year: birthday.year, group: birthday.group }
      : { name: '', day: on?.day ?? 1, month: on?.month ?? new Date().getMonth() + 1, year: null, group: 'family' },
  );
  const thisYear = new Date().getFullYear();
  const maxDay = daysInMonth(f.month, f.year ?? 2024);
  const valid = f.name.trim().length > 0 && f.day <= maxDay && (f.year === null || (f.year >= 1900 && f.year <= thisYear));

  const save = () => {
    if (!valid) return;
    if (birthday) updateBirthday(familyId, birthday.id, f);
    else addBirthday(familyId, f);
    onDone();
  };

  return (
    <form className="bday-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="sheet-head">
        <h2>{birthday ? `🎂 ${birthday.name}` : '🎂 יום הולדת חדש'}</h2>
        <button type="button" className="icon-button" aria-label="חזרה" onClick={onDone}>
          ✕
        </button>
      </div>
      <label>
        <span className="field-label">של מי</span>
        <input value={f.name} maxLength={60} autoFocus={!birthday} placeholder="למשל: סבתא רחל" onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <div className="bday-date-row">
        <label>
          <span className="field-label">יום</span>
          <select value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d} disabled={d > maxDay}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">חודש</span>
          <select value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">שנה (לא חובה)</span>
          <input
            inputMode="numeric"
            placeholder="למשל 1985"
            value={f.year ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
              setF({ ...f, year: v ? Number(v) : null });
            }}
          />
        </label>
      </div>
      <div>
        <span className="field-label">קבוצה</span>
        <div className="chips" role="group" aria-label="קבוצה">
          {BIRTHDAY_GROUPS.map((g) => (
            <button type="button" key={g.id} className={f.group === g.id ? 'chip on' : 'chip'} aria-pressed={f.group === g.id} onClick={() => setF({ ...f, group: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        <button className="primary" disabled={!valid}>
          {birthday ? 'שמירה' : 'הוספה'}
        </button>
        <button type="button" onClick={onDone}>
          ביטול
        </button>
      </div>

      {birthday && (
        <>
          <div className="card export-card">
            <strong>הוספה ליומן שלי</strong>
            <span className="muted">נכנס ליומן כאירוע של יום שלם שחוזר כל שנה</span>
            <div className="sheet-actions">
              <a className="button-link" href={birthdayGoogleLink(birthday)} target="_blank" rel="noopener">
                יומן גוגל
              </a>
              <button type="button" onClick={() => downloadBirthdays([birthday])}>
                יומן אפל / אאוטלוק
              </button>
            </div>
          </div>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm(`למחוק את יום ההולדת של ${birthday.name}?`)) {
                deleteBirthday(familyId, birthday.id);
                onDone();
              }
            }}
          >
            מחיקת יום ההולדת
          </button>
        </>
      )}
    </form>
  );
}
