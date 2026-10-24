import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { JoinError, createFamily, requestToJoin } from '../data/family';

export function Onboarding({ inviteCode, onUsedInvite }: { inviteCode: string; onUsedInvite: () => void }) {
  const [code, setCode] = useState(inviteCode);
  const [familyName, setFamilyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof JoinError ? e.message : 'משהו השתבש. בדקו את החיבור ונסו שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center-page">
      <h1>שלום {auth.currentUser?.displayName?.split(' ')[0] ?? ''}</h1>
      <SignedInAs />

      <section className="card">
        <h2>הצטרפות למשפחה</h2>
        <p className="muted">הכניסו את הקוד שקיבלתם ממנהל המשפחה.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await requestToJoin(code);
              onUsedInvite();
            });
          }}
        >
          <input
            className="code-input"
            dir="ltr"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            placeholder="ABC123"
            aria-label="קוד הזמנה"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="primary big" disabled={busy || code.trim().length < 6}>
            שליחת בקשה להצטרפות
          </button>
        </form>
      </section>

      {showCreate ? (
        <section className="card">
          <h2>משפחה חדשה</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createFamily(familyName));
            }}
          >
            <input
              placeholder="שם המשפחה, למשל: משפחת לוי"
              aria-label="שם המשפחה"
              value={familyName}
              maxLength={60}
              onChange={(e) => setFamilyName(e.target.value)}
            />
            <button className="primary big" disabled={busy || !familyName.trim()}>
              יצירת משפחה
            </button>
          </form>
          <p className="muted">תהיו המנהלים של המשפחה ותוכלו להזמין אליה אחרים.</p>
        </section>
      ) : (
        <button className="link" onClick={() => setShowCreate(true)}>
          אין לי קוד, אני רוצה ליצור משפחה חדשה
        </button>
      )}

      {error && <p className="error">{error}</p>}
      <button className="link muted" onClick={() => signOut(auth)}>
        התנתקות
      </button>
    </main>
  );
}

/** Which Google account is signed in, so joining with the wrong one is easy to spot. */
export function SignedInAs() {
  const email = auth.currentUser?.email;
  if (!email) return null;
  return (
    <p className="muted">
      מחוברים עם <span dir="ltr">{email}</span>
    </p>
  );
}
