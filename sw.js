/* Home Shopping App — service worker.
   Keeps a copy of the app on the phone so it opens with no signal.

   - The app page: network first (so updates arrive straight away), falling back to the
     saved copy if there's no signal or the network takes more than 4 seconds.
   - Firebase code (versioned, never changes) and Google Fonts: saved copy first.
   - Everything else, including Firebase sign-in and database traffic, is left alone. */

const CACHE = 'home-shopping-v1';
const APP_PAGE = 'Home-Shopping-App.html';
const SHELL = [APP_PAGE, 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('home-shopping-') && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page is saved under one address, whatever ?query or #hash it was opened with
function pageKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}

function networkFirst(request, key) {
  return caches.open(CACHE).then(cache => {
    const network = fetch(request).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => null), timeout])
      .then(res => res || cache.match(key).then(hit => hit || network));
  });
}

function cacheFirst(request) {
  return caches.open(CACHE).then(cache =>
    cache.match(request).then(hit => hit || fetch(request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    }))
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate' || url.pathname.endsWith('/' + APP_PAGE)) {
      event.respondWith(networkFirst(request, pageKey(request.url)));
    } else if (!url.pathname.endsWith('/sw.js')) {
      event.respondWith(cacheFirst(request));
    }
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
  // Anything else (Firebase sign-in, Firestore) goes straight to the network as normal
});
