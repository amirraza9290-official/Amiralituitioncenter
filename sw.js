/* Amir Ali Tuition Center – service worker (offline support)
   Strategy: the app files are cached on first visit and then served from the
   cache instantly (works with no internet). When online, the cache is refreshed
   quietly in the background so updates arrive on the next launch.
   NOTE: this file never touches your data – students, fees, attendance etc.
   live in the browser's localStorage, which a service worker cannot change.
   To release an updated app, change CACHE_VERSION below. */
const CACHE_VERSION = 'v1';
const CACHE = 'aatc-pwa-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './splash-logo.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('aatc-pwa-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page loads of the app itself (/, /index.html, with ?source=pwa or #hash) -> app shell.
  // Any other URL (e.g. manifest.json opened directly) is handled by the generic rule below,
  // so it can never overwrite the cached app page.
  var isShell = url.pathname.slice(-1) === '/' || url.pathname.slice(-11) === '/index.html';
  if (req.mode === 'navigate' && isShell) {
    event.respondWith(
      caches.match('./index.html').then(function (cached) {
        var refresh = fetch(req).then(function (res) {
          var type = res && res.headers ? (res.headers.get('content-type') || '') : '';
          if (res && res.ok && type.indexOf('text/html') > -1) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          }
          return res;
        }).catch(function () { return null; });
        event.waitUntil(refresh);
        return cached || refresh.then(function (res) { return res || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Other files (icons, manifest): cache first, refresh in background
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      var refresh = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      if (cached) { event.waitUntil(refresh); return cached; }
      return refresh;
    })
  );
});
