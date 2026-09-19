/* ==========================================================================
   AVP HRIS — service worker
   --------------------------------------------------------------------------
   Deliberately conservative. An HR system must never show yesterday's code or
   yesterday's numbers, so:

     · API traffic is never touched (cross-origin, and POST besides)
     · app code is network-first — the cache is only a fallback when offline
     · static assets and fonts are cache-first, since they are versioned by name

   Bump CACHE on every release to evict the previous shell.
   ========================================================================== */
var CACHE = 'avp-hris-v2.0.0';

var PRECACHE = [
  './', './index.html', './config.js',
  './styles/tokens.css', './styles/app.css', './styles/motion.css',
  './js/runtime.js', './js/icons.js', './js/app.js', './js/enhance.js',
  './assets/logo-full.webp', './assets/logo-mark.webp',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* a missing file must not block activation */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never the RPC POSTs

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  // Google Fonts: cache-first, they are immutable per URL.
  if (!sameOrigin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith(
        caches.match(req).then(function (hit) {
          return hit || fetch(req).then(function (res) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
            return res;
          });
        })
      );
    }
    return;                                               // everything else untouched
  }

  // Our own code and markup: network-first so a deploy lands immediately.
  e.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
