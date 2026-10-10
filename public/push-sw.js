// Imported into the generated service worker. Shows family notifications
// (data-only FCM messages) and opens the right comment when tapped.
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
      self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
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
