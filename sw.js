/* ==========================================================================
   AVP HRIS — service worker (v3.2.1)
   --------------------------------------------------------------------------
   What makes the installed app open instantly and survive a flaky network,
   without ever showing yesterday's numbers:

     · API traffic is never touched (cross-origin POSTs to Apps Script) —
       every figure on screen always comes from the server.
     · The page itself opens from the cache at once; the fresh copy is
       fetched behind it and used from the next launch (v3.2).
     · Versioned files (?v=3.2.1) never change once published, so they are
       served straight from the cache (fetched once, kept until the next release).
     · Icons and logos: stale-while-revalidate.

   Every release bumps BUILD, which evicts the previous cache on activation;
   the page then shows "A new version is ready — Reload".
   ========================================================================== */
var BUILD = '3.2.1';
var CACHE = 'avp-hris-' + BUILD;

var SHELL = [
  './', './index.html', './manifest.webmanifest',
  './config.js?v=' + BUILD, './styles/app.css?v=' + BUILD,
  './js/icons.js?v=' + BUILD, './js/runtime.js?v=' + BUILD, './js/app.js?v=' + BUILD, './js/enhance.js?v=' + BUILD,
  './js/views/home.js?v=' + BUILD, './js/views/attendance.js?v=' + BUILD, './js/views/leave.js?v=' + BUILD, './js/views/notices.js?v=' + BUILD,
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

  /* ---- opening the app: the saved shell at once, refreshed behind ----- */
  /* v3.2: this was network-first with a 3.5 s timeout, so on a weak signal a
     launch sat on a blank screen for up to 3.5 s before falling back. The
     shell is a 4 KB file whose code references are all versioned, so the
     saved copy is always safe to show; the fresh one is stored for the next
     launch, and a new release installs a new worker anyway. Only the app's
     own entry page is served this way — any other path goes to the network. */
  if (req.mode === 'navigate') {
    var scope = new URL(self.registration.scope).pathname;
    if (url.pathname !== scope && url.pathname !== scope + 'index.html') return;
    var fresh = fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put('./index.html', copy); }).catch(function () {}); }
      return res;
    });
    e.respondWith(caches.match('./index.html').then(function (h) { return h || caches.match('./'); }).then(function (hit) {
      if (hit) { e.waitUntil(fresh.catch(function () {})); return hit; }
      return fresh.catch(function () { return Response.error(); });
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
