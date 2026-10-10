import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

export interface Task {
  id: string;
  title: string;
  assignee: string | null;
  due: string | null; // YYYY-MM-DD
  done: boolean;
  deleted: boolean;
  createdBy: string;
  pending: boolean;
}

const tasksCol = (fid: string) => collection(db, 'families', fid, 'tasks');

export function addTask(fid: string, title: string, assignee: string | null, due: string | null) {
  const uid = auth.currentUser!.uid;
  setDoc(doc(tasksCol(fid)), {
    title: title.trim().slice(0, 120),
    assignee,
    due,
    done: false,
    deleted: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }).catch(reportWriteError);
}

export function updateTask(fid: string, id: string, fields: Partial<Pick<Task, 'title' | 'assignee' | 'due' | 'done' | 'deleted'>>) {
  updateDoc(doc(tasksCol(fid), id), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser!.uid,
  }).catch(reportWriteError);
}
