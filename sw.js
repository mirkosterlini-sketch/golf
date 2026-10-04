// Tiene salvate le immagini del campo (funziona anche senza segnale) e gestisce la notifica per l'orologio.
const TILES = 'caddie-tiles-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || !url.includes('arcgisonline.com')) return;
  e.respondWith(caches.open(TILES).then(async c => {
    const hit = await c.match(url);
    if (hit) return hit;
    try { const r = await fetch(url, {mode: 'no-cors'}); c.put(url, r.clone()); return r; }
    catch (err) { return Response.error(); }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window'}).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
