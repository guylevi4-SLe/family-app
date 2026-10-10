import { useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth';
import { auth, usingEmulators } from '../firebase';

export function SignIn({ hasInvite }: { hasInvite: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const google = async () => {
    setBusy(true);
    setError('');
    try {
      // Redirect (not popup) works in iPhone home-screen apps.
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch {
      setBusy(false);
      setError('ההתחברות נכשלה. בדקו את החיבור לאינטרנט ונסו שוב');
    }
  };

  return (
    <main className="center-page">
      <div className="brand-mark" aria-hidden="true">🏠</div>
      <h1>הבית שלנו</h1>
      <p className="muted">
        {hasInvite ? 'קיבלת הזמנה להצטרף למשפחה. התחברו כדי להמשיך.' : 'רשימת קניות, משימות ויומן למשפחה.'}
      </p>
      <button className="primary big" onClick={google} disabled={busy || !navigator.onLine}>
        התחברות עם Google
      </button>
      {!navigator.onLine && <p className="muted">ההתחברות הראשונה דורשת חיבור לאינטרנט.</p>}
      {error && <p className="error">{error}</p>}
      {usingEmulators && <DevLogin />}
    </main>
  );
}

/** Test accounts for the local emulator only; never shown in production. */
function DevLogin() {
  const [name, setName] = useState('');
  const go = async () => {
    const email = `${name.trim().toLowerCase() || 'test'}@example.com`;
    try {
      await signInWithEmailAndPassword(auth, email, 'password');
    } catch {
      const cred = await createUserWithEmailAndPassword(auth, email, 'password');
      await updateProfile(cred.user, { displayName: name.trim() || 'בדיקה' });
      await cred.user.reload();
    }
  };
  return (
    <div className="dev-login">
      <p className="muted">מצב פיתוח</p>
      <input aria-label="שם לבדיקה" placeholder="שם לבדיקה (באנגלית)" value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={go}>כניסת בדיקה</button>
    </div>
  );
}
