import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Item } from './items';
import type { Task } from './tasks';
import type { FamilyEvent } from './events';
import type { Comment } from './comments';
import type { FamilyList, ListEntry, NoteFile } from './lists';
import type { Birthday } from './birthdays';
import type { Schedule } from './schedules';
import type { Invite, JoinRequest, Member } from './family';

/**
 * A listener that loses permission (e.g. the user was removed from the
 * family) tells the app to re-check the membership.
 */
function reportDenied(e: { code?: string }) {
  if (e.code === 'permission-denied') window.dispatchEvent(new Event('access-denied'));
}

export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

/** Live document; `undefined` while loading, `null` when missing or unreadable. */
export function useDoc<T>(path: string[] | null) {
  const key = path?.join('/') ?? '';
  const [value, setValue] = useState<(T & { id: string }) | null | undefined>(undefined);
  useEffect(() => {
    if (!path) {
      setValue(null);
      return;
    }
    setValue(undefined);
    // Segments starting with '#' only force a fresh subscription.
    const [first, ...rest] = path.filter((seg) => !seg.startsWith('#'));
    return onSnapshot(
      doc(db, first, ...rest),
      (snap) => setValue(snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null),
      (e) => {
        setValue(null);
        reportDenied(e);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

function useQuery<T>(
  key: string,
  build: () => Query<DocumentData> | null,
  map: (id: string, d: DocumentData, pending: boolean) => T,
  /** Keep showing the old rows while a wider query loads ("show older messages"). */
  keepWhileLoading = false,
) {
  const [rows, setRows] = useState<T[] | undefined>(undefined);
  useEffect(() => {
    const q = build();
    if (!q) {
      setRows([]);
      return;
    }
    if (!keepWhileLoading) setRows(undefined);
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => setRows(snap.docs.map((d) => map(d.id, d.data({ serverTimestamps: 'estimate' }), d.metadata.hasPendingWrites))),
      (e) => {
        setRows([]);
        reportDenied(e);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

export function useItems(fid: string) {
  return useQuery<Item>(
    `items/${fid}`,
    () => collection(db, 'families', fid, 'items'),
    (id, d, pending) => ({ id, ...(d as Omit<Item, 'id' | 'pending'>), pending }),
  );
}

export function useMembers(fid: string) {
  return useQuery<Member>(`members/${fid}`, () => collection(db, 'families', fid, 'members'), (id, d) => ({ id, ...(d as Omit<Member, 'id'>) }));
}

export function usePendingRequests(fid: string, enabled: boolean) {
  return useQuery<JoinRequest>(
    `requests/${fid}/${enabled}`,
    () => (enabled ? query(collection(db, 'families', fid, 'joinRequests'), where('status', '==', 'pending')) : null),
    (id, d) => ({ id, ...(d as Omit<JoinRequest, 'id'>) }),
  );
}

export function useInvites(fid: string, enabled: boolean) {
  return useQuery<Invite>(
    `invites/${fid}/${enabled}`,
    () => (enabled ? query(collection(db, 'invites'), where('familyId', '==', fid)) : null),
    (id, d) => ({ id, ...(d as Omit<Invite, 'id'>) }),
  );
}

export function useOverrides(fid: string) {
  const rows = useQuery<[string, string]>(
    `overrides/${fid}`,
    () => collection(db, 'families', fid, 'categoryOverrides'),
    (id, d) => [id, d.category as string],
  );
  return new Map(rows ?? []);
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useTasks(fid: string) {
  return useQuery<Task>(
    `tasks/${fid}`,
    () => collection(db, 'families', fid, 'tasks'),
    (id, d, pending) => ({ id, ...(d as Omit<Task, 'id' | 'pending'>), pending }),
  );
}

export function useEvents(fid: string) {
  return useQuery<FamilyEvent>(
    `events/${fid}`,
    () => collection(db, 'families', fid, 'events'),
    (id, d, pending) => ({ id, ...(d as Omit<FamilyEvent, 'id' | 'pending'>), pending }),
  );
}

/**
 * The family's newest comments and chat messages. Only the latest `max` are
 * read, so opening the app costs the same however long the chat history gets.
 */
export function useComments(fid: string, max: number) {
  return useQuery<Comment>(
    `comments/${fid}/${max}`,
    () => query(collection(db, 'families', fid, 'comments'), orderBy('createdAt', 'desc'), limit(max)),
    (id, d, pending) => ({ id, ...(d as Omit<Comment, 'id' | 'pending'>), pending }),
    true,
  );
}

/**
 * Every comment written on a product, task or event (not the chat itself):
 * they feed the count bubbles and each item's thread, so none may be missing.
 */
export function useTargetComments(fid: string) {
  return useQuery<Comment>(
    `targetComments/${fid}`,
    () => query(collection(db, 'families', fid, 'comments'), where('targetType', 'in', ['item', 'task', 'event'])),
    (id, d, pending) => ({ id, ...(d as Omit<Comment, 'id' | 'pending'>), pending }),
  );
}

/** Checklists and their lines (a family has few enough to keep in memory). */
export function useLists(fid: string) {
  return useQuery<FamilyList>(
    `lists/${fid}`,
    () => collection(db, 'families', fid, 'lists'),
    (id, d, pending) => ({ id, ...(d as Omit<FamilyList, 'id' | 'pending'>), pending }),
  );
}

export function useListEntries(fid: string) {
  return useQuery<ListEntry>(
    `listEntries/${fid}`,
    () => collection(db, 'families', fid, 'listEntries'),
    (id, d, pending) => ({ id, ...(d as Omit<ListEntry, 'id' | 'pending'>), pending }),
  );
}

/** Files attached to one note (each can be large, so only the open note's). */
export function useNoteFiles(fid: string, noteId: string) {
  return useQuery<NoteFile>(
    `noteFiles/${fid}/${noteId}`,
    () => query(collection(db, 'families', fid, 'noteFiles'), where('noteId', '==', noteId)),
    (id, d, pending) => ({ id, ...(d as Omit<NoteFile, 'id' | 'pending'>), pending }),
  );
}

/** Birthdays the family keeps (relatives, friends). */
export function useBirthdays(fid: string) {
  return useQuery<Birthday>(
    `birthdays/${fid}`,
    () => collection(db, 'families', fid, 'birthdays'),
    (id, d, pending) => ({ id, ...(d as Omit<Birthday, 'id' | 'pending'>), pending }),
  );
}

/** Members' timetables (one image per member). */
export function useSchedules(fid: string) {
  return useQuery<Schedule>(
    `schedules/${fid}`,
    () => collection(db, 'families', fid, 'schedules'),
    (id, d, pending) => ({ id, ...(d as Omit<Schedule, 'id' | 'pending'>), pending }),
  );
}
