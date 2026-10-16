import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';
import { priceKey } from './priceUtils';

export * from './priceUtils';

const pricesCol = (fid: string) => collection(db, 'families', fid, 'prices');

export function addPrice(fid: string, name: string, price: number, store: string) {
  addDoc(pricesCol(fid), {
    key: priceKey(name),
    name: name.trim().slice(0, 80),
    price: Math.round(price * 100) / 100,
    store: store.trim().slice(0, 40),
    at: serverTimestamp(),
    by: auth.currentUser!.uid,
  }).catch(reportWriteError);
}

export function deletePrice(fid: string, id: string) {
  deleteDoc(doc(pricesCol(fid), id)).catch(reportWriteError);
}

