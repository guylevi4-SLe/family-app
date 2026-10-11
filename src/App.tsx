import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';
import { useAuthUser, useDoc } from './data/hooks';
import type { JoinRequest, Member } from './data/family';
import { SignIn } from './components/SignIn';
import { Onboarding } from './components/Onboarding';
import { Waiting } from './components/Waiting';
import { Home } from './components/Home';

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
  const profile = useDoc<{ familyId?: string | null; startScreen?: string }>(user ? ['users', user.uid] : null);
  const familyId = profile?.familyId ?? null;
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
  if (!familyId) return <Onboarding inviteCode={inviteCode} onUsedInvite={clearInviteCode} />;
  if (membership === undefined) return <Splash />;
  if (revoked) return <Waiting familyId={familyId} request={null} />;
  if (membership) return <Home familyId={familyId} me={membership} startScreen={profile?.startScreen} />;
  if (request === undefined) return <Splash />;
  return <Waiting familyId={familyId} request={request} />;
}

function Splash() {
  return <div className="splash" aria-busy="true" />;
}
