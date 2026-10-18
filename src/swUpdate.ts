/**
 * The app checks for a new version whenever it comes back from the background,
 * not only on a cold start: an iPhone can keep a home-screen app alive for days.
 * The new service worker takes over at once (autoUpdate), and the page reloads
 * right away if the person hasn't started typing, or else the next time the app
 * goes to the background, so nothing typed is lost. Data is unaffected either way.
 */
const RESUME_WINDOW_MS = 10_000;
const MIN_CHECK_GAP_MS = 60_000;

export function reloadOnNewVersion() {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // A first install also takes control of the page; only a replacement is a new version.
  const hadController = !!sw.controller;
  let resumedAt = Date.now();
  let lastCheck = 0;
  let ready = false;

  const typing = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
  };

  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    ready = true;
    if (document.visibilityState === 'visible' && Date.now() - resumedAt < RESUME_WINDOW_MS && !typing()) location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (ready) location.reload();
      return;
    }
    resumedAt = Date.now();
    if (!navigator.onLine || resumedAt - lastCheck < MIN_CHECK_GAP_MS) return;
    lastCheck = resumedAt;
    sw.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {});
  });
}
