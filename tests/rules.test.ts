// Security-rules tests. Run with `npm run test:rules` (starts the Firestore emulator).
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const users = {
  dad: { uid: 'dad', email: 'dad@example.com' },
  daughter: { uid: 'daughter', email: 'kid@example.com' },
  son: { uid: 'son', email: 'son@example.com' },
  neighbor: { uid: 'neighbor', email: 'neighbor@example.com' },
  stranger: { uid: 'stranger', email: 'stranger@example.com' },
};
type Who = keyof typeof users;

function db(who: Who): Firestore {
  const u = users[who];
  return env.authenticatedContext(u.uid, { email: u.email }).firestore() as unknown as Firestore;
}
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const inDays = (d: number) => Timestamp.fromMillis(Date.now() + d * 86400000);

async function foundFamily(who: Who, fid: string) {
  const d = db(who);
  const b = writeBatch(d);
  b.set(doc(d, 'families', fid), {
    name: 'משפחה', createdBy: users[who].uid, createdAt: serverTimestamp(), deptOrder: [],
  });
  b.set(doc(d, 'families', fid, 'members', users[who].uid), {
    role: 'admin', displayName: who, email: users[who].email, photoURL: '', joinedAt: serverTimestamp(),
  });
  return b.commit();
}

async function createInvite(who: Who, fid: string, code: string, role = 'member', days = 7) {
  const d = db(who);
  return setDoc(doc(d, 'invites', code), {
    familyId: fid, role, createdBy: users[who].uid, createdAt: serverTimestamp(),
    expiresAt: inDays(days), usedBy: null,
  });
}

async function requestToJoin(who: Who, fid: string, code: string, role = 'member') {
  const d = db(who);
  const b = writeBatch(d);
  b.update(doc(d, 'invites', code), { usedBy: users[who].uid });
  b.set(doc(d, 'families', fid, 'joinRequests', users[who].uid), {
    inviteCode: code, role, displayName: who, email: users[who].email, photoURL: '',
    status: 'pending', createdAt: serverTimestamp(),
  });
  return b.commit();
}

async function approve(admin: Who, fid: string, who: Who, role = 'member') {
  const d = db(admin);
  const b = writeBatch(d);
  b.update(doc(d, 'families', fid, 'joinRequests', users[who].uid), {
    status: 'approved', decidedBy: users[admin].uid, decidedAt: serverTimestamp(),
  });
  b.set(doc(d, 'families', fid, 'members', users[who].uid), {
    role, displayName: who, email: users[who].email, photoURL: '', joinedAt: serverTimestamp(),
  });
  return b.commit();
}

function item(who: Who, name: string) {
  return {
    name, norm: name, qty: '', category: 'אחר', checked: false, deleted: false,
    addedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: users[who].uid,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // Two separate families: ours (dad) and the neighbors'.
  await foundFamily('dad', 'levi');
  await foundFamily('neighbor', 'cohen');
  await setDoc(doc(db('dad'), 'families', 'levi', 'items', 'חלב'), item('dad', 'חלב'));
});

describe('family separation', () => {
  it('a member reads their own family', async () => {
    await assertSucceeds(getDoc(doc(db('dad'), 'families', 'levi', 'items', 'חלב')));
  });
  it('another family cannot read, list or write our data', async () => {
    const n = db('neighbor');
    await assertFails(getDoc(doc(n, 'families', 'levi')));
    await assertFails(getDoc(doc(n, 'families', 'levi', 'items', 'חלב')));
    await assertFails(getDocs(collection(n, 'families', 'levi', 'items')));
    await assertFails(getDocs(collection(n, 'families', 'levi', 'members')));
    await assertFails(setDoc(doc(n, 'families', 'levi', 'items', 'x'), item('neighbor', 'x')));
    await assertFails(updateDoc(doc(n, 'families', 'levi', 'items', 'חלב'), { checked: true }));
  });
  it('signed-out users read nothing', async () => {
    await assertFails(getDoc(doc(anon(), 'families', 'levi')));
    await assertFails(getDoc(doc(anon(), 'families', 'levi', 'items', 'חלב')));
    await assertFails(getDoc(doc(anon(), 'invites', 'ABCDEF')));
  });
  it('nobody can take over an existing family by "founding" it again', async () => {
    await assertFails(foundFamily('stranger', 'levi'));
  });
  it('nobody can add themselves as a member directly', async () => {
    const s = db('stranger');
    await assertFails(setDoc(doc(s, 'families', 'levi', 'members', 'stranger'), {
      role: 'admin', displayName: 's', email: users.stranger.email, photoURL: '', joinedAt: serverTimestamp(),
    }));
  });
  it('users can only read their own profile', async () => {
    await assertSucceeds(setDoc(doc(db('dad'), 'users', 'dad'), { familyId: 'levi' }));
    await assertFails(getDoc(doc(db('stranger'), 'users', 'dad')));
    await assertFails(setDoc(doc(db('stranger'), 'users', 'dad'), { familyId: 'cohen' }));
  });
});

describe('joining: invite, request, approval', () => {
  it('full happy path', async () => {
    await assertSucceeds(createInvite('dad', 'levi', 'CODE01', 'child'));
    await assertSucceeds(requestToJoin('daughter', 'levi', 'CODE01', 'child'));
    // Pending: still no access.
    await assertFails(getDoc(doc(db('daughter'), 'families', 'levi', 'items', 'חלב')));
    await assertSucceeds(getDoc(doc(db('daughter'), 'families', 'levi', 'joinRequests', 'daughter')));
    await assertSucceeds(approve('dad', 'levi', 'daughter', 'child'));
    await assertSucceeds(getDoc(doc(db('daughter'), 'families', 'levi', 'items', 'חלב')));
  });
  it('only an admin can create invites', async () => {
    await assertFails(createInvite('stranger', 'levi', 'CODE02'));
    await assertFails(createInvite('neighbor', 'levi', 'CODE02'));
    // a regular member and a child cannot invite either
    await createInvite('dad', 'levi', 'CODE03', 'member');
    await requestToJoin('son', 'levi', 'CODE03', 'member');
    await approve('dad', 'levi', 'son', 'member');
    await assertFails(createInvite('son', 'levi', 'CODE04'));
  });
  it('invites cannot be listed by outsiders', async () => {
    await createInvite('dad', 'levi', 'CODE05');
    await assertFails(getDocs(query(collection(db('stranger'), 'invites'), where('familyId', '==', 'levi'))));
    await assertSucceeds(getDocs(query(collection(db('dad'), 'invites'), where('familyId', '==', 'levi'))));
  });
  it('an invite works only once', async () => {
    await createInvite('dad', 'levi', 'CODE06');
    await assertSucceeds(requestToJoin('son', 'levi', 'CODE06'));
    await assertFails(requestToJoin('stranger', 'levi', 'CODE06'));
  });
  it('an expired invite does not work', async () => {
    // Created valid, then the clock is simulated by writing an expired invite as admin-bypass.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'invites', 'OLD001'), {
        familyId: 'levi', role: 'member', createdBy: 'dad', createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() - 1000), usedBy: null,
      });
    });
    await assertFails(requestToJoin('son', 'levi', 'OLD001'));
  });
  it('a cancelled invite does not work', async () => {
    await createInvite('dad', 'levi', 'CODE07');
    await assertSucceeds(deleteDoc(doc(db('dad'), 'invites', 'CODE07')));
    await assertFails(requestToJoin('son', 'levi', 'CODE07'));
  });
  it('an invite cannot be used to request a higher role', async () => {
    await createInvite('dad', 'levi', 'CODE08', 'child');
    await assertFails(requestToJoin('daughter', 'levi', 'CODE08', 'admin'));
  });
  it('an invite for one family cannot be used to join another', async () => {
    await createInvite('neighbor', 'cohen', 'CODE09');
    await assertFails(requestToJoin('stranger', 'levi', 'CODE09'));
  });
  it('a requester cannot approve themselves', async () => {
    await createInvite('dad', 'levi', 'CODE10');
    await requestToJoin('stranger', 'levi', 'CODE10');
    const s = db('stranger');
    await assertFails(updateDoc(doc(s, 'families', 'levi', 'joinRequests', 'stranger'), {
      status: 'approved', decidedBy: 'stranger', decidedAt: serverTimestamp(),
    }));
    await assertFails(approve('stranger', 'levi', 'stranger'));
  });
  it('an admin cannot approve with a different role than invited', async () => {
    await createInvite('dad', 'levi', 'CODE11', 'child');
    await requestToJoin('daughter', 'levi', 'CODE11', 'child');
    await assertFails(approve('dad', 'levi', 'daughter', 'admin'));
  });
  it('a rejected requester gets no access and cannot be approved later', async () => {
    await createInvite('dad', 'levi', 'CODE12');
    await requestToJoin('stranger', 'levi', 'CODE12');
    await assertSucceeds(updateDoc(doc(db('dad'), 'families', 'levi', 'joinRequests', 'stranger'), {
      status: 'rejected', decidedBy: 'dad', decidedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(db('stranger'), 'families', 'levi', 'items', 'חלב')));
    await assertFails(approve('dad', 'levi', 'stranger'));
  });
  it('a member and a child cannot approve requests', async () => {
    await createInvite('dad', 'levi', 'CODE13', 'child');
    await requestToJoin('daughter', 'levi', 'CODE13', 'child');
    await approve('dad', 'levi', 'daughter', 'child');
    await createInvite('dad', 'levi', 'CODE14');
    await requestToJoin('stranger', 'levi', 'CODE14');
    await assertFails(approve('daughter', 'levi', 'stranger'));
  });
  it('a removed member loses access', async () => {
    await createInvite('dad', 'levi', 'CODE15');
    await requestToJoin('son', 'levi', 'CODE15');
    await approve('dad', 'levi', 'son');
    await assertSucceeds(getDoc(doc(db('son'), 'families', 'levi', 'items', 'חלב')));
    await assertSucceeds(deleteDoc(doc(db('dad'), 'families', 'levi', 'members', 'son')));
    await assertFails(getDoc(doc(db('son'), 'families', 'levi', 'items', 'חלב')));
  });
  it('a member cannot promote themselves', async () => {
    await createInvite('dad', 'levi', 'CODE16');
    await requestToJoin('son', 'levi', 'CODE16');
    await approve('dad', 'levi', 'son');
    await assertFails(updateDoc(doc(db('son'), 'families', 'levi', 'members', 'son'), { role: 'admin' }));
  });
});

describe('tasks and events', () => {
  const task = (who: Who) => ({
    title: 'לתלות כביסה', assignee: 'daughter', due: '2026-10-12', done: false, deleted: false,
    createdBy: users[who].uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: users[who].uid,
  });
  const event = (who: Who) => ({
    title: 'חוג', date: '2026-10-12', time: '17:00', location: 'מתנ"ס', people: ['daughter'], deleted: false,
    createdBy: users[who].uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: users[who].uid,
  });
  it('members manage tasks and events; other families cannot see them', async () => {
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'tasks', 't1'), task('dad')));
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'e1'), event('dad')));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'tasks', 't1')));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'events', 'e1')));
    await assertFails(setDoc(doc(db('neighbor'), 'families', 'levi', 'tasks', 't2'), task('neighbor')));
  });
  it('rejects malformed tasks and events', async () => {
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'tasks', 't3'), { ...task('dad'), due: 'tomorrow' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'e3'), { ...event('dad'), time: '5pm' }));
    const ev = event('dad') as { date: string };
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'trip'), { ...ev, endDate: '2099-12-31' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'e4'), { ...ev, endDate: ev.date }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'e5'), { ...ev, endDate: 'tomorrow' }));
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'w1'), { ...ev, repeat: 'weekly', repeatUntil: '' }));
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'w2'), { ...ev, repeat: 'weekly', repeatUntil: '2099-12-31' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'w3'), { ...ev, repeat: 'daily' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'events', 'w4'), { ...ev, repeat: 'weekly', repeatUntil: ev.date }));
    await assertFails(deleteDoc(doc(db('dad'), 'families', 'levi', 'tasks', 't1')));
  });
});

describe('shopping list and comments', () => {
  it('members cannot hard-delete items or write foreign fields', async () => {
    await assertFails(deleteDoc(doc(db('dad'), 'families', 'levi', 'items', 'חלב')));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'items', 'x'), { ...item('dad', 'x'), evil: 1 }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'items', 'x'), { ...item('dad', 'x'), updatedBy: 'someone' }));
  });
  it('comments: authors edit their own, others cannot', async () => {
    await createInvite('dad', 'levi', 'CODE17', 'child');
    await requestToJoin('daughter', 'levi', 'CODE17', 'child');
    await approve('dad', 'levi', 'daughter', 'child');
    const c = { targetType: 'item', targetId: 'חלב', text: 'לא צריך!', authorName: 'בת', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('daughter'), 'families', 'levi', 'comments', 'c1'), { ...c, authorUid: 'daughter' }));
    await assertFails(setDoc(doc(db('daughter'), 'families', 'levi', 'comments', 'c2'), { ...c, authorUid: 'dad' }));
    await assertFails(updateDoc(doc(db('dad'), 'families', 'levi', 'comments', 'c1'), { text: 'כן צריך', editedAt: serverTimestamp() }));
    const mine = doc(db('daughter'), 'families', 'levi', 'comments', 'c1');
    await assertSucceeds(updateDoc(mine, { text: 'בעצם כן צריך', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(mine, { text: '', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(mine, { text: 'x', authorName: 'אבא', editedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'comments', 'c1')));
  });
  it('comments: may carry a small JPEG photo, nothing else', async () => {
    const c = { targetType: 'item', targetId: 'קמח', authorUid: 'dad', authorName: 'אבא', createdAt: serverTimestamp() };
    const ref = (id: string) => doc(db('dad'), 'families', 'levi', 'comments', id);
    await assertSucceeds(setDoc(ref('p1'), { ...c, text: '', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }));
    await assertSucceeds(setDoc(ref('p2'), { ...c, text: 'את זה', image: 'data:image/jpeg;base64,/9j/4AAQ' }));
    await assertFails(setDoc(ref('p3'), { ...c, text: '' }));
    await assertFails(setDoc(ref('p4'), { ...c, text: '', image: 'data:text/html;base64,PGgxPg==' }));
    await assertFails(setDoc(ref('p5'), { ...c, text: '', image: 'data:image/jpeg;base64,' + 'A'.repeat(700001) }));
  });
  it('comments may name up to 20 people to notify', async () => {
    const c = { targetType: 'item', targetId: 'קמח', text: 'סוגת', authorUid: 'dad', authorName: 'אבא', createdAt: serverTimestamp() };
    const ref = (id: string) => doc(db('dad'), 'families', 'levi', 'comments', id);
    await assertSucceeds(setDoc(ref('n1'), { ...c, notify: ['mom'] }));
    await assertFails(setDoc(ref('n2'), { ...c, notify: 'mom' }));
    await assertFails(setDoc(ref('n3'), { ...c, notify: Array(21).fill('x') }));
  });
  it('family chat messages are comments on the chat; outsiders cannot post or read', async () => {
    await createInvite('dad', 'levi', 'CODE18', 'child');
    await requestToJoin('daughter', 'levi', 'CODE18', 'child');
    await approve('dad', 'levi', 'daughter', 'child');
    const c = { targetType: 'chat', targetId: 'family', text: 'מי בבית?', authorUid: 'dad', authorName: 'אבא', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'comments', 'chat1'), { ...c, notify: ['mom'] }));
    await assertSucceeds(getDoc(doc(db('daughter'), 'families', 'levi', 'comments', 'chat1')));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'comments', 'chat1')));
    await assertFails(setDoc(doc(db('neighbor'), 'families', 'levi', 'comments', 'chat2'), { ...c, authorUid: 'neighbor' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'comments', 'chat3'), { ...c, targetType: 'secret' }));
  });
});

describe('weekly timetables', () => {
  const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  it('a member uploads their own timetable; parents can upload for a child; the family can see it', async () => {
    await createInvite('dad', 'levi', 'CODE19', 'child');
    await requestToJoin('daughter', 'levi', 'CODE19', 'child');
    await approve('dad', 'levi', 'daughter', 'child');
    const s = (by: string) => ({ image: img, updatedAt: serverTimestamp(), updatedBy: by });
    await assertSucceeds(setDoc(doc(db('daughter'), 'families', 'levi', 'schedules', 'daughter'), s('daughter')));
    await assertSucceeds(setDoc(doc(db('dad'), 'families', 'levi', 'schedules', 'daughter'), s('dad')));
    await assertSucceeds(getDoc(doc(db('dad'), 'families', 'levi', 'schedules', 'daughter')));
    await assertFails(setDoc(doc(db('daughter'), 'families', 'levi', 'schedules', 'dad'), s('daughter')));
    await assertFails(setDoc(doc(db('daughter'), 'families', 'levi', 'schedules', 'daughter'), s('dad')));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'schedules', 'stranger'), s('dad')));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'schedules', 'dad'), { ...s('dad'), image: 'data:text/html;base64,PGgxPg==' }));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'schedules', 'daughter')));
    await assertFails(deleteDoc(doc(db('daughter'), 'families', 'levi', 'schedules', 'dad')));
    await assertSucceeds(deleteDoc(doc(db('daughter'), 'families', 'levi', 'schedules', 'daughter')));
  });
});

describe('checklists', () => {
  it('members create lists and lines; outsiders cannot; lines need a real list', async () => {
    const L = { title: 'ציוד לטיול', emoji: '🏕️', createdBy: 'dad', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: 'dad' };
    const list = doc(db('dad'), 'families', 'levi', 'lists', 'trip');
    await assertSucceeds(setDoc(list, { ...L, categories: ['ביגוד', 'רחצה'] }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'lists', 'x'), { ...L, title: '' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'lists', 'x'), { ...L, evil: 1 }));
    await assertFails(setDoc(doc(db('neighbor'), 'families', 'levi', 'lists', 'x'), { ...L, updatedBy: 'neighbor' }));
    const E = { listId: 'trip', text: 'פנס', done: false, order: 1, category: 'ביגוד', updatedAt: serverTimestamp(), updatedBy: 'dad' };
    const entry = doc(db('dad'), 'families', 'levi', 'listEntries', 'e1');
    await assertSucceeds(setDoc(entry, E));
    await assertSucceeds(updateDoc(entry, { done: true, updatedAt: serverTimestamp(), updatedBy: 'dad' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'listEntries', 'e2'), { ...E, listId: 'nope' }));
    await assertFails(setDoc(doc(db('dad'), 'families', 'levi', 'listEntries', 'e2'), { ...E, text: '' }));
    await assertFails(getDoc(doc(db('neighbor'), 'families', 'levi', 'listEntries', 'e1')));
    await assertFails(deleteDoc(doc(db('neighbor'), 'families', 'levi', 'lists', 'trip')));
    await assertSucceeds(deleteDoc(entry));
    await assertSucceeds(deleteDoc(list));
  });
});

describe('birthdays', () => {
  it('members keep birthdays with a valid date; outsiders cannot', async () => {
    const B = { name: 'סבתא רחל', day: 12, month: 3, year: 1950, group: 'family', updatedAt: serverTimestamp(), updatedBy: 'dad' };
    const ref = (id: string, who: Who = 'dad') => doc(db(who), 'families', 'levi', 'birthdays', id);
    await assertSucceeds(setDoc(ref('b1'), B));
    await assertSucceeds(setDoc(ref('b2'), { ...B, year: null, group: 'friends' }));
    await assertFails(setDoc(ref('x'), { ...B, month: 13 }));
    await assertFails(setDoc(ref('x'), { ...B, day: 0 }));
    await assertFails(setDoc(ref('x'), { ...B, group: 'enemies' }));
    await assertFails(setDoc(ref('x'), { ...B, name: '' }));
    await assertFails(setDoc(ref('x', 'neighbor'), { ...B, updatedBy: 'neighbor' }));
    await assertFails(getDoc(ref('b1', 'neighbor')));
    await assertSucceeds(deleteDoc(ref('b2')));
  });
});

describe('notification devices', () => {
  it('only the owner registers or reads their phones', async () => {
    const d = { token: 'fcm-token', platform: 'ios', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('dad'), 'users', 'dad', 'devices', 'p1'), d));
    await assertSucceeds(getDoc(doc(db('dad'), 'users', 'dad', 'devices', 'p1')));
    await assertFails(getDoc(doc(db('daughter'), 'users', 'dad', 'devices', 'p1')));
    await assertFails(setDoc(doc(db('daughter'), 'users', 'dad', 'devices', 'p2'), d));
    await assertFails(setDoc(doc(db('dad'), 'users', 'dad', 'devices', 'p3'), { ...d, platform: 'toaster' }));
  });
});
