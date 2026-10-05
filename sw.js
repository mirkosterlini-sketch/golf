// Service worker: tiene l'app e le foto dei campi sul telefono, così funziona anche senza segnale.
// App: prima la rete (per avere sempre l'ultima versione), se manca la rete la copia salvata.
// Foto dei campi: prima la copia salvata (scaricata con "Scarica la mappa del campo" o vista in precedenza).
const TILES = 'caddie-tiles-v2';
const APP = 'caddie-app-v1';
const TILE_HOSTS = /arcgisonline\.com|geoservizi\.regione\.liguria\.it|cartografia\.servizirl\.it|golfetennisrapallo\.it\/download\//;
const APP_HOSTS = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== TILES && k !== APP).map(k => caches.delete(k)))).then(() => clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = req.url;
  if (TILE_HOSTS.test(url)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(url);
      if (hit) return hit;
      try { const r = await fetch(url, {mode: 'no-cors'}); c.put(url, r.clone()); return r; }
      catch (err) { return Response.error(); }
    }));
    return;
  }
  const own = url.startsWith(self.location.origin);
  if (!own && !APP_HOSTS.test(url)) return;            // meteo, OpenStreetMap ecc.: sempre dalla rete
  const key = own ? url.split('?')[0] : url;            // l'app si salva senza il "?v=..."
  e.respondWith(fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(APP).then(c => c.put(key, copy)); }
    return r;
  }).catch(async () => (await caches.match(key)) || (own ? caches.match(self.registration.scope) : undefined) || Response.error()));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window'}).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
