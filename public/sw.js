// Service Worker: App offline startfähig. Supabase-Anfragen gehen immer ins Netz.
const CACHE = 'sparesync-v4';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Supabase & CDN nicht anfassen
  if (req.mode === 'navigate') {
    // Seite: erst Netz (neueste Version), offline aus dem Cache
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put('./index.html', res.clone())); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Assets (gehashte Dateinamen): Cache zuerst
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
