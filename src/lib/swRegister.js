// Registration is best-effort: the app still works online if it fails.
// onUpdateReady(registration) is called when a new version is waiting to activate.
export function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        onUpdateReady?.(registration);
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateReady?.(registration);
          }
        });
      });
    })
    .catch(() => {});
}

let reloadListenerAdded = false;

// Activates the waiting worker. The page reloads once when the new worker takes control.
export function applyUpdate(registration) {
  const waiting = registration && registration.waiting;
  if (!waiting) return;
  if (!reloadListenerAdded) {
    reloadListenerAdded = true;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
