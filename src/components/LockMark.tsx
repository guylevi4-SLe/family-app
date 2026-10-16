import { Lock, LockOpen, UserLock } from 'lucide-react';

/** The lock marks, drawn from the app's icon set rather than as emoji. */
export function LockMark({ kind = 'password' }: { kind?: 'password' | 'private' | 'open' }) {
  const I = kind === 'private' ? UserLock : kind === 'open' ? LockOpen : Lock;
  return <I className="lock-mark" size="1em" strokeWidth={2.2} aria-hidden="true" />;
}
