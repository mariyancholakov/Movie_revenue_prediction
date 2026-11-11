'use client';
import { useEffect, useSyncExternalStore } from 'react';

// Registers the service worker (public/sw.js) once the page has loaded, in
// production only: in `next dev` a worker would keep serving stale scripts.
// While there is no connection, a thin bar says the page is the last edition.
const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};
const isOffline = () => !navigator.onLine;
const serverOffline = () => false;

export function ServiceWorker() {
  const offline = useSyncExternalStore(subscribe, isOffline, serverOffline);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-40 bg-ink text-paper text-center font-sans text-label font-medium tracking-[0.04em] px-4 py-1.5">
      Offline — showing the last edition you opened
    </div>
  );
}
