import { addDoc, collection, deleteDoc, doc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

export type TargetType = 'item' | 'task' | 'event';

export interface Comment {
  id: string;
  targetType: TargetType;
  targetId: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt?: Timestamp | null;
  pending: boolean;
}

export const commentKey = (type: TargetType, id: string) => `${type}:${id}`;

export function addComment(fid: string, targetType: TargetType, targetId: string, text: string) {
  const u = auth.currentUser!;
  addDoc(collection(db, 'families', fid, 'comments'), {
    targetType,
    targetId,
    text: text.trim().slice(0, 1000),
    authorUid: u.uid,
    authorName: (u.displayName || u.email || '').split(' ')[0].slice(0, 80),
    createdAt: serverTimestamp(),
  }).catch(reportWriteError);
}

export function deleteComment(fid: string, id: string) {
  deleteDoc(doc(db, 'families', fid, 'comments', id)).catch(reportWriteError);
}
