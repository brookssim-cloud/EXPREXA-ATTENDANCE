// Exprexa Attendance — offline shell.
//
// Network first, always. A new index.html is uploaded whenever the app
// changes, and a worker that served the cached copy first would quietly keep
// the team on yesterday's build. The cache is a fallback for no signal,
// nothing more — which matters here, because a yard with bad reception is
// exactly where someone still has to clock in.
//
// Firestore is never touched: it has its own offline handling, and caching
// its responses here would show people yesterday's roster as today's.

const CACHE = 'att-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
// Webfonts never change and are slow on a weak signal, so these are the one
// thing served from cache first.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // One missing file must not fail the whole install, or the app stops
      // working offline for a reason nobody can see.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  let url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(FONT_HOSTS.includes(url.hostname)){ e.respondWith(cacheFirst(req)); return; }
  // Anything else off our own origin — Firestore and the Firebase SDK above
  // all — goes straight through, untouched and uncached.
  if(url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req){
  const cache = await caches.open(CACHE);
  try{
    // no-store so the CDN's own copy cannot stand in for a fresh upload.
    const fresh = await fetch(req, { cache: 'no-store' });
    if(fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  }catch(err){
    const hit = await cache.match(req);
    if(hit) return hit;
    // A worker link opened with no signal still gets the app shell, so the
    // screen comes up and says what is wrong instead of failing blank.
    if(req.mode === 'navigate'){
      const shell = await cache.match('./index.html') || await cache.match('./');
      if(shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if(hit) return hit;
  const fresh = await fetch(req);
  if(fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(req, fresh.clone());
  return fresh;
}

// The page asks for this when someone taps the footer, so a phone can be
// pushed onto a new build without clearing anything by hand.
self.addEventListener('message', e => {
  if(e.data === 'skip-waiting') self.skipWaiting();
});
