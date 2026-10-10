// Imported into the generated service worker. Shows family notifications
// (data-only FCM messages) and opens the right comment when tapped.
// Unread counter for the number on the app icon. iPhone ignores a badge
// without a number, so the count is kept in Cache storage between pushes
// and reset by the app (push.ts clearBadge) when it is opened.
const BADGE_CACHE = 'family-badge';
const BADGE_KEY = '/__badge-count';

async function bumpBadge() {
  if (!self.navigator.setAppBadge) return;
  try {
    const cache = await caches.open(BADGE_CACHE);
    const prev = await cache.match(BADGE_KEY);
    const count = (prev ? Number(await prev.text()) || 0 : 0) + 1;
    await cache.put(BADGE_KEY, new Response(String(count)));
    await self.navigator.setAppBadge(count);
  } catch (e) {
    // badge is a nice-to-have
  }
}

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch (e) {
    msg = {};
  }
  const data = msg.data || msg;
  const title = data.title || 'הבית שלנו';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || '/' },
        dir: 'rtl',
        lang: 'he',
      }),
      bumpBadge(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-url', url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
