import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { useAuthUser, useDoc } from './data/hooks';
import type { JoinRequest, Member } from './data/family';
import { SignIn } from './components/SignIn';
import { Onboarding, SignedInAs } from './components/Onboarding';
import { Waiting } from './components/Waiting';
import { Home } from './components/Home';
import { BrandLogo } from './components/BrandLogo';

const JOIN_KEY = 'pendingJoinCode';

/** Remembers an invite code from the link across the Google sign-in redirect. */
function useInviteCodeFromLink() {
  const [code, setCode] = useState<string>(() => {
    try {
      return localStorage.getItem(JOIN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('join');
    if (fromUrl) {
      try {
        localStorage.setItem(JOIN_KEY, fromUrl);
      } catch {
        /* storage unavailable: the code is still in state */
      }
      setCode(fromUrl);
      history.replaceState(null, '', '/');
    }
  }, []);
  const clear = () => {
    try {
      localStorage.removeItem(JOIN_KEY);
    } catch {
      /* ignore */
    }
    setCode('');
  };
  return [code, clear] as const;
}

export function App() {
  const user = useAuthUser();
  const [inviteCode, clearInviteCode] = useInviteCodeFromLink();
  const [profileTry, setProfileTry] = useState(0);
  const profile = useDoc<{ familyId?: string | null; startScreen?: string }>(
    user ? ['users', user.uid, `#${profileTry}`] : null,
  );
  const familyId = profile?.familyId ?? null;
  // Right after signing in again the device's cache is empty, and a failed
  // read looks just like "no family", so ask the server before offering to
  // join one.
  const [noFamily, setNoFamily] = useState<{ uid: string; state: 'confirmed' | 'offline' } | null>(null);
  const [check, setCheck] = useState(0);
  const uid = user?.uid;
  const profileLoaded = profile !== undefined;
  useEffect(() => {
    if (!uid || !profileLoaded || familyId) return;
    let live = true;
    setNoFamily(null);
    getDocFromServer(doc(db, 'users', uid))
      .then((snap) => {
        if (!live) return;
        if (snap.data()?.familyId) setProfileTry((t) => t + 1);
        else setNoFamily({ uid, state: 'confirmed' });
      })
      .catch(() => live && setNoFamily({ uid, state: 'offline' }));
    return () => {
      live = false;
    };
  }, [uid, profileLoaded, familyId, check]);
  useEffect(() => {
    if (noFamily?.state !== 'offline') return;
    const retry = () => setCheck((c) => c + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [noFamily?.state]);
  // An invite link opened by someone already in a family is left over; forget
  // it so the sign-in screen stops announcing an invite.
  useEffect(() => {
    if (familyId && inviteCode) clearInviteCode();
  }, [familyId, inviteCode]);
  // A denied read ends a listener, so re-subscribe to the membership once
  // the join request is approved.
  const [attempt, setAttempt] = useState(0);
  const membership = useDoc<Member>(
    user && familyId ? ['families', familyId, 'members', user.uid, `#${attempt}`] : null,
  );
  const request = useDoc<JoinRequest>(
    user && familyId && membership === null ? ['families', familyId, 'joinRequests', user.uid] : null,
  );
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const status = request?.status;
    if (status === 'approved' && lastStatus.current === 'pending') setAttempt((a) => a + 1);
    if (status) lastStatus.current = status;
  }, [request?.status]);
  // The local cache can still hold a membership that was revoked, so when a
  // read is denied, ask the server directly.
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    setRevoked(false);
  }, [familyId]);
  useEffect(() => {
    if (!user || !familyId || !membership) return;
    const recheck = () =>
      getDocFromServer(doc(db, 'families', familyId, 'members', user.uid))
        .then((snap) => !snap.exists() && setRevoked(true))
        .catch((e) => e?.code === 'permission-denied' && setRevoked(true));
    window.addEventListener('access-denied', recheck);
    return () => window.removeEventListener('access-denied', recheck);
  }, [user, familyId, membership]);

  if (user === undefined) return <Splash />;
  if (user === null) return <SignIn hasInvite={!!inviteCode} />;
  if (profile === undefined) return <Splash />;
  if (!familyId) {
    const state = noFamily?.uid === user.uid ? noFamily.state : null;
    if (!state) return <Splash />;
    if (state === 'offline') return <NoConnection onRetry={() => setCheck((c) => c + 1)} />;
    return <Onboarding inviteCode={inviteCode} onUsedInvite={clearInviteCode} />;
  }
  if (membership === undefined) return <Splash />;
  if (revoked) return <Waiting familyId={familyId} request={null} />;
  if (membership) return <Home familyId={familyId} me={membership} startScreen={profile?.startScreen} />;
  if (request === undefined) return <Splash />;
  return <Waiting familyId={familyId} request={request} />;
}

function NoConnection({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="center-page">
      <h1>אין חיבור לשרת</h1>
      <p className="muted">כדי למצוא את המשפחה שלכם צריך חיבור לאינטרנט. כשהחיבור יחזור, נמשיך מעצמנו.</p>
      <SignedInAs />
      <button className="primary big" onClick={onRetry}>
        נסו שוב
      </button>
      <button className="link muted" onClick={() => signOut(auth)}>
        התנתקות
      </button>
    </main>
  );
}

/** The logo on the background, as in index.html, so the page that loads first carries on unchanged. */
function Splash() {
  return (
    <div className="splash" aria-busy="true">
      <BrandLogo className="splash-logo" size={96} />
    </div>
  );
}
