import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

export type TargetType = 'item' | 'task' | 'event' | 'chat';

/** The family chat is stored as comments on this single target. */
export const CHAT_ID = 'family';

export interface Comment {
  id: string;
  targetType: TargetType;
  targetId: string;
  text: string;
  image?: string;
  notify?: string[];
  authorUid: string;
  authorName: string;
  createdAt?: Timestamp | null;
  editedAt?: Timestamp | null;
  pending: boolean;
}

export const commentKey = (type: TargetType, id: string) => `${type}:${id}`;

export function addComment(
  fid: string,
  targetType: TargetType,
  targetId: string,
  text: string,
  image?: string,
  notify: string[] = [],
) {
  const u = auth.currentUser!;
  const ref = doc(collection(db, 'families', fid, 'comments'));
  setDoc(ref, {
    targetType,
    targetId,
    text: text.trim().slice(0, 1000),
    ...(image ? { image } : {}),
    ...(notify.length ? { notify: notify.slice(0, 20) } : {}),
    authorUid: u.uid,
    authorName: (u.displayName || u.email || '').split(' ')[0].slice(0, 80),
    createdAt: serverTimestamp(),
  }).catch(reportWriteError);
  return ref.id;
}

/** Authors can fix what they wrote; the bubble then shows "נערך". */
export function editComment(fid: string, id: string, text: string) {
  updateDoc(doc(db, 'families', fid, 'comments', id), {
    text: text.trim().slice(0, 1000),
    editedAt: serverTimestamp(),
  }).catch(reportWriteError);
}

export function deleteComment(fid: string, id: string) {
  deleteDoc(doc(db, 'families', fid, 'comments', id)).catch(reportWriteError);
}

/**
 * Shrinks a photo to a JPEG data URL small enough to store inside a comment
 * (well under Firestore's 1 MB document limit), so photos need no paid storage.
 */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const [max, quality] of [[1280, 0.72], [1024, 0.65], [800, 0.6], [640, 0.55]] as const) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 650_000) return data;
    }
    throw new Error('photo too large');
  } finally {
    URL.revokeObjectURL(url);
  }
}
