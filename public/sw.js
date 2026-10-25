// =====================================================================
//  SpareSync – Service Worker (Offline-Modus)
//  • App-Shell (HTML, CSS, JS, Icons) wird bei der Installation komplett
//    vorab gespeichert → die App startet auch ohne Netz (z. B. im Keller).
//  • Produktbilder aus Supabase werden beim Ansehen zwischengespeichert.
//  • Datenbank-Abfragen gehen NIE über diesen Cache (die App speichert
//    ihre Daten selbst, siehe db.js „OFFLINE-MODUS“).
//  Die Liste unten füllt der Build automatisch (vite.config.js).
// =====================================================================
const BUILD = '__BUILD__';
self.__PRECACHE = [];
const SHELL = `sparesync-shell-${BUILD}`;
const IMAGES = 'sparesync-images-v1';
const NAV_TIMEOUT = 3500;   // bei schlechtem Empfang nach 3,5 s die gespeicherte App zeigen

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(['./', ...self.__PRECACHE].map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Produktbilder aus Supabase Storage: Cache zuerst (offline sichtbar)
  if (/\.supabase\.co$/.test(url.hostname) && url.pathname.includes('/storage/v1/object/public/')) {
    e.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch { return hit || Response.error(); }
    })());
    return;
  }

  if (url.origin !== location.origin) return;                         // Supabase-API, CDNs: nicht anfassen
  if (req.headers.has('range') || /\.(mp4|mov|webm)$/i.test(url.pathname)) return;   // Videos (Splash)

  // Seitenaufruf: erst Netz (neueste Version), bei Offline/langsam die gespeicherte App
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await Promise.race([fetch(req), timeout(NAV_TIMEOUT)]);
        if (res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // App-Dateien (Namen mit Hash): Cache zuerst, sonst Netz und merken
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
    return res;
  })());
});
