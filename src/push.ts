// Phone notifications (Web Push through Firebase Cloud Messaging).
// On iPhone this works only when the app was added to the home screen (iOS 16.4+).
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db, usingEmulators } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const DEVICE_KEY = 'pushDeviceId';

export type PushState = 'unconfigured' | 'needs-install' | 'unsupported' | 'blocked' | 'off' | 'on';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!VAPID_KEY || usingEmulators) return 'unconfigured';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && localStorage.getItem(DEVICE_KEY) ? 'on' : 'off';
}

async function deviceId(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Must be called from a tap (iOS only shows the permission prompt then). */
export async function enablePush(uid: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: await navigator.serviceWorker.ready,
  });
  const id = await deviceId(token);
  await setDoc(doc(db, 'users', uid, 'devices', id), {
    token,
    platform: isIOS() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'web',
    createdAt: serverTimestamp(),
  });
  localStorage.setItem(DEVICE_KEY, id);
  return 'on';
}

export async function disablePush(uid: string): Promise<PushState> {
  const id = localStorage.getItem(DEVICE_KEY);
  if (id) await deleteDoc(doc(db, 'users', uid, 'devices', id)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
  localStorage.removeItem(DEVICE_KEY);
  return 'off';
}

/** Clears the red number on the app icon. */
export function clearBadge() {
  (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
  // reset the unread counter kept by push-sw.js
  if ('caches' in window) caches.delete('family-badge').catch(() => {});
}
