import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

/** A product's own photo, kept apart from its notes: one document per item, named by the item's id. */
export interface ItemPhoto {
  id: string;
  image: string;
}

const photoDoc = (fid: string, itemId: string) => doc(db, 'families', fid, 'itemPhotos', itemId);

/** Adds the photo, or replaces the one already there. */
export function setItemPhoto(fid: string, itemId: string, image: string) {
  setDoc(photoDoc(fid, itemId), { image, by: auth.currentUser!.uid, at: serverTimestamp() }).catch(reportWriteError);
}

export function removeItemPhoto(fid: string, itemId: string) {
  deleteDoc(photoDoc(fid, itemId)).catch(reportWriteError);
}
