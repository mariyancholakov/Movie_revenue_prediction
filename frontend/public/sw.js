// MOVIEGROSS service worker. It makes reopening the site from a phone's home
// screen instant and lets the last edition you opened be read offline.
//   pages        network first (3s), else the copy kept from last time
//   /_next/static  never changes for a given URL: kept, served from the cache
//   posters      shown from the cache at once, refreshed behind it
//   API lists    network first (4s), else the copy kept from last time
// Bump VERSION to drop every kept copy.
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const DATA = `data-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const IMAGE_LIMIT = 120;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [PAGES, STATIC, DATA, IMAGES];
    for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES, 3000, offlinePage));
  } else if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/_next/static/')) event.respondWith(cacheFirst(request, STATIC));
    else if (url.pathname.startsWith('/_next/image')) event.respondWith(staleWhileRevalidate(request, IMAGES, IMAGE_LIMIT));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA, 4000));
  }
});

function timeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(reject, ms))]);
}

async function networkFirst(request, cacheName, ms, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await timeout(fetch(request), ms);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const kept = await cache.match(request, { ignoreVary: true });
    if (kept) return kept;
    if (fallback) return fallback(cache);
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const kept = await cache.match(request);
  const fresh = fetch(request).then(async response => {
    if (response.ok) {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(old);
    }
    return response;
  });
  if (kept) { fresh.catch(() => {}); return kept; }
  return fresh;
}

// A page never opened before, with no signal: the front page if it was kept,
// otherwise a plain notice.
async function offlinePage(cache) {
  const front = await cache.match('/');
  if (front) return front;
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>MOVIEGROSS</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#EDE7DA;color:#1C1814;font:16px Georgia,serif;text-align:center;padding:24px">' +
    '<div><h1 style="font-size:2.4rem;margin:0 0 .5rem">MOVIEGROSS</h1><p style="margin:0;color:#554D40">No signal. Open the site once with a connection and the last edition will be here next time.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
