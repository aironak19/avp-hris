/* ==========================================================================
   AVP HRIS — service worker (v3.1.0)
   --------------------------------------------------------------------------
   What makes the installed app open instantly and survive a flaky network,
   without ever showing yesterday's numbers:

     · API traffic is never touched (cross-origin POSTs to Apps Script) —
       every figure on screen always comes from the server.
     · The page itself is network-first with a short timeout; after that the
       cached shell opens and the fresh copy still lands in the cache.
     · Versioned files (?v=3.1.0) never change once published, so they are
       served straight from the cache (fetched once, kept until the next release).
     · Icons and logos: stale-while-revalidate.

   Every release bumps BUILD, which evicts the previous cache on activation;
   the page then shows "A new version is ready — Reload".
   ========================================================================== */
var BUILD = '3.1.0';
var CACHE = 'avp-hris-' + BUILD;
var NAV_TIMEOUT_MS = 3500;

var SHELL = [
  './', './index.html', './manifest.webmanifest',
  './config.js?v=' + BUILD, './styles/app.css?v=' + BUILD,
  './js/icons.js?v=' + BUILD, './js/runtime.js?v=' + BUILD, './js/app.js?v=' + BUILD, './js/enhance.js?v=' + BUILD,
  './js/views/home.js?v=' + BUILD, './js/views/attendance.js?v=' + BUILD, './js/views/leave.js?v=' + BUILD,
  './assets/logo-full.webp', './assets/logo-mark.webp',
  './assets/icons/icon-192.png', './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // One missing file must not keep the release from installing.
      return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return /^avp-hris-/.test(k) && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) { if (e.data === 'skip-waiting') self.skipWaiting(); });

function keep(req, res) {
  if (!res || res.status !== 200 || (res.type !== 'basic' && res.type !== 'cors')) return res;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                        // the RPC POSTs
  var url = new URL(req.url);

  /* ---- other origins: Google Fonts only ------------------------------- */
  if (url.origin !== self.location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith(caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { return keep(req, res); }).catch(function () { return hit; });
        return hit || net;
      }));
    }
    return;                                                  // Apps Script, Google sign-in, Drive: untouched
  }

  /* ---- opening the app: network-first, cached shell after a timeout ---- */
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(function (resolve) {
      var settled = false;
      function done(r) { if (!settled && r) { settled = true; resolve(r); } }
      var net = fetch(req).then(function (res) {
        if (res && res.ok) caches.open(CACHE).then(function (c) { c.put('./index.html', res.clone()); }).catch(function () {});
        return res;
      });
      var shell = function () { return caches.match('./index.html').then(function (h) { return h || caches.match('./'); }); };
      setTimeout(function () { shell().then(done); }, NAV_TIMEOUT_MS);
      net.then(done, function () { shell().then(function (h) { done(h || Response.error()); }); });
    }));
    return;
  }

  /* ---- versioned code: immutable once published ------------------------ */
  if (url.searchParams.has('v')) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { return keep(req, res); });
    }));
    return;
  }

  /* ---- icons and logos: stale-while-revalidate ------------------------- */
  if (/\/assets\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return keep(req, res); }).catch(function () { return hit; });
      return hit || net;
    }));
    return;
  }

  /* ---- anything else of ours: network-first ---------------------------- */
  e.respondWith(fetch(req).then(function (res) { return keep(req, res); }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || Response.error(); });
  }));
});
