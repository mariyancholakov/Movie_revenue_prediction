'use client';
import { API_URL } from './api';

// Push notifications for saved films. Saving a film hands the browser's push
// subscription to the API, which tells the browser when that film opens, gets
// its forecast, moves meaningfully, or settles (flask-api/push_alerts.py).

export type PushResult =
  | 'on'            // subscribed: alerts will arrive
  | 'unsupported'   // this browser can't (an iPhone page not yet added to the home screen, mostly)
  | 'denied'        // the visitor said no, or has notifications blocked
  | 'failed';       // the API or the push service didn't answer

const urlBase64ToBytes = (b64: string) => {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** An iPhone/iPad page in Safari: web push only works once it's on the home screen. */
export const needsHomeScreen = () =>
  typeof navigator !== 'undefined' &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator as Navigator & { standalone?: boolean }).standalone &&
  !window.matchMedia('(display-mode: standalone)').matches;

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
}

/** Ask for permission (once) and subscribe this browser to a film's alerts. */
export async function subscribeToFilm(tmdbId: number, title: string): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await (await fetch(`${API_URL}/api/push/key`)).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) });
    }
    await post('/api/push/subscribe', { subscription: sub.toJSON(), tmdb_id: tmdbId, title });
    return 'on';
  } catch {
    return 'failed';
  }
}

/** Stop alerts for one film. The browser's subscription stays for its other films. */
export async function unsubscribeFromFilm(tmdbId: number, title: string): Promise<void> {
  if (!pushSupported()) return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await post('/api/push/unsubscribe', { subscription: sub.toJSON(), tmdb_id: tmdbId, title });
  } catch {}
}
