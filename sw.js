// Service worker: caches the whole app on install so it runs fully offline.
// Serves from cache first; when online, refreshes the cache in the background, so an update
// shows up on the next launch. Bump VERSION when files are added or removed from APP_FILES.

const VERSION = 'v1';
const CACHE = `qb-${VERSION}`;
const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/parser.js',
  'src/pdftext.js',
  'src/reader.js',
  'src/scoring.js',
  'src/speech-text.js',
  'src/storage.js',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('qb-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) { e.waitUntil(refresh); return cached; }
    return (await refresh) ?? (req.mode === 'navigate' ? cache.match('./') : Response.error());
  })());
});
