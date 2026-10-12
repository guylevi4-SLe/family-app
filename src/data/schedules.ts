import { deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { reportWriteError } from './items';

/** A family member's weekly timetable, kept as one image (a PDF is rendered on the phone). */
export interface Schedule {
  id: string; // the member's uid
  image: string;
  updatedAt?: Timestamp | null;
  updatedBy: string;
  /** Lessons for Sunday…Friday, one per line, so a single day can be sent on its own. */
  days?: string[];
  /** Lessons per day as Claude read them from the image, waiting for a parent to check. */
  suggested?: string[];
  readStatus?: 'reading' | 'done' | 'failed';
  pending: boolean;
}

export const SCHOOL_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

/** The next school day after `now`: tomorrow, or Sunday when tomorrow is Saturday. */
export function nextSchoolDay(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** "📚 המערכת של רומי למחר, יום שלישי 13.10:" and the numbered lessons, ready to share. */
export function dayMessage(name: string, days: string[] | undefined, now: Date) {
  const d = nextSchoolDay(now);
  const tomorrow = d.getDay() === (now.getDay() + 1) % 7;
  const when = `${tomorrow ? 'למחר, יום' : 'ליום'} ${SCHOOL_DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  const lines = (days?.[d.getDay()] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { day: d, text: `📚 אין שיעורים במערכת של ${name} ${when}` };
  const numbered = lines.map((l, i) => (/^\d/.test(l) ? l : `${i + 1}. ${l}`));
  return { day: d, text: `📚 המערכת של ${name} ${when}:\n${numbered.join('\n')}` };
}

export function saveScheduleDays(fid: string, uid: string, days: string[]) {
  return updateDoc(doc(db, 'families', fid, 'schedules', uid), {
    days: days.map((d) => d.trim().slice(0, 1000)),
    suggested: deleteField(),
    readStatus: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser!.uid,
  }).catch(reportWriteError);
}

/** Whose timetable to show first: mine if I uploaded one, else the first member who has one. */
export function defaultScheduleUid(schedules: Schedule[] | undefined, memberIds: string[], me: string) {
  const live = (schedules ?? []).filter((s) => memberIds.includes(s.id));
  return (live.find((s) => s.id === me) ?? live[0])?.id ?? me;
}

const MAX_CHARS = 900_000; // stays well inside Firestore's 1 MB document limit
const MAX_PAGES = 3;

export function saveSchedule(fid: string, uid: string, image: string) {
  return setDoc(doc(db, 'families', fid, 'schedules', uid), {
    image,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser!.uid,
  }).catch(reportWriteError);
}

export function deleteSchedule(fid: string, uid: string) {
  return deleteDoc(doc(db, 'families', fid, 'schedules', uid)).catch(reportWriteError);
}

/** Turns a PDF (first pages stacked) or a photo into a sharp JPEG data URL. */
export async function scheduleImage(file: File): Promise<string> {
  const pages = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? await renderPdf(file) : [await loadImage(file)];
  const width = Math.max(...pages.map((p) => p.width));
  const height = pages.reduce((h, p) => h + p.height * (width / p.width), 0);
  for (const [maxW, quality] of [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.65], [800, 0.6]] as const) {
    const scale = Math.min(1, maxW / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const p of pages) {
      const h = p.height * (canvas.width / p.width);
      ctx.drawImage(p, 0, y, canvas.width, h);
      y += h;
    }
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= MAX_CHARS) return data;
  }
  throw new Error('schedule too large');
}

async function renderPdf(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.js?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: HTMLCanvasElement[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1600 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    out.push(canvas);
  }
  return out;
}

async function loadImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
