/* ==========================================================================
   AVP HRIS — progressive enhancement (v3.0)
   Additive layer around the app: progress bar, splash, theme with circular
   reveal, command palette with people search, keyboard shortcuts, offline,
   pull-to-refresh, installable app + service worker (static host only).
   ========================================================================== */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===================================================== 1. progress bar ==== */
  (function progressBar() {
    var el = document.getElementById('progress'); if (!el) return;
    var active = 0, done = 0, timer = null;
    function paint() { if (!active) return; el.style.width = Math.min(92, (done / (done + active)) * 100 + 8) + '%'; }
    function begin() { active++; el.classList.remove('done'); if (active === 1) el.style.width = '8%'; paint(); clearTimeout(timer); }
    function end() {
      active = Math.max(0, active - 1); done++;
      if (!active) { el.style.width = '100%'; timer = setTimeout(function () { el.classList.add('done'); setTimeout(function () { el.style.width = '0'; done = 0; }, 220); }, 140); } else paint();
    }
    var inner = window.HRIS.transport;
    window.HRIS.transport = function (action, payload) {
      if (action === 'app.config') return inner(action, payload);
      begin(); var p = inner(action, payload); p.then(end, end); return p;
    };
  })();

  /* ============================================================ 2. splash === */
  (function splash() {
    var el = document.getElementById('splash'); if (!el) return;
    var shown = Date.now(), MIN = 650;
    window.HRIS.splashOut = function () {
      if (el.classList.contains('out')) return;
      var wait = Math.max(0, MIN - (Date.now() - shown));
      setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 700); }, reduced ? 0 : wait);
    };
    // Never let the splash outlive a stuck boot.
    setTimeout(function () { window.HRIS.splashOut(); }, 9000);
  })();

  /* ============================================================= 3. theme === */
  var Theme = (function () {
    var ORDER = ['auto', 'light', 'dark'];
    function current() { try { return localStorage.getItem('hris_theme') || 'auto'; } catch (e) { return 'auto'; } }
    function effective() { var c = current(); if (c !== 'auto') return c; return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    function applyNow(t) {
      if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('hris_theme', t); } catch (e) {}
      syncIcon();
    }
    function apply(t, ev) {
      var before = effective();
      if (!document.startViewTransition || reduced) { applyNow(t); return; }
      var x = ev && ev.clientX !== undefined ? ev.clientX : window.innerWidth - 80, y = ev && ev.clientY !== undefined ? ev.clientY : 30;
      var r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      var root = document.documentElement;
      root.style.setProperty('--tx', x + 'px'); root.style.setProperty('--ty', y + 'px'); root.style.setProperty('--tr', r + 'px');
      root.classList.add('theme-reveal');
      var vt = document.startViewTransition(function () { applyNow(t); });
      vt.finished.then(function () { root.classList.remove('theme-reveal'); }, function () { root.classList.remove('theme-reveal'); });
      void before;
    }
    function cycle(ev) {
      var next = ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length];
      apply(next, ev);
      if (window.App && App.toast) App.toast('Theme: ' + (next === 'auto' ? 'follow system' : next), 'ok', 1300);
      return next;
    }
    function label() { var c = current(); return c === 'auto' ? 'Theme: follow system' : (c === 'dark' ? 'Theme: dark' : 'Theme: light'); }
    function syncIcon() {
      document.querySelectorAll('[data-act="theme"]').forEach(function (b) { b.innerHTML = App && App.icon ? App.icon(effective() === 'dark' ? 'moon' : 'sun') : ''; b.title = label(); });
    }
    new MutationObserver(syncIcon).observe(document.getElementById('app'), { childList: true });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncIcon);
    return { current: current, effective: effective, apply: function (t) { applyNow(t); }, cycle: cycle, label: label };
  })();

  /* ==================================================== 4. command palette === */
  var Palette = (function () {
    var root = null, items = [], filtered = [], cursor = 0, people = null, peopleAt = 0;
    function esc(s) { return (window.App && App.esc) ? App.esc(s) : String(s); }
    function ico(name) { return (window.App && App.icon) ? App.icon(name) : ''; }

    function build() {
      var u = (window.App && App.S && App.S.user) || {};
      var out = (App.navItems ? App.navItems() : []).map(function (n) { return { id: n.id, label: n.label, icon: n.icon, kind: 'Go to' }; });
      out.push({ id: 'openings', label: 'Job openings', icon: 'briefcase', kind: 'Go to' });
      out.push(
        { act: 'checkin', label: 'Mark attendance', icon: 'clock', kind: 'Action', keys: 'g a' },
        { act: 'applyleave', label: 'Apply for leave', icon: 'calendar', kind: 'Action', keys: 'g l' },
        { act: 'expense', label: 'Submit an expense', icon: 'receipt', kind: 'Action' },
        { act: 'ticket', label: 'Raise a helpdesk ticket', icon: 'lifebuoy', kind: 'Action' },
        { act: 'theme', label: Theme.label() + ' — switch', icon: 'sun', kind: 'Action', keys: 't' },
        { act: 'refresh', label: 'Refresh data', icon: 'refresh', kind: 'Action' },
        { act: 'shortcuts', label: 'Keyboard shortcuts', icon: 'command', kind: 'Action', keys: '?' },
        { act: 'signout', label: 'Sign out', icon: 'logout', kind: 'Action' }
      );
      if (u.isAdmin || (App.can && App.can('admin.viewAs'))) out.push({ act: 'viewas', label: 'View the app as someone…', icon: 'eye', kind: 'Admin' });
      if (App.hasAdminAccess && App.hasAdminAccess()) {
        (App.S.adminTabs || []).forEach(function (t) { out.push({ id: 'admin', params: { tab: t.id }, label: 'Admin · ' + t.label, icon: 'settings', kind: 'Admin' }); });
        if (App.can && App.can('admin.roles')) out.push({ id: 'admin', params: { tab: 'roles' }, label: 'Admin · Roles & permissions', icon: 'shield', kind: 'Admin' });
      }
      return out;
    }
    function loadPeople() {
      if (people && Date.now() - peopleAt < 5 * 60000) return Promise.resolve(people);
      return App.api('people.picklist').then(function (l) { people = Array.isArray(l) ? l : []; peopleAt = Date.now(); return people; }).catch(function () { return people || []; });
    }
    function score(label, q) {
      var l = label.toLowerCase();
      if (!q) return 1;
      if (l.startsWith(q)) return 3;
      if (l.indexOf(q) !== -1) return 2;
      var i = 0; for (var c = 0; c < l.length && i < q.length; c++) if (l[c] === q[i]) i++;
      return i === q.length ? 1 : 0;
    }
    function render(q) {
      var base = items.map(function (it) { return { it: it, s: score(it.label, q) }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.it; });
      var ppl = [];
      if (q.length >= 2 && people) {
        ppl = people.filter(function (p) { return [p.name, p.code, p.department, p.designation].join(' ').toLowerCase().indexOf(q) !== -1; }).slice(0, 6)
          .map(function (p) { return { person: p, label: p.name, kind: 'Person', sub: [p.code, p.designation].filter(Boolean).join(' · ') }; });
      }
      filtered = ppl.concat(base.slice(0, 14));
      if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
      var list = root.querySelector('.cmdk-list');
      var html = '', lastKind = '';
      filtered.forEach(function (it, i) {
        if (it.kind !== lastKind) { html += '<div class="cmdk-group">' + esc(it.kind) + '</div>'; lastKind = it.kind; }
        html += '<div class="cmdk-item' + (i === cursor ? ' on' : '') + '" data-i="' + i + '">' +
          (it.person ? '<span class="avatar sm ghost">' + esc(App.initials(it.label)) + '</span>' : ico(it.icon)) +
          '<span>' + esc(it.label) + (it.sub ? ' <span class="small muted">' + esc(it.sub) + '</span>' : '') + '</span>' +
          (it.keys ? '<span class="sub"><kbd class="kbd">' + esc(it.keys) + '</kbd></span>' : '<span class="sub">' + esc(it.kind) + '</span>') + '</div>';
      });
      list.innerHTML = html || '<div class="cmdk-empty">Nothing matches “' + esc(q) + '”.</div>';
      var on = list.querySelector('.cmdk-item.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    function run(it) {
      close(); if (!it) return;
      if (it.person) return App.go('me', { id: it.person.id });
      if (it.id) return App.go(it.id, it.params || {});
      switch (it.act) {
        case 'checkin': return App.go('attendance');
        case 'applyleave': return App.go('leave', { tab: 'apply' });
        case 'expense': return App.go('expenses', { action: 'new' });
        case 'ticket': return App.go('helpdesk', { action: 'new' });
        case 'theme': return Theme.cycle();
        case 'refresh': return App.refreshSession && App.refreshSession(true);
        case 'shortcuts': return App.showShortcuts && App.showShortcuts();
        case 'viewas': return App.pickViewAs && App.pickViewAs();
        case 'signout': return App.signOut && App.signOut();
      }
    }
    function close() { if (!root) return; root.remove(); root = null; document.removeEventListener('keydown', onKey, true); }
    function onKey(e) {
      if (!root) return;
      var q = root.querySelector('input').value.toLowerCase().trim();
      if (e.key === 'Escape') { e.preventDefault(); return close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); return render(q); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); return render(q); }
      if (e.key === 'Enter') { e.preventDefault(); return run(filtered[cursor]); }
    }
    function open() {
      if (root) return close();
      if (!window.App || !App.S || !App.S.user) return;
      if (App.closeMenus) App.closeMenus();
      items = build(); cursor = 0;
      root = document.createElement('div'); root.className = 'cmdk-backdrop';
      root.innerHTML = '<div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette"><div class="cmdk-in">' + ico('search') +
        '<input type="text" placeholder="Search people, screens and actions…" autocomplete="off" spellcheck="false" aria-label="Command"></div>' +
        '<div class="cmdk-list"></div><div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div>';
      document.body.appendChild(root);
      var input = root.querySelector('input');
      input.addEventListener('input', function () { cursor = 0; render(input.value.toLowerCase().trim()); });
      root.addEventListener('click', function (e) { if (e.target === root) close(); });
      root.querySelector('.cmdk-list').addEventListener('click', function (e) { var row = e.target.closest('.cmdk-item'); if (row) run(filtered[+row.getAttribute('data-i')]); });
      document.addEventListener('keydown', onKey, true);
      render(''); input.focus();
      loadPeople().then(function () { if (root) render(input.value.toLowerCase().trim()); });
    }
    return { open: open, close: close };
  })();

  /* ======================================================== 5. shortcuts ==== */
  (function shortcuts() {
    var seq = '', seqAt = 0;
    var GO = { h: 'home', a: 'attendance', l: 'leave', p: 'people', i: 'approvals', m: 'me', n: 'notices', e: 'expenses', s: 'admin' };
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); return Palette.open(); }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!window.App || !App.S || !App.S.user) return;
      if (document.querySelector('.backdrop, .cmdk-backdrop, .drawer')) return;
      if (e.key === '/') { e.preventDefault(); return Palette.open(); }
      if (e.key === '?') { e.preventDefault(); return App.showShortcuts && App.showShortcuts(); }
      if (e.key === 't') { return Theme.cycle(); }
      if (e.key === '[') { var c = document.querySelector('[data-act="collapse"]'); if (c) c.click(); return; }
      if (e.key === 'n') { var q = document.querySelector('.topbar [data-act="quick"]'); if (q) { q.click(); } else App.showQuickActions && App.showQuickActions(document.body); return; }
      if (e.key === 'g') { seq = 'g'; seqAt = Date.now(); return; }
      if (seq === 'g' && Date.now() - seqAt < 1200 && GO[e.key]) { seq = ''; return App.go(GO[e.key]); }
      seq = '';
    });
  })();

  /* ========================================================== 6. offline ==== */
  (function offline() {
    function sync() { document.body.classList.toggle('is-offline', navigator.onLine === false); }
    window.addEventListener('online', function () { sync(); if (window.App && App.toast) App.toast('Back online', 'ok', 1800); if (window.App && App.refreshSession) App.refreshSession(); });
    window.addEventListener('offline', sync);
    sync();
  })();

  /* ================================================ 7. pull to refresh ====== */
  (function pullToRefresh() {
    if (reduced || !('ontouchstart' in window)) return;
    var startY = 0, pulling = false, indicator = null, dist = 0, THRESHOLD = 74;
    document.addEventListener('touchstart', function (e) {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      if (document.querySelector('.backdrop, .cmdk-backdrop, .drawer')) return;
      if (!window.App || !App.S || !App.S.user) return;
      startY = e.touches[0].clientY; pulling = true; dist = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY; if (dist <= 0) return;
      if (!indicator) { indicator = document.createElement('div'); indicator.className = 'ptr'; indicator.innerHTML = (window.App && App.icon) ? App.icon('refresh') : '↻'; document.body.appendChild(indicator); }
      var pull = Math.min(dist * .5, THRESHOLD + 18);
      indicator.style.transform = 'translate(-50%,' + (pull - 34) + 'px) rotate(' + (pull * 4) + 'deg)'; indicator.style.opacity = Math.min(1, pull / THRESHOLD);
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!pulling) return; pulling = false;
      var fire = dist * .5 >= THRESHOLD;
      if (indicator) { indicator.remove(); indicator = null; }
      if (fire && window.App && App.refreshSession) { App.refreshSession(true); if (navigator.vibrate) navigator.vibrate(8); }
      dist = 0;
    });
  })();

  /* ================================================== 8. route motion ====== */
  (function routeMotion() {
    var host = document.getElementById('app'); if (!host || reduced) return;
    var lastRoute = null;
    window.HRIS.onViewPainted = function (view) {
      var route = (location.hash || '').split('?')[0];
      if (route === lastRoute) return;
      lastRoute = route;
      view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter');
    };
  })();

  /* ============================================ 9. installable app (v3.1) === */
  /* The static host is the installable app (manifest + service worker). The
     Apps Script page cannot be installed — it lives in Google's sandboxed
     frame — so there the same buttons send people to the app's address. */
  var Pwa = (function () {
    var host = window.HRIS.host;
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/i.test(ua);
    var mobile = isIOS || isAndroid || /Mobi/i.test(ua);
    var inAppBrowser = /(FBAN|FBAV|Instagram|Line\/|GSA\/|WhatsApp|LinkedInApp|Snapchat|; wv\))/i.test(ua);
    /* v3.1.3 — Android: only Chrome installs web apps cleanly. Samsung Internet and
       other phone-maker browsers wrap the app in a package built for an old Android
       version, which Play Protect on Android 14+ blocks ("Unsafe app blocked").
       Those browsers are sent to Chrome instead (index.html also withholds the
       manifest from them, so their own install button never appears). */
    var ANDROID_OTHER = [
      [/SamsungBrowser/i, 'Samsung Internet'], [/MiuiBrowser/i, 'Mi Browser'], [/HuaweiBrowser/i, 'Huawei Browser'],
      [/HeyTapBrowser/i, 'your phone\'s browser'], [/VivoBrowser/i, 'vivo Browser'], [/UCBrowser/i, 'UC Browser'],
      [/YaBrowser/i, 'Yandex Browser'], [/OPR\/|Opera/i, 'Opera'], [/EdgA\//i, 'Edge'], [/Firefox\//i, 'Firefox'], [/DuckDuckGo/i, 'DuckDuckGo']
    ];
    var otherBrowser = '';
    if (isAndroid) {
      for (var bi = 0; bi < ANDROID_OTHER.length; bi++) { if (ANDROID_OTHER[bi][0].test(ua)) { otherBrowser = ANDROID_OTHER[bi][1]; break; } }
      if (!otherBrowser && inAppBrowser) otherBrowser = 'this app\'s built-in browser';
      if (!otherBrowser && !/Chrome\//.test(ua)) otherBrowser = 'this browser';
    }
    var needChrome = !!otherBrowser;
    var DISMISS_KEY = 'hris_pwa_dismissed', PENDING_KEY = 'hris_pwa_pending', DISMISS_DAYS = 14, PENDING_MS = 10 * 60 * 1000;
    var deferred = null, installedNow = false;
    var appUrl = host === 'static'
      ? location.origin + location.pathname.replace(/[^/]*$/, '')
      : String(window.HRIS_PWA_URL || '');
    var iconUrl = host === 'static' ? 'assets/icons/icon-192.png' : (appUrl ? appUrl + 'assets/icons/icon-192.png' : '');

    function ls(k, v) { try { if (arguments.length === 1) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function ic(n, s) { return typeof icon === 'function' ? icon(n, s) : ''; }

    function standalone() {
      try {
        if (navigator.standalone === true) return true;
        // Our manifest asks for "standalone". Not "fullscreen": a normal browser window in
        // full-screen mode matches that too.
        return ['standalone', 'window-controls-overlay'].some(function (m) { return window.matchMedia('(display-mode: ' + m + ')').matches; });
      } catch (e) { return false; }
    }
    /* What "install" means here: prompt (Chrome/Edge gave us the native dialog),
       ios / android (show the steps), chrome (Android, wrong browser: hand over to
       Chrome), redirect (go to the app's address), none. */
    function mode() {
      if (standalone() || installedNow) return 'installed';
      if (host !== 'static') return appUrl ? 'redirect' : 'none';
      if (needChrome) return 'chrome';
      if (deferred) return 'prompt';
      if (isIOS) return 'ios';
      if (isAndroid) return 'android';
      return 'none';
    }
    function offer() { var m = mode(); return m !== 'installed' && m !== 'none'; }
    function dismissed() { var t = +ls(DISMISS_KEY) || 0; return Date.now() - t < DISMISS_DAYS * 864e5; }

    /* Opens this page in Chrome (Android). Falls back to Chrome's Play Store page. */
    function chromeIntent() {
      var target = appUrl.replace(/^https?:\/\//, '') + '?install=1';
      return 'intent://' + target + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
        encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome') + ';end';
    }

    /* ---- surfaces ---------------------------------------------------------- */
    function cardInner() {
      var m = mode();
      var cta = m === 'redirect'
        ? '<a class="btn btn-primary btn-sm" href="' + esc(appUrl) + '?install=1" target="_top" data-pwa="open">' + ic('appinstall') + (geoMovesToApp() ? ' Open the app' : ' Get the app') + '</a>'
        : m === 'chrome'
          ? '<a class="btn btn-primary btn-sm" href="' + esc(chromeIntent()) + '" data-pwa="open">' + ic('externallink') + ' Open in Chrome</a>'
          : '<button class="btn btn-primary btn-sm" data-pwa="install">' + ic('appinstall') + ' Install</button>';
      var copy = m === 'chrome'
        ? 'Install it from <b>Chrome</b> — ' + esc(otherBrowser) + ' gets blocked by Play Protect on newer Android phones. <a href="#" data-pwa="install">Why?</a>'
        : geoMovesToApp() ? '<b>iPhone: check in from the app.</b> Location doesn\'t work on this Google page, so attendance can\'t be marked here.'
        : mobile ? 'An icon on your home screen — opens in a tap, checks you in faster, feels like a real app.' : 'Open AVP HRIS in its own window, straight from your dock or taskbar.';
      return '<div class="pwa-card">' +
        '<div class="pwa-icon">' + (iconUrl ? '<img src="' + esc(iconUrl) + '" alt="" width="44" height="44">' : ic('smartphone', 22)) + '</div>' +
        '<div class="pwa-copy"><b>Get the AVP HRIS app</b><span>' + copy + '</span></div>' +
        '<div class="pwa-cta">' + cta + (geoMovesToApp() ? '' : '<button class="iconbtn" data-pwa="dismiss" aria-label="Not now" title="Not now">' + ic('x') + '</button>') + '</div>' +
        '</div>';
    }
    function homeCard() {
      var show = offer() && (!dismissed() || geoMovesToApp()) && (mobile || mode() === 'prompt');
      return '<div id="pwaSlot" class="pwa-slot">' + (show ? cardInner() : '') + '</div>';
    }
    function loginChip() {
      if (!offer() || !mobile) return '';
      var m = mode();
      if (m === 'chrome') {
        return '<div class="pwa-login">' + (iconUrl ? '<img src="' + esc(iconUrl) + '" alt="" width="28" height="28">' : ic('smartphone')) +
          '<span>Want the app? <a href="' + esc(chromeIntent()) + '" data-pwa="open">Open this page in Chrome</a> and install it from there — ' + esc(otherBrowser) + ' can\'t install it safely.</span></div>';
      }
      if (geoMovesToApp()) {
        return '<div class="pwa-login is-strong">' + (iconUrl ? '<img src="' + esc(iconUrl) + '" alt="" width="28" height="28">' : ic('smartphone')) +
          '<span><b>On iPhone, use the AVP HRIS app.</b> This Google page can\'t use your location, so check-in won\'t work here. <a href="' + esc(appUrl) + '?install=1" target="_top" data-pwa="open">Open the app</a></span></div>';
      }
      var act = m === 'redirect' ? '<a href="' + esc(appUrl) + '?install=1" target="_top" data-pwa="open">Install the app</a>' : '<a href="#" data-pwa="install">Install the app</a>';
      return '<div class="pwa-login">' + (iconUrl ? '<img src="' + esc(iconUrl) + '" alt="" width="28" height="28">' : ic('smartphone')) +
        '<span>Using this on your phone? ' + act + ' first, then sign in there.</span></div>';
    }
    function paint() {
      var slot = document.getElementById('pwaSlot');
      if (slot) slot.innerHTML = (offer() && (!dismissed() || geoMovesToApp()) && (mobile || mode() === 'prompt')) ? cardInner() : '';
    }
    function dismiss() {
      ls(DISMISS_KEY, String(Date.now()));
      var c = document.querySelector('#pwaSlot .pwa-card');
      if (!c) return;
      c.classList.add('is-leaving');
      setTimeout(function () { var s = document.getElementById('pwaSlot'); if (s) s.innerHTML = ''; }, 280);
      window.App && App.toast && App.toast('Hidden for now — "Install the app" stays in your profile menu.', 'ok', 3200);
    }

    /* ---- install ----------------------------------------------------------- */
    function install() {
      var m = mode();
      if (m === 'prompt') {
        var d = deferred; deferred = null;
        try { d.prompt(); } catch (e) { return guide(isIOS ? 'ios' : isAndroid ? 'android' : 'desktop'); }
        return d.userChoice.then(function (c) { if (!c || c.outcome !== 'accepted') paint(); }).catch(function () {});
      }
      if (m === 'redirect') { try { window.top.location.href = appUrl + '?install=1'; } catch (e) { window.open(appUrl + '?install=1', '_blank'); } return; }
      if (m === 'installed') { window.App && App.toast('AVP HRIS is already installed on this device.', 'ok'); return; }
      guide(m === 'none' ? 'desktop' : m);
    }
    function step(n, iconName, html) {
      return '<li class="pwa-step" style="animation-delay:' + (n * 90) + 'ms"><span class="pwa-num">' + n + '</span><span class="pwa-step-ic">' + ic(iconName, 20) + '</span><span class="pwa-step-t">' + html + '</span></li>';
    }
    function guide(kind) {
      if (!window.App || !App.modal) return;
      var steps, note = '';
      var lead = '';
      if (kind === 'chrome') {
        lead = '<div class="pwa-warn">' + ic('shield', 18) + '<div><b>Please install from Chrome.</b> On newer Android phones, Play Protect blocks apps installed from ' + esc(otherBrowser) +
          ' and shows <i>"Unsafe app blocked"</i>. Chrome installs the same app properly. If you saw that message, tap <b>OK</b> — nothing was installed.</div></div>' +
          '<a class="btn btn-primary btn-xl pwa-chrome-btn" href="' + esc(chromeIntent()) + '" data-pwa="open">' + ic('externallink') + ' Open in Chrome</a>';
        steps = step(1, 'externallink', 'Tap <b>Open in Chrome</b> above') +
          step(2, 'appinstall', 'In Chrome, tap <b>Install</b> <small>(or <b>⋮ → Install app</b>)</small>') +
          step(3, 'check', 'Open <b>AVP HRIS</b> from your home screen and sign in once.');
        note = '<div class="hintbox mt2"><b>No Chrome on this phone?</b> Add a shortcut instead: open ' + esc(otherBrowser) + '\'s menu and tap <b>Add page to → Home screen</b>' +
          (otherBrowser === 'Samsung Internet' ? '' : ' <small>(or Add to Home screen)</small>') + '. Please don\'t choose "Install anyway" on a Play Protect warning.</div>';
      } else if (kind === 'ios') {
        steps = step(1, 'share', 'Tap <b>Share</b> in Safari\'s toolbar <small>(on newer iPhones tap <b>•••</b> first, then Share)</small>') +
          step(2, 'plussquare', 'Scroll down and tap <b>Add to Home Screen</b>') +
          step(3, 'check', 'Tap <b>Add</b>. Open <b>AVP HRIS</b> from your home screen and sign in once.');
        if (inAppBrowser || !/Safari\//.test(ua)) {
          note = '<div class="hintbox mt2"><b>Opened from WhatsApp, Gmail or another app?</b> Open this page in <b>Safari</b> first — tap the compass or "Open in Safari".</div>';
        }
      } else if (kind === 'android') {
        steps = step(1, 'morevertical', 'Tap the <b>⋮</b> menu at the top-right of Chrome') +
          step(2, 'appinstall', 'Tap <b>Install app</b> <small>(or <b>Add to Home screen</b>)</small>') +
          step(3, 'check', 'Tap <b>Install</b>. AVP HRIS appears with your other apps.');
        if (inAppBrowser) note = '<div class="hintbox mt2"><b>Opened from WhatsApp or another app?</b> Tap <b>⋮ → Open in Chrome</b> first.</div>';
      } else {
        steps = step(1, 'download', 'Open this page in <b>Chrome</b> or <b>Edge</b>') +
          step(2, 'appinstall', 'Click the <b>install</b> icon at the right end of the address bar') +
          step(3, 'check', 'Click <b>Install</b> — AVP HRIS opens in its own window.');
      }
      App.modal({
        title: 'Install AVP HRIS',
        body: '<div class="pwa-guide">' +
          '<div class="pwa-guide-head">' + (iconUrl ? '<img src="' + esc(iconUrl) + '" alt="" width="64" height="64">' : '') +
          '<div><b>AVP HRIS</b><span>AVP Structural Consultants</span></div></div>' +
          lead + '<ol class="pwa-steps">' + steps + '</ol>' + note +
          '<div class="pwa-addr"><span class="small muted">App address</span><code>' + esc(appUrl.replace(/^https:\/\//, '')) + '</code>' +
          '<button class="btn btn-ghost btn-sm" data-pwa="copy">' + ic('copy') + ' Copy link</button></div>' +
          '</div>',
        footer: '<button class="btn btn-primary" data-close="btn">Got it</button>'
      });
    }

    /* ---- location help (v3.1.5) --------------------------------------------- */
    /* iPhone + the Google Script page: Safari never shows its location question
       inside Google's sandboxed frame — the request just comes back "denied",
       even with Location Services on. The same app on its own address (appUrl)
       is an ordinary page, so Safari asks there. Everywhere else the fix is a
       browser or phone setting, so the sheet shows those steps for this device. */
    function geoMovesToApp() { return host !== 'static' && isIOS && !!appUrl; }
    function addrBox() {
      if (!appUrl) return '';
      return '<div class="pwa-addr"><span class="small muted">App address</span><code>' + esc(appUrl.replace(/^https:\/\//, '')) + '</code>' +
        '<button class="btn btn-ghost btn-sm" data-pwa="copy">' + ic('copy') + ' Copy link</button></div>';
    }
    var geoAsked = 0;
    function geoHelp(opts) {
      opts = opts || {};
      if (!window.App || !App.modal) return;
      geoAsked++;
      var settled = false;
      var title, body, footer, steps, note = '';
      if (geoMovesToApp()) {
        title = 'Check in from the AVP HRIS app';
        body = '<div class="pwa-warn">' + ic('pin', 18) + '<div><b>iPhone blocks location on this Google page</b>, even when Location is on. ' +
          'The AVP HRIS app link is the same app — there Safari asks for your location and check-in works.</div></div>' +
          '<a class="btn btn-primary btn-xl pwa-chrome-btn" href="' + esc(appUrl) + '?install=1" target="_top" data-pwa="open">' + ic('externallink') + ' Open the AVP HRIS app</a>' +
          '<ol class="pwa-steps">' +
          step(1, 'externallink', 'Tap <b>Open the AVP HRIS app</b> and sign in once <small>(employee code or Google)</small>') +
          step(2, 'pin', 'When Safari asks to use your location, tap <b>Allow</b> — then check in') +
          step(3, 'plussquare', 'Tap <b>Share → Add to Home Screen</b>, and delete the old AVP HRIS icon') +
          '</ol>' + addrBox();
        footer = '<button class="btn btn-secondary" data-close="btn">Close</button>';
      } else {
        title = 'Allow location to mark attendance';
        if (isIOS) {
          steps = step(1, 'settings', 'iPhone <b>Settings → Privacy &amp; Security → Location Services</b>: turn it on, then <b>Safari Websites → While Using the App</b>') +
            step(2, 'pin', 'In Safari, tap the <b>page menu</b> left of the address <small>(aA or ☰)</small> → <b>Website Settings → Location → Allow</b>') +
            step(3, 'refresh', 'Come back here and tap <b>Try again</b>');
          note = standalone()
            ? '<div class="hintbox mt2"><b>Using the AVP HRIS icon on your Home Screen?</b> Close it fully (swipe it away) and open it again. If it still never asks: delete the icon, open the link in Safari, allow location there, then add it to the Home Screen again.</div>'
            : '';
        } else if (isAndroid) {
          steps = step(1, 'pin', 'Turn on <b>Location</b> <small>(swipe down from the top of the screen)</small>') +
            step(2, 'settings', 'In Chrome, tap the icon left of the web address → <b>Permissions</b> <small>(or Site settings)</small> → <b>Location → Allow</b>') +
            step(3, 'refresh', 'Come back here and tap <b>Try again</b>');
          note = '<div class="hintbox mt2"><b>Still blocked?</b> Phone <b>Settings → Location → App location permissions → Chrome → Allow only while using the app</b>.' +
            (standalone() ? ' For the installed app: Chrome <b>⋮ → Settings → Site settings → Location</b> → allow this site.' : '') + '</div>';
        } else {
          steps = step(1, 'settings', 'Click the icon at the left of the address bar → <b>Location → Allow</b>') +
            step(2, 'refresh', 'Click <b>Try again</b> below') +
            step(3, 'smartphone', 'On a Mac, also check <b>System Settings → Privacy &amp; Security → Location Services</b> for your browser');
        }
        body = '<div class="pwa-warn">' + ic('pin', 18) + '<div><b>' + (geoAsked > 1 ? 'Location is still blocked.' : 'Location is blocked for AVP HRIS.') + '</b> ' +
          'Attendance needs your location once, at the moment you check in or out — it is never tracked in the background.</div></div>' +
          '<ol class="pwa-steps">' + steps + '</ol>' + note +
          (host !== 'static' && appUrl ? '<div class="hintbox mt2">Or use the <a href="' + esc(appUrl) + '?install=1" target="_top" data-pwa="open">AVP HRIS app link</a> instead of this Google page.</div>' : '');
        footer = '<button class="btn btn-secondary" data-close="btn">Close</button>' +
          (opts.retry ? '<button class="btn btn-primary" data-geo="retry">' + ic('refresh') + ' Try again</button>' : '');
      }
      App.modal({
        title: title,
        body: '<div class="pwa-guide geo-help">' + body + '</div>',
        footer: footer,
        onMount: function (root) {
          var box = root.querySelector('.backdrop');
          var r = root.querySelector('[data-geo="retry"]');
          if (r) r.addEventListener('click', function () {
            settled = true;
            App.close(true);
            setTimeout(opts.retry, 40);
          });
          // Closed any other way (X, backdrop, Esc, the app link) → the punch is abandoned.
          if (window.MutationObserver && box) {
            var mo = new MutationObserver(function () {
              if (box.isConnected) return;
              mo.disconnect();
              if (!settled) { settled = true; if (opts.dismiss) opts.dismiss(); }
            });
            mo.observe(root, { childList: true });
          }
        }
      });
    }
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('[data-geohelp]');
      if (!a) return;
      ev.preventDefault();
      geoHelp({ retry: function () { window.App && App.render && App.render(); } });
    });

    /* ---- Google sign-in from the installed app ------------------------------ */
    function nonce() {
      var b = new Uint8Array(18);
      (window.crypto || window.msCrypto).getRandomValues(b);
      return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function pending() {
      try { var p = JSON.parse(ls(PENDING_KEY) || 'null'); if (p && p.nonce && Date.now() - p.at < PENDING_MS) return p; } catch (e) {}
      return null;
    }
    function withState(url, value, append) {
      url = String(url || '');
      var m = /([?&])state=([^&#]*)/.exec(url);
      if (m) {
        var cur = decodeURIComponent(m[2]);
        return url.replace(m[0], m[1] + 'state=' + encodeURIComponent(append ? cur + value : value));
      }
      return url + (url.indexOf('?') === -1 ? '?' : '&') + 'state=' + encodeURIComponent(value);
    }
    /* Capture phase: the href is rewritten before the browser follows it. */
    document.addEventListener('click', function (ev) {
      if (host !== 'static' || !ev.target || !ev.target.closest) return;
      var a = ev.target.closest('a[data-google-signin], a[data-google-link]');
      if (!a) return;
      var href = a.getAttribute('data-href-orig') || a.getAttribute('href');
      a.setAttribute('data-href-orig', href);
      if (a.hasAttribute('data-google-link')) { a.setAttribute('href', withState(href, '~pwa', true)); return; }
      var value = 'pwa';
      if (standalone()) { var n = nonce(); ls(PENDING_KEY, JSON.stringify({ nonce: n, at: Date.now() })); value = 'pwa~' + n; }
      a.setAttribute('href', withState(href, value, false));
    }, true);

    /* The browser tab that finished a sign-in for the installed app only shows
       "go back to the app" — it must not collect the result itself (on Android
       it shares storage with the app and would race it). */
    var isHandoffPage = host === 'static' && !!window.HRIS_PWA_HANDOFF && !standalone();
    var polling = false, pollNoted = false;
    function clearPending() { ls(PENDING_KEY, null); }
    function poll() {
      if (host !== 'static' || isHandoffPage || polling || document.visibilityState === 'hidden') return;
      var p = pending();
      if (!p) return;
      if (window.App && App.S && App.S.user) { ls(PENDING_KEY, null); return; }
      polling = true;
      if (!pollNoted && window.App && App.toast) { pollNoted = true; App.toast('Finishing your Google sign-in…', 'ok', 2500); }
      window.HRIS.transport('auth.completeHandoff', { nonce: p.nonce }).then(function (r) {
        polling = false;
        var d = r && r.ok ? r.data || {} : {};
        if (r && !r.ok) { ls(PENDING_KEY, null); return; }
        if (d.query != null) {
          ls(PENDING_KEY, null);
          if (window.App && App.S && App.S.user) return;
          var q = new URLSearchParams(d.query);
          if (q.get('gc')) return window.App && App.claimGoogle(q.get('gc'));
          if (q.get('gerr') && window.App) { App.renderLoginAgain(); App.toast(q.get('gerr'), 'err', 8000); }
          return;
        }
        setTimeout(poll, 2500);
      }, function () { polling = false; setTimeout(poll, 4000); });
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
    window.addEventListener('focus', poll);
    window.addEventListener('pageshow', poll);

    function deferClaim() { return host === 'static' && !!window.HRIS_PWA_HANDOFF && !standalone(); }
    function renderHandoff(code) {
      var app = document.getElementById('app'); if (!app) return;
      app.innerHTML = '<div class="handoff"><div class="box rise-in">' +
        (iconUrl ? '<img class="handoff-icon" src="' + esc(iconUrl) + '" alt="" width="72" height="72">' : '') +
        '<div class="handoff-tick">' + ic('check', 26) + '</div>' +
        '<h2>You\'re signed in</h2>' +
        '<p class="muted">Go back to the <b>AVP HRIS</b> app' + (mobile ? ' on your home screen' : '') + ' — it opens signed in.' + (isIOS ? ' <span class="small">Tap <b>Done</b> or swipe this page away.</span>' : '') + '</p>' +
        '<button class="btn btn-ghost btn-sm" data-pwa="here">Continue in this browser instead</button>' +
        '</div></div>';
      app.querySelector('[data-pwa="here"]').addEventListener('click', function () { this.disabled = true; window.App && App.claimGoogle(code); });
    }

    /* ---- surface clicks ------------------------------------------------------ */
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-pwa]');
      if (!b) return;
      var act = b.getAttribute('data-pwa');
      if (act === 'open') return;                                    // a real link; let it go
      if (act === 'here') return;
      ev.preventDefault();
      if (act === 'install') install();
      else if (act === 'dismiss') dismiss();
      else if (act === 'copy') {
        var done = function () { window.App && App.toast('Link copied — paste it in Safari or Chrome.', 'ok'); };
        try { navigator.clipboard.writeText(appUrl).then(done, function () { window.prompt('Copy this link', appUrl); }); } catch (e) { window.prompt('Copy this link', appUrl); }
      }
    });

    /* ---- browser events ------------------------------------------------------ */
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      if (needChrome) return;            // this browser's install gets blocked by Play Protect
      deferred = e; paint();
      if (window.HRIS_PWA_INSTALL && window.App && App.toast) App.toast('Tap Install to add AVP HRIS to this device.', 'ok', 4000);
    });
    window.addEventListener('appinstalled', function () {
      installedNow = true; deferred = null; paint();
      window.App && App.toast && App.toast('AVP HRIS is installed — find it with your other apps.', 'ok', 5000);
      try { window.App && App.confetti && App.confetti(60); } catch (e) {}
    });

    /* Arrived from "Get the app" on the Apps Script page: open the steps once
       the first screen is up (Chrome shows its own prompt via the card). */
    function afterLoginPaint() {
      if (!window.HRIS_PWA_INSTALL) return;
      window.HRIS_PWA_INSTALL = false;
      setTimeout(function () { var m = mode(); if (m === 'ios' || m === 'android' || m === 'chrome') guide(m); }, 900);
    }
    if (window.HRIS_PWA_INSTALL) document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (window.App && App.S && App.S.user) afterLoginPaint(); }, 2500); });

    /* Start collecting a pending Google sign-in as soon as the app is up. */
    if (host === 'static' && pending()) document.addEventListener('DOMContentLoaded', function () { setTimeout(poll, 600); });

    if (standalone()) document.documentElement.classList.add('is-standalone');
    if (isIOS) document.documentElement.classList.add('is-ios');

    return {
      standalone: standalone, mode: mode, offer: offer, install: install, guide: guide,
      homeCard: homeCard, loginChip: loginChip, paint: paint, afterLoginPaint: afterLoginPaint,
      deferClaim: deferClaim, renderHandoff: renderHandoff, poll: poll, clearPending: clearPending, appUrl: function () { return appUrl; },
      needChrome: function () { return needChrome; }, chromeIntent: chromeIntent,
      geoHelp: geoHelp, geoMovesToApp: geoMovesToApp
    };
  })();
  window.HRIS.pwa = Pwa;

  /* ========================================== 10. service worker + updates === */
  var swOk = 'serviceWorker' in navigator && window.HRIS.host === 'static' &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  if (swOk) {
    var hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // Installed apps stay open for days: look for a new release whenever it comes back to the front.
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
      }).catch(function () {});
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      if (document.querySelector('.update-bar')) return;
      var bar = document.createElement('div');
      bar.className = 'update-bar'; bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>' + ((window.App && App.icon) ? App.icon('sparkles') : '') + ' A new version is ready</span><button class="btn btn-primary btn-sm">Reload</button>';
      bar.querySelector('button').addEventListener('click', function () { location.reload(); });
      document.body.appendChild(bar);
    });
  }

  window.HRIS.theme = Theme;
  window.HRIS.palette = Palette;
})();
