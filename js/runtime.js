/* ==========================================================================
   AVP HRIS — runtime bridge (v3.0)
   --------------------------------------------------------------------------
   One client, two hosts:

     · Apps Script (HtmlService)  — google.script.run is present. Calls go
       straight to rpc() on the server: no CORS, no /exec redirect, no
       2.6 s platform hop. Index.html injects the boot globals server-side, so
       nothing has to be fetched before the first paint.

     · Static site (GitHub Pages) — fetch() to /exec with a text/plain body,
       coalesced into app.batch and retried only for reads (unchanged v2.0).

   The rest is host-independent: a short read cache with revalidation behind
   the paint, optional persistence of that cache across reloads, and the view
   module loader (inline <script> for HtmlService via app.viewScript, a <script
   src> for the static host).
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.HRIS_CONFIG || {};
  var ENDPOINT = String(CFG.endpoint || '').trim();
  var GS = !!(window.google && google.script && google.script.run);   // HtmlService host?

  /* ====================================================================== */
  /*  1. Transports                                                         */
  /* ====================================================================== */

  var TIMEOUT_MS = 60000, RETRIES = 2, RETRY_BASE_MS = 700;

  /* --- a. google.script.run -------------------------------------------- */
  function gsCall(action, payload) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('The server took too long to answer. Please try again.')); }, TIMEOUT_MS);
      try {
        google.script.run
          .withSuccessHandler(function (res) { clearTimeout(timer); resolve(res); })
          .withFailureHandler(function (e) { clearTimeout(timer); reject(new Error(e && e.message ? e.message : String(e))); })
          .rpc(action, payload);
      } catch (e) { clearTimeout(timer); reject(e); }
    });
  }

  /* --- b. fetch to /exec ------------------------------------------------ */
  function post(body, attempt, retriable) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    return fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw httpError(r.status);
      return r.text();
    }).then(function (text) {
      try { return JSON.parse(text); } catch (e) {
        throw new Error(/accounts\.google\.com|Sign in|Authorization/i.test(text)
          ? 'The server rejected the request. The web app deployment needs to be set to "Anyone" access.'
          : 'The server sent an unexpected response. Please try again.');
      }
    }).catch(function (e) {
      clearTimeout(timer);
      var transient = e.name === 'AbortError' || e.__retriable || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      if (retriable && transient && attempt < RETRIES && navigator.onLine !== false) {
        return new Promise(function (res) { setTimeout(res, RETRY_BASE_MS * Math.pow(2, attempt)); })
          .then(function () { return post(body, attempt + 1, retriable); });
      }
      if (navigator.onLine === false) throw new Error('You are offline. Reconnect and try again.');
      if (e.name === 'AbortError') throw new Error('The server took too long to answer. Please try again.');
      throw e;
    });
  }
  function httpError(status) {
    var e = new Error(status === 401 || status === 403 ? 'The server refused the request (deployment access).' :
      status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed (' + status + ').');
    e.__retriable = status >= 500 || status === 429;
    return e;
  }

  /* ====================================================================== */
  /*  2. Reads vs writes                                                    */
  /* ====================================================================== */
  var WRITE_VERBS = new RegExp('^(' + [
    'save', 'create', 'submit', 'apply', 'decide', 'cancel', 'delete', 'update', 'issue', 'generate', 'process', 'lock',
    'publish', 'archive', 'acknowledge', 'approve', 'reject', 'close', 'comment', 'remind', 'void', 'return', 'convert',
    'moveStage', 'schedule', 'adminMark', 'markPaid', 'setStatus', 'setActive', 'setTemplateActive', 'setDeviceTrust',
    'setLastWorkingDate', 'import', 'importEmployees', 'reset', 'requestReset', 'completeReset', 'link', 'unlinkGoogle',
    'sign', 'signPdf', 'decline', 'withdraw', 'relieve', 'prepare', 'prepareGenerate', 'send', 'sendForSignature', 'refer',
    'feedback', 'read', 'logout', 'login', 'checkin', 'checkout', 'request', 'complete', 'upload', 'uploadDocument', 'add',
    'addEmployees', 'skipManager', 'finalize', 'assign', 'assignManager', 'assignLocation', 'confirmEmployee',
    'verifyDocument', 'resetPassword', 'changePassword', 'signOutEverywhere', 'claimGoogleSession', 'createDraft',
    'updateDraft', 'cancelSigning', 'cancelInterview', 'saveSettings', 'setWebUi', 'suggest', 'fnf', 'saveRole', 'deleteRole', 'assignRole'
  ].join('|') + ')', 'i');
  function isWrite(action) { return WRITE_VERBS.test(String(action).split('.').pop()); }
  function isRead(action) { return !isWrite(action); }

  /* ====================================================================== */
  /*  3. Read cache (memory + optional session persistence)                 */
  /* ====================================================================== */
  var CACHE_TTL_MS = 90 * 1000, REVALIDATE_GAP_MS = 3000, PERSIST_KEY = 'hris_readcache_v3';
  var readCache = Object.create(null);

  function cacheKey(action, payload) {
    var p = {};
    for (var k in payload) if (k !== 'token') p[k] = payload[k];
    try { return action + '|' + JSON.stringify(p); } catch (e) { return null; }
  }
  function clearReadCache() { readCache = Object.create(null); try { sessionStorage.removeItem(PERSIST_KEY); } catch (e) {} }

  /* Persist the last few reads for the current token so a reload paints
     instantly and revalidates behind. Kept small and per-session. */
  var persistTimer = null;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      try {
        var keys = Object.keys(readCache).slice(-40), out = {};
        keys.forEach(function (k) { if (readCache[k] && readCache[k].res && !/viewAs/.test(k)) out[k] = { res: readCache[k].res, at: readCache[k].at }; });
        sessionStorage.setItem(PERSIST_KEY, JSON.stringify({ t: tokenTail(), c: out }));
      } catch (e) {}
    }, 400);
  }
  function tokenTail() { try { return String(localStorage.getItem('hris_token') || '').slice(-8); } catch (e) { return ''; } }
  (function restore() {
    try {
      var raw = sessionStorage.getItem(PERSIST_KEY); if (!raw) return;
      var data = JSON.parse(raw); if (!data || data.t !== tokenTail()) return;
      Object.keys(data.c || {}).forEach(function (k) {
        var v = data.c[k]; if (!v || !v.res) return;
        readCache[k] = { res: v.res, at: v.at || 0, checkedAt: 0, serialised: safeSerialise(v.res), stale: true };
      });
    } catch (e) {}
  })();

  function safeToRerender(route) {
    if (!window.App || !App.S || !App.S.user) return false;
    if ((location.hash || '').split('?')[0].replace('#/', '') !== route) return false;
    if (document.querySelector('.backdrop, .cmdk-backdrop, .drawer')) return false;
    var host = document.getElementById('view'), active = document.activeElement;
    if (host && active && host.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '')) return false;
    return true;
  }
  var rerenderQueued = false;
  function scheduleRerender(route) {
    if (rerenderQueued) return;
    rerenderQueued = true;
    var run = function () { rerenderQueued = false; if (safeToRerender(route)) App.render({ quiet: true }); };
    if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(run); else Promise.resolve().then(run);
  }
  function currentRoute() { return (location.hash || '').split('?')[0].replace('#/', '') || 'home'; }

  /* ====================================================================== */
  /*  4. Batching (static host only)                                        */
  /* ====================================================================== */
  var BATCH_MAX = 15, batchSupported = !GS;
  var pending = [], flushScheduled = false, inflight = Object.create(null);

  function scheduleFlush() { if (flushScheduled) return; flushScheduled = true; Promise.resolve().then(flush); }
  function enqueue(action, payload) {
    if (GS) return gsCall(action, payload);
    return new Promise(function (resolve, reject) { pending.push({ action: action, payload: payload, resolve: resolve, reject: reject }); scheduleFlush(); });
  }
  function flush() {
    flushScheduled = false;
    var group = pending.splice(0, BATCH_MAX);
    if (pending.length) scheduleFlush();
    if (!group.length) return;
    if (group.length === 1 || !batchSupported) { group.forEach(sendSingle); return; }
    sendBatch(group);
  }
  function sendSingle(item) { post({ action: item.action, payload: item.payload }, 0, isRead(item.action)).then(item.resolve, item.reject); }
  function sendBatch(group) {
    var calls = group.map(function (g) { return { action: g.action, payload: g.payload }; });
    var allReads = group.every(function (g) { return isRead(g.action); });
    post({ action: 'app.batch', payload: { calls: calls } }, 0, allReads).then(function (res) {
      if (res && res.ok === false && /unknown action/i.test(res.error || '')) { batchSupported = false; group.forEach(sendSingle); return; }
      if (!res || !res.ok || !Array.isArray(res.data) || res.data.length !== group.length) throw new Error((res && res.error) || 'The server sent an unexpected batch response.');
      res.data.forEach(function (r, i) { group[i].resolve(r); });
    }).catch(function (err) { group.forEach(function (g) { g.reject(err); }); });
  }

  /* ====================================================================== */
  /*  5. The transport the app sees                                         */
  /* ====================================================================== */
  function transport(action, payload) {
    if (!GS && !ENDPOINT) return Promise.reject(new Error('The app is not configured yet: set the Apps Script /exec URL in config.js.'));
    payload = payload || {};
    if (isWrite(action)) { clearReadCache(); return enqueue(action, payload); }

    var key = cacheKey(action, payload);
    if (!key) return enqueue(action, payload);
    var hit = readCache[key], now = Date.now();

    if (hit && hit.res && ((now - hit.at) < CACHE_TTL_MS || hit.stale)) {
      var mustRevalidate = hit.stale || (!hit.revalidating && (now - (hit.checkedAt || hit.at)) > REVALIDATE_GAP_MS);
      if (mustRevalidate && !hit.revalidating) {
        hit.revalidating = true; hit.stale = false;
        var route = currentRoute(), before = hit.serialised;
        enqueue(action, payload).then(function (fresh) {
          hit.revalidating = false; hit.checkedAt = Date.now();
          if (!fresh || fresh.ok !== true) return;
          var s = safeSerialise(fresh);
          hit.res = fresh; hit.at = Date.now(); hit.serialised = s; persistSoon();
          if (s !== before) scheduleRerender(route);
        }, function () { hit.revalidating = false; hit.checkedAt = Date.now(); });
      }
      return Promise.resolve(hit.res);
    }
    if (inflight[key]) return inflight[key];
    var p = enqueue(action, payload).then(function (res) {
      delete inflight[key];
      if (res && res.ok === true) { readCache[key] = { res: res, at: Date.now(), checkedAt: Date.now(), serialised: safeSerialise(res) }; persistSoon(); }
      return res;
    }, function (e) { delete inflight[key]; throw e; });
    inflight[key] = p;
    return p;
  }
  function safeSerialise(v) { try { return JSON.stringify(v); } catch (e) { return null; } }

  window.HRIS = { transport: transport, endpoint: ENDPOINT, clearReadCache: clearReadCache, isWrite: isWrite, host: GS ? 'apps-script' : 'static' };

  /* ====================================================================== */
  /*  6. View modules                                                       */
  /* ====================================================================== */
  var MODULE_FILE = {
    ViewsHome: 'home', ViewsAttendance: 'attendance', ViewsLeave: 'leave', ViewsPeople: 'people', ViewsAdmin: 'admin',
    ViewsPayroll: 'payroll', ViewsPerformance: 'performance', ViewsExit: 'exit', ViewsExpenses: 'expenses', ViewsAssets: 'assets',
    ViewsNotices: 'notices', ViewsHelpdesk: 'helpdesk', ViewsRecruitment: 'recruitment', ViewsLetters: 'letters', ViewsRoles: 'roles'
  };
  var ROUTE_MODULE = {
    home: 'ViewsHome', me: 'ViewsHome', attendance: 'ViewsAttendance', leave: 'ViewsLeave',
    people: 'ViewsPeople', approvals: 'ViewsPeople', reports: 'ViewsPeople', payslips: 'ViewsPayroll',
    performance: 'ViewsPerformance', exit: 'ViewsExit', expenses: 'ViewsExpenses', notices: 'ViewsNotices',
    helpdesk: 'ViewsHelpdesk', openings: 'ViewsRecruitment', signatures: 'ViewsLetters', sign: 'ViewsLetters'
  };
  var moduleLoads = Object.create(null);
  window.HRIS_INLINE_MODULES = window.HRIS_INLINE_MODULES || {};   // Index.html marks modules it already inlined

  window.HRIS.loadViewModule = function (name) {
    if (window.HRIS_INLINE_MODULES[name]) return Promise.resolve();
    if (moduleLoads[name]) return moduleLoads[name];
    var file = MODULE_FILE[name];
    if (!file) return Promise.reject(new Error('Unknown module: ' + name));
    var p;
    if (GS) {
      /* HtmlService: the module's <script> arrives as text through the RPC. */
      p = gsCall('app.viewScript', { name: name, token: (function () { try { return localStorage.getItem('hris_token'); } catch (e) { return null; } })() })
        .then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'Could not load the ' + file + ' screen.');
          var m = /<script[^>]*>([\s\S]*)<\/script>/i.exec(res.data.html);
          var el = document.createElement('script'); el.text = m ? m[1] : res.data.html; document.head.appendChild(el);
        });
    } else {
      p = new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = 'js/views/' + file + '.js?v=' + encodeURIComponent(window.HRIS_BUILD || '1'); el.async = true;
        el.onload = function () { resolve(); };
        el.onerror = function () { el.remove(); reject(new Error('Could not load the ' + file + ' screen. Check your connection and try again.')); };
        document.head.appendChild(el);
      });
    }
    p = p.catch(function (e) { delete moduleLoads[name]; throw e; });
    moduleLoads[name] = p;
    return p;
  };
  window.HRIS.moduleForRoute = function (route) { return ROUTE_MODULE[route] || null; };

  /* ====================================================================== */
  /*  7. Globals the view modules still read                                */
  /* ====================================================================== */
  var q = new URLSearchParams(window.location.search);
  function pick(name, fallback) { return (typeof window[name] !== 'undefined' && window[name] !== null) ? window[name] : fallback; }
  window.GOOGLE_AUTH_URL = pick('GOOGLE_AUTH_URL', '');
  window.GOOGLE_CLAIM_CODE = pick('GOOGLE_CLAIM_CODE', '') || q.get('gc') || '';
  window.GOOGLE_LOGIN_ERROR = pick('GOOGLE_LOGIN_ERROR', '') || q.get('gerr') || '';
  window.GOOGLE_LINKED = pick('GOOGLE_LINKED', '') || q.get('glink') || '';
  window.GOOGLE_LINK_ERROR = pick('GOOGLE_LINK_ERROR', '') || q.get('glerr') || '';
  window.SIGN_TOKEN = pick('SIGN_TOKEN', '') || q.get('sign') || '';
  window.LOGIN_HINT = pick('LOGIN_HINT', '');
  window.BRAND_LOGO = pick('BRAND_LOGO', 'assets/logo-full.webp');
  window.BRAND_MARK = pick('BRAND_MARK', 'assets/logo-mark.webp');
  window.APP_VERSION = pick('APP_VERSION', '3.0.0');
  window.ORG_NAME = pick('ORG_NAME', 'AVP Structural Consultants');
  /* v3.1 — installable app: ?pwa=1 marks a Google sign-in the installed app is
     waiting to collect; ?install=1 arrives from the "Get the app" button. */
  window.HRIS_PWA_HANDOFF = !GS && q.get('pwa') === '1';
  window.HRIS_PWA_INSTALL = !GS && q.get('install') === '1';
  if (!GS && (q.get('gc') || q.get('gerr') || q.get('glink') || q.get('glerr') || q.get('pwa') || q.get('install') || q.get('source'))) {
    try { history.replaceState(null, '', window.location.pathname + (window.SIGN_TOKEN ? '?sign=' + encodeURIComponent(window.SIGN_TOKEN) : '') + window.location.hash); } catch (e) {}
  }

  /* ====================================================================== */
  /*  8. Boot                                                               */
  /* ====================================================================== */
  var CFG_KEY = 'hris_appconfig_v1';
  function applyConfig(c) {
    if (!c) return;
    window.GOOGLE_AUTH_URL = c.googleAuthUrl || window.GOOGLE_AUTH_URL || '';
    window.LOGIN_HINT = c.loginHint || window.LOGIN_HINT || '';
    window.APP_VERSION = c.version || window.APP_VERSION;
    window.ORG_NAME = c.orgName || window.ORG_NAME;
    window.HRIS_INSTALLED = c.installed !== false;
  }
  function fatal(message, detail) {
    var host = document.getElementById('app'); if (!host) return;
    host.innerHTML = '<div class="boot-fatal"><img src="' + window.BRAND_LOGO + '" alt="AVP Structural Consultants" width="180"><h3>' + message + '</h3><p>' + (detail || '') + '</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>';
    window.HRIS.splashOut && window.HRIS.splashOut();
  }
  function refreshConfig(onApplied) {
    transport('app.config', {}).then(function (r) {
      if (!r || !r.ok) return;
      applyConfig(r.data);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {}
      if (onApplied) onApplied();
    }).catch(function () {});
  }

  function start() {
    if (!GS && !ENDPOINT) return fatal('Not configured yet', 'config.js still has a placeholder where the Apps Script /exec URL belongs.');

    var token = null;
    try { token = localStorage.getItem('hris_token'); } catch (e) {}

    /* HtmlService: the template already injected everything app.config returns. */
    if (GS) {
      window.HRIS_INSTALLED = typeof window.HRIS_INSTALLED === 'undefined' ? true : window.HRIS_INSTALLED;
      if (token && !window.SIGN_TOKEN) { var m0 = ROUTE_MODULE[currentRoute()] || 'ViewsHome'; window.HRIS.loadViewModule(m0).catch(function () {}); }
      window.App.boot();
      return;
    }

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
    if (cached) applyConfig(cached);
    if (token && !window.SIGN_TOKEN) { var mod = ROUTE_MODULE[currentRoute()] || 'ViewsHome'; window.HRIS.loadViewModule(mod).catch(function () {}); }
    if (token || window.SIGN_TOKEN || window.GOOGLE_CLAIM_CODE) { window.App.boot(); refreshConfig(null); return; }
    if (cached) { window.App.boot(); refreshConfig(function () { if (window.App && App.S && !App.S.user) App.renderLoginAgain && App.renderLoginAgain(); }); return; }
    transport('app.config', {}).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'The server did not answer.');
      applyConfig(r.data);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {}
      window.App.boot();
    }).catch(function (e) { fatal('Could not reach the server', e.message || String(e)); });
  }
  window.HRIS.start = start;
})();
