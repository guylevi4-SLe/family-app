import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  terminate,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  ROLE_LABELS,
  cancelInvite,
  createInvite,
  decideRequest,
  inviteLink,
  removeMember,
  type Member,
  type Role,
} from '../data/family';
import { orderedDepartments } from '../data/departments';
import { useInvites, useMembers, usePendingRequests } from '../data/hooks';
import { START_KEY, type View } from './Home';
import { disablePush, enablePush, pushState, type PushState } from '../push';
import { PALETTES, applyPalette, readPalette, type Palette } from '../theme';

export function FamilySettings({
  familyId,
  me,
  deptOrder,
  pendingWrites,
  startScreen,
  onClose,
}: {
  familyId: string;
  me: Member;
  deptOrder: string[] | undefined;
  pendingWrites: number;
  startScreen: View;
  onClose: () => void;
}) {
  const isAdmin = me.role === 'admin';
  const members = useMembers(familyId);
  const requests = usePendingRequests(familyId, isAdmin);
  const invites = useInvites(familyId, isAdmin);
  const [error, setError] = useState('');
  const [start, setStart] = useState<View>(startScreen);
  const [palette, setPalette] = useState<Palette>(readPalette);

  const guard = (fn: () => Promise<unknown>) => () => {
    setError('');
    fn().catch(() => setError('הפעולה נכשלה. בדקו את החיבור ונסו שוב'));
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="הגדרות משפחה" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>המשפחה</h2>
          <button className="icon-button" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        {isAdmin && requests && requests.length > 0 && (
          <section className="card highlight">
            <h3>ממתינים לאישור</h3>
            {requests.map((r) => (
              <div key={r.id} className="person">
                {r.photoURL && <img src={r.photoURL} alt="" referrerPolicy="no-referrer" />}
                <div className="who">
                  <strong>{r.displayName}</strong>
                  <span className="muted" dir="ltr">
                    {r.email}
                  </span>
                  <span className="muted">יצטרף כ{ROLE_LABELS[r.role]}</span>
                </div>
                <button className="primary small" onClick={guard(() => decideRequest(familyId, r, true))}>
                  אישור
                </button>
                <button className="small" onClick={guard(() => decideRequest(familyId, r, false))}>
                  דחייה
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <h3>בני המשפחה</h3>
          {members?.map((m) => (
            <div key={m.id} className="person">
              {m.photoURL && <img src={m.photoURL} alt="" referrerPolicy="no-referrer" />}
              <div className="who">
                <strong>
                  {m.displayName}
                  {m.id === me.id ? ' (את/ה)' : ''}
                </strong>
                <span className="muted">{ROLE_LABELS[m.role]}</span>
              </div>
              {isAdmin && m.id !== me.id && (
                <button
                  className="small danger"
                  onClick={guard(async () => {
                    if (confirmRemove(m.displayName)) await removeMember(familyId, m.id);
                  })}
                >
                  הסרה
                </button>
              )}
            </div>
          ))}
        </section>

        {isAdmin && <InviteSection familyId={familyId} invites={invites ?? []} onError={setError} />}

        <DepartmentOrder familyId={familyId} deptOrder={deptOrder} />

        <PushCard uid={me.id} />

        <section className="card">
          <h3>ההגדרות שלי</h3>
          <label>
            האפליקציה נפתחת על
            <select
              value={start}
              onChange={(e) => {
                const v = e.target.value as View;
                setStart(v);
                try {
                  localStorage.setItem(START_KEY, v);
                } catch {
                  /* per-device copy is optional */
                }
                setDoc(doc(db, 'users', me.id), { startScreen: v }, { merge: true }).catch(() => {});
              }}
            >
              <option value="home">מסך הבית</option>
              <option value="list">רשימת הקניות</option>
              <option value="tasks">משימות</option>
              <option value="calendar">יומן</option>
              <option value="chat">צ׳אט משפחתי</option>
            </select>
          </label>
          <div>
            <span className="field-label">ערכת צבעים (בטלפון הזה)</span>
            <div className="chips" role="group" aria-label="ערכת צבעים">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={palette === p.id ? 'chip on' : 'chip'}
                  aria-pressed={palette === p.id}
                  onClick={() => {
                    setPalette(p.id);
                    applyPalette(p.id, true);
                  }}
                >
                  <span className="swatch" style={{ background: p.swatch }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <h3>החשבון שלי</h3>
          <p className="muted" dir="ltr">
            {auth.currentUser?.email}
          </p>
          {isAdmin && (
            <button className="small" onClick={guard(() => exportFamily(familyId))}>
              ייצוא כל נתוני המשפחה לקובץ
            </button>
          )}
          <button className="small danger" onClick={() => signOutAndWipe(pendingWrites)}>
            התנתקות מהמכשיר הזה
          </button>
        </section>
      </div>
    </div>
  );
}

function confirmRemove(name: string) {
  return window.confirm(`להסיר את ${name} מהמשפחה? הגישה שלו תיחסם מיד.`);
}

function InviteSection({
  familyId,
  invites,
  onError,
}: {
  familyId: string;
  invites: { id: string; role: Role; expiresAt: { toMillis(): number }; usedBy: string | null }[];
  onError: (m: string) => void;
}) {
  const [role, setRole] = useState<Role>('member');
  const [fresh, setFresh] = useState('');
  const open = invites.filter((i) => !i.usedBy && i.expiresAt.toMillis() > Date.now());

  const share = async (code: string) => {
    const text = `הזמנה להצטרף למשפחה שלנו באפליקציה. הקוד: ${code}`;
    const url = inviteLink(code);
    if (navigator.share) {
      await navigator.share({ text, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {});
    }
  };

  return (
    <section className="card">
      <h3>הזמנת בן משפחה</h3>
      <p className="muted">
        ההזמנה עובדת פעם אחת ובתוקף 7 ימים. אחרי שהמוזמן יתחבר, תצטרכו לאשר אותו כאן.
      </p>
      <div className="inline">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="תפקיד">
          <option value="member">בן משפחה</option>
          <option value="child">ילד</option>
          <option value="admin">מנהל</option>
        </select>
        <button
          className="primary"
          onClick={() =>
            createInvite(familyId, role)
              .then((code) => {
                setFresh(code);
                return share(code);
              })
              .catch(() => onError('לא הצלחנו ליצור הזמנה. יצירת הזמנה דורשת חיבור לאינטרנט'))
          }
        >
          יצירת הזמנה
        </button>
      </div>
      {open.map((i) => (
        <div key={i.id} className={`invite ${i.id === fresh ? 'fresh' : ''}`}>
          <code dir="ltr">{i.id}</code>
          <span className="muted">{ROLE_LABELS[i.role]}</span>
          <button className="small" onClick={() => share(i.id)}>
            שיתוף
          </button>
          <button className="small danger" onClick={() => cancelInvite(i.id).catch(() => {})}>
            ביטול
          </button>
        </div>
      ))}
    </section>
  );
}

function DepartmentOrder({ familyId, deptOrder }: { familyId: string; deptOrder: string[] | undefined }) {
  const [open, setOpen] = useState(false);
  const order = orderedDepartments(deptOrder);
  const move = (i: number, delta: number) => {
    const next = [...order];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateDoc(doc(db, 'families', familyId), { deptOrder: next }).catch(() => {});
  };
  return (
    <section className="card">
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        סדר המחלקות בסופר {open ? '▴' : '▾'}
      </button>
      {open && (
        <ol className="dept-order">
          {order.map((d, i) => (
            <li key={d}>
              <span>{d}</span>
              <button className="icon-button" aria-label={`להזיז את ${d} למעלה`} onClick={() => move(i, -1)} disabled={i === 0}>
                ▲
              </button>
              <button
                className="icon-button"
                aria-label={`להזיז את ${d} למטה`}
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
              >
                ▼
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function exportFamily(familyId: string) {
  const base = ['families', familyId] as const;
  const family = await getDoc(doc(db, ...base));
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    family: { id: familyId, ...family.data() },
  };
  for (const sub of ['members', 'items', 'tasks', 'events', 'categoryOverrides', 'comments', 'schedules']) {
    const snap = await getDocs(collection(db, ...base, sub));
    out[sub] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `family-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function signOutAndWipe(pendingWrites: number) {
  if (pendingWrites > 0 && !window.confirm(`יש ${pendingWrites} שינויים שעוד לא נשלחו. התנתקות עכשיו תמחק אותם. להמשיך?`)) {
    return;
  }
  await signOut(auth);
  // Remove the family's data from this device.
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => {});
  location.reload();
}

const PUSH_TEXT: Record<PushState, string> = {
  unconfigured: 'התראות לטלפון יופעלו בקרוב.',
  'needs-install': 'כדי לקבל התראות באייפון, צריך להוסיף את האפליקציה למסך הבית (Safari ← שיתוף ← הוספה למסך הבית) ולפתוח אותה משם.',
  unsupported: 'הדפדפן הזה לא תומך בהתראות.',
  blocked: 'ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון ← התראות ← לוי׳ס.',
  off: 'קבלו התראה עם צליל כשמישהו שולח לכם הערה.',
  on: 'ההתראות פעילות בטלפון הזה.',
};

function PushCard({ uid }: { uid: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pushState().then(setState);
  }, []);
  if (!state) return null;
  const run = (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError('');
    fn()
      .then(setState)
      .catch(() => setError('לא הצלחנו להפעיל התראות. נסו שוב עם חיבור לאינטרנט'))
      .finally(() => setBusy(false));
  };
  return (
    <section className="card">
      <h3>🔔 התראות</h3>
      <p className="muted">{PUSH_TEXT[state]}</p>
      {error && <p className="error">{error}</p>}
      {state === 'off' && (
        <button className="primary" disabled={busy} onClick={() => run(() => enablePush(uid))}>
          הפעלת התראות בטלפון הזה
        </button>
      )}
      {state === 'on' && (
        <button className="small" disabled={busy} onClick={() => run(() => disablePush(uid))}>
          כיבוי התראות בטלפון הזה
        </button>
      )}
    </section>
  );
}
