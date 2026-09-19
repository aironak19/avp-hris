/* ==========================================================================
   AVP HRIS — service worker
   --------------------------------------------------------------------------
   Deliberately conservative. An HR system must never show yesterday's code or
   yesterday's numbers, so:

     · API traffic is never touched (cross-origin, and POST besides)
     · app code and markup are network-first — the cache is only a fallback
       when the network is unavailable
     · fingerprint-stable assets (logos, fonts) are stale-while-revalidate

   ------------------------------------------------------------------ v2.0.1
   Fixed: the offline fallback used to answer *any* failed same-origin GET
   with index.html. A script request that fell through would therefore receive
   an HTML document with a 200 status — the browser would fire `load`, try to
   execute HTML as JavaScript, and the screen module would silently never
   register. The view then fell back to a view that was not loaded either and
   the page showed "Something went wrong". index.html is now only ever served
   for navigation requests.

   Bump CACHE on every release to evict the previous shell.
   ========================================================================== */
/* Keep BUILD in step with HRIS_BUILD in config.js and the ?v= in index.html:
   those three together are what makes a release actually reach a browser. */
var BUILD = '2.0.2';
var CACHE = 'avp-hris-v' + BUILD;

/* The versioned URLs are the ones index.html actually requests, so those are
   the ones worth having available offline. */
var PRECACHE = [
  './', './index.html',
  './config.js?v=' + BUILD,
  './styles/tokens.css?v=' + BUILD,
  './styles/app.css?v=' + BUILD,
  './styles/motion.css?v=' + BUILD,
  './js/runtime.js?v=' + BUILD,
  './js/icons.js?v=' + BUILD,
  './js/app.js?v=' + BUILD,
  './js/enhance.js?v=' + BUILD,
  './assets/logo-full.webp', './assets/logo-mark.webp',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })   // a missing file must not block activation
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

/* Let the page tell a waiting worker to take over immediately. */
self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

function putInCache(req, res) {
  // Only full, basic responses are worth keeping; a 206 or an error page is not.
  if (!res || res.status !== 200 || (res.type && res.type !== 'basic' && res.type !== 'cors')) return;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never the RPC POSTs

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  /* ---- cross-origin ---------------------------------------------------- */
  if (!sameOrigin) {
    // Google Fonts only; everything else (including the API) is left alone.
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith(
        caches.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) { putInCache(req, res); return res; });
          return hit || net;
        }).catch(function () { return fetch(req); })
      );
    }
    return;
  }

  /* ---- brand assets: stale-while-revalidate ---------------------------- */
  if (/\/assets\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { putInCache(req, res); return res; })
          .catch(function () { return hit; });
        return hit || net;
      })
    );
    return;
  }

  /* ---- everything else of ours: network-first -------------------------- */
  e.respondWith(
    fetch(req)
      .then(function (res) { putInCache(req, res); return res; })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          /* The app shell stands in for a page the user asked to open, and
             for nothing else. Answering a script or stylesheet request with
             HTML is worse than failing: it fails silently. */
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
