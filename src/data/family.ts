import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { DEFAULT_DEPARTMENTS } from './departments';

export type Role = 'admin' | 'member' | 'child';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'מנהל',
  member: 'בן משפחה',
  child: 'ילד',
};

export interface Member {
  id: string;
  role: Role;
  displayName: string;
  email: string;
  photoURL: string;
}

export interface JoinRequest {
  id: string;
  inviteCode: string;
  role: Role;
  displayName: string;
  email: string;
  photoURL: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Invite {
  id: string;
  familyId: string;
  role: Role;
  expiresAt: Timestamp;
  usedBy: string | null;
}

const INVITE_DAYS = 7;
// No 0/O or 1/I so codes are easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function me() {
  const u = auth.currentUser!;
  return {
    uid: u.uid,
    displayName: (u.displayName || u.email || 'ללא שם').slice(0, 80),
    email: u.email ?? '',
    photoURL: u.photoURL ?? '',
  };
}

export function setMyFamily(familyId: string | null) {
  return setDoc(doc(db, 'users', me().uid), { familyId }, { merge: true });
}

export async function createFamily(name: string) {
  const u = me();
  const familyRef = doc(collection(db, 'families'));
  const batch = writeBatch(db);
  batch.set(familyRef, {
    name: name.trim().slice(0, 60),
    createdBy: u.uid,
    createdAt: serverTimestamp(),
    deptOrder: DEFAULT_DEPARTMENTS,
  });
  batch.set(doc(familyRef, 'members', u.uid), {
    role: 'admin',
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  await setMyFamily(familyRef.id);
}

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function createInvite(familyId: string, role: Role) {
  const code = randomCode();
  await setDoc(doc(db, 'invites', code), {
    familyId,
    role,
    createdBy: me().uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 86400000),
    usedBy: null,
  });
  return code;
}

export function inviteLink(code: string) {
  return `${location.origin}/?join=${code}`;
}

export function cancelInvite(code: string) {
  return deleteDoc(doc(db, 'invites', code));
}

export class JoinError extends Error {}

/** Claims an invite and files a join request; the admin still has to approve. */
export async function requestToJoin(rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new JoinError('הקוד צריך להיות באורך 6 תווים');
  const snap = await getDoc(doc(db, 'invites', code)).catch(() => null);
  if (!snap?.exists()) throw new JoinError('הקוד לא נמצא. בדקו שהוא הוקלד נכון, או בקשו הזמנה חדשה');
  const inv = snap.data() as Omit<Invite, 'id'>;
  if (inv.usedBy && inv.usedBy !== me().uid) throw new JoinError('ההזמנה הזו כבר נוצלה. בקשו הזמנה חדשה');
  if (inv.expiresAt.toMillis() < Date.now()) throw new JoinError('פג תוקף ההזמנה. בקשו הזמנה חדשה');
  const u = me();
  if (!inv.usedBy) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'invites', code), { usedBy: u.uid });
    batch.set(doc(db, 'families', inv.familyId, 'joinRequests', u.uid), {
      inviteCode: code,
      role: inv.role,
      displayName: u.displayName,
      email: u.email,
      photoURL: u.photoURL,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch {
      throw new JoinError('לא הצלחנו לשלוח את הבקשה. ייתכן שכבר יש לך בקשה קודמת למשפחה הזו');
    }
  }
  await setMyFamily(inv.familyId);
}

export async function decideRequest(familyId: string, req: JoinRequest, approve: boolean) {
  const uid = me().uid;
  const batch = writeBatch(db);
  batch.update(doc(db, 'families', familyId, 'joinRequests', req.id), {
    status: approve ? 'approved' : 'rejected',
    decidedBy: uid,
    decidedAt: serverTimestamp(),
  });
  if (approve) {
    batch.set(doc(db, 'families', familyId, 'members', req.id), {
      role: req.role,
      displayName: req.displayName,
      email: req.email,
      photoURL: req.photoURL,
      joinedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function removeMember(familyId: string, uid: string) {
  return deleteDoc(doc(db, 'families', familyId, 'members', uid));
}

/** After a rejection: drop the old request so a new invite can be used. */
export async function abandonRequest(familyId: string) {
  await deleteDoc(doc(db, 'families', familyId, 'joinRequests', me().uid)).catch(() => {});
  await setMyFamily(null);
}
