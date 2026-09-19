/* ==========================================================================
   AVP HRIS — runtime bridge
   Replaces everything Apps Script's HtmlService used to inject into the page.

   In the old build, Index.html was a server-rendered template: GOOGLE_AUTH_URL,
   BRAND_LOGO, LOGIN_HINT and friends were baked into the HTML, and every RPC
   went through google.script.run. On GitHub Pages the document is a static
   file, so this module supplies the same globals and swaps the transport for
   fetch().

   ---------------------------------------------------------------- latency
   Measured against the live deployment: an Apps Script /exec round trip costs
   ~2.6 s even for a route that does nothing. That is platform overhead — the
   POST is answered with a 302 to googleusercontent.com and the browser has to
   make a second request to collect the result — and no amount of server-side
   tuning moves it. google.script.run avoided most of it by being a lighter
   same-origin channel, which is why the HtmlService build felt quicker per
   call despite rendering more slowly overall.

   So the rule for this file is: never spend a round trip you do not have to,
   and never make the user wait on one you can serve from memory.

     · app.config no longer blocks boot (it is only needed by the login screen)
     · calls made in the same tick are coalesced into one app.batch request
     · reads are cached briefly and revalidated behind the paint
     · the view module for the landing route is fetched alongside the session
     · automatic retries never apply to writes

   Everything below is dependency-free and runs before App.boot().
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.HRIS_CONFIG || {};
  var ENDPOINT = String(CFG.endpoint || '').trim();

  /* ====================================================================== */
  /*  1. HTTP                                                               */
  /* ====================================================================== */

  /* Apps Script web apps answer cross-origin requests with
     `Access-Control-Allow-Origin: *`, but only for "simple" requests. A JSON
     content-type would trigger a CORS preflight, and Apps Script never answers
     OPTIONS — so the body is sent as text/plain and parsed with JSON.parse on
     the server. This is the single most important detail of the whole port. */
  var TIMEOUT_MS = 60000;
  var RETRIES = 2;
  var RETRY_BASE_MS = 700;

  function post(body, attempt, retriable) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw httpError(r.status);
      return r.text();
    }).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(
          /accounts\.google\.com|Sign in|Authorization/i.test(text)
            ? 'The server rejected the request. The web app deployment needs to be set to "Anyone" access.'
            : 'The server sent an unexpected response. Please try again.');
      }
    }).catch(function (e) {
      clearTimeout(timer);
      /* A retry is only ever safe when nothing in this request can change data.
         Replaying a leave application or an approval because the network
         hiccuped would be far worse than showing an error. */
      var transient = e.name === 'AbortError' || e.__retriable ||
        /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
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
    var e = new Error(
      status === 401 || status === 403 ? 'The server refused the request (deployment access).' :
      status >= 500 ? 'The server had a problem. Please try again.' :
      'Request failed (' + status + ').');
    e.__retriable = status >= 500 || status === 429;
    return e;
  }

  /* ====================================================================== */
  /*  2. Reads vs writes                                                    */
  /* ====================================================================== */

  /* Only the last dot-separated segment decides. An earlier version tested the
     whole action string, so `admin.settings` matched "set" and was treated as
     a write — wrong, and it defeated caching on one of the slowest screens. */
  var WRITE_VERBS = new RegExp('^(' + [
    'save', 'create', 'submit', 'apply', 'decide', 'cancel', 'delete', 'update',
    'issue', 'generate', 'process', 'lock', 'publish', 'archive', 'acknowledge',
    'approve', 'reject', 'close', 'comment', 'remind', 'void', 'return',
    'convert', 'moveStage', 'schedule', 'adminMark', 'markPaid', 'setStatus',
    'setActive', 'setTemplateActive', 'setDeviceTrust', 'setLastWorkingDate',
    'import', 'importEmployees', 'reset', 'requestReset', 'completeReset',
    'link', 'unlinkGoogle', 'sign', 'signPdf', 'decline', 'withdraw', 'relieve',
    'prepare', 'prepareGenerate', 'send', 'sendForSignature', 'refer',
    'feedback', 'read', 'logout', 'login', 'checkin', 'checkout', 'request',
    'complete', 'upload', 'uploadDocument', 'add', 'addEmployees', 'skipManager',
    'finalize', 'assign', 'assignManager', 'assignLocation', 'confirmEmployee',
    'verifyDocument', 'resetPassword', 'changePassword', 'signOutEverywhere',
    'claimGoogleSession', 'createDraft', 'updateDraft', 'cancelSigning',
    'cancelInterview', 'saveSettings', 'setWebUi', 'suggest', 'fnf'
  ].join('|') + ')', 'i');

  function isWrite(action) {
    var last = String(action).split('.').pop();
    return WRITE_VERBS.test(last);
  }
  function isRead(action) { return !isWrite(action); }

  /* ====================================================================== */
  /*  3. Read cache                                                         */
  /* ====================================================================== */

  /* Revisiting a screen you already opened in this session should not cost
     another 2.6 s. A cached read paints immediately and is revalidated behind
     the paint; if the fresh copy differs, the current view is re-rendered.

     This can only ever make the *display* briefly stale. It can never let a
     rule be bypassed, because every action is itself a server call that is
     authorised and validated on the server with fresh data. Any write clears
     the cache outright. */
  var CACHE_TTL_MS = 90 * 1000;
  var REVALIDATE_GAP_MS = 3000;
  var readCache = Object.create(null);

  function cacheKey(action, payload) {
    var p = {};
    for (var k in payload) if (k !== 'token') p[k] = payload[k];   // token is not identity
    try { return action + '|' + JSON.stringify(p); } catch (e) { return null; }
  }

  function clearReadCache() { readCache = Object.create(null); }

  /* Re-render only when it cannot interrupt anyone: same route as when the
     stale copy was painted, no dialog open, and nothing focused inside the
     view (which would mean the person is typing). */
  function safeToRerender(route) {
    if (!window.App || !App.S || !App.S.user) return false;
    if ((location.hash || '').split('?')[0].replace('#/', '') !== route) return false;
    if (document.querySelector('.backdrop, .cmdk-backdrop')) return false;
    var host = document.getElementById('view');
    var active = document.activeElement;
    if (host && active && host.contains(active) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '')) return false;
    return true;
  }

  var rerenderQueued = false;
  function scheduleRerender(route) {
    if (rerenderQueued) return;
    rerenderQueued = true;
    var run = function () {
      rerenderQueued = false;
      if (safeToRerender(route)) App.render();
    };
    // rAF in a visible tab, microtask in a hidden one — never a throttled timer.
    if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(run);
    else Promise.resolve().then(run);
  }

  function currentRoute() {
    return (location.hash || '').split('?')[0].replace('#/', '') || 'home';
  }

  /* ====================================================================== */
  /*  4. Batching                                                           */
  /* ====================================================================== */

  /* Views fire their independent calls together with Promise.all. Over
     google.script.run that was nearly free; over HTTP each one is a separate
     2.6 s round trip and Apps Script partly serialises them anyway (measured:
     three concurrent no-ops took 3.8 s). Coalescing everything issued in the
     same tick into one app.batch request turns a three-call screen into a
     single round trip. Views did not have to change for this. */
  var BATCH_MAX = 15;
  var batchSupported = true;

  var pending = [];        // { action, payload, resolve, reject }
  var flushScheduled = false;
  var inflight = Object.create(null);   // de-dup identical concurrent reads

  /* Flushing on a microtask, not a timer.
     A setTimeout here would be correct in theory and awful in practice: Chrome
     throttles timers in a hidden tab to roughly once a second, and after the
     tab has been hidden for five minutes it drops to once a *minute*. Batching
     on a timer therefore made the app look frozen for up to a minute when
     someone came back to a tab they had left open — which is most of the day
     for an HR tool. A microtask runs at the end of the current task, is never
     throttled, and still catches everything a Promise.all fires synchronously,
     which is the case worth batching. */
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    Promise.resolve().then(flush);
  }

  function enqueue(action, payload) {
    return new Promise(function (resolve, reject) {
      pending.push({ action: action, payload: payload, resolve: resolve, reject: reject });
      scheduleFlush();
    });
  }

  function flush() {
    flushScheduled = false;
    var group = pending.splice(0, BATCH_MAX);
    if (pending.length) scheduleFlush();
    if (!group.length) return;

    if (group.length === 1 || !batchSupported) {
      group.forEach(sendSingle);
      return;
    }
    sendBatch(group);
  }

  function sendSingle(item) {
    post({ action: item.action, payload: item.payload }, 0, isRead(item.action))
      .then(item.resolve, item.reject);
  }

  function sendBatch(group) {
    var calls = group.map(function (g) { return { action: g.action, payload: g.payload }; });
    var allReads = group.every(function (g) { return isRead(g.action); });

    post({ action: 'app.batch', payload: { calls: calls } }, 0, allReads)
      .then(function (res) {
        /* The only safe fallback is one the server never started: an
           "unknown action" means this deployment predates app.batch, so
           nothing ran and re-sending individually cannot duplicate a write. */
        if (res && res.ok === false && /unknown action/i.test(res.error || '')) {
          batchSupported = false;
          group.forEach(sendSingle);
          return;
        }
        if (!res || !res.ok || !Array.isArray(res.data) || res.data.length !== group.length) {
          throw new Error((res && res.error) || 'The server sent an unexpected batch response.');
        }
        res.data.forEach(function (r, i) { group[i].resolve(r); });
      })
      .catch(function (err) {
        // A transport failure: every call in the group fails. Never re-send.
        group.forEach(function (g) { g.reject(err); });
      });
  }

  /* ====================================================================== */
  /*  5. The transport the app sees                                         */
  /* ====================================================================== */

  function transport(action, payload) {
    if (!ENDPOINT) {
      return Promise.reject(new Error('The app is not configured yet: set the Apps Script /exec URL in config.js.'));
    }
    payload = payload || {};

    if (isWrite(action)) {
      clearReadCache();                       // anything cached may now be wrong
      return enqueue(action, payload);
    }

    var key = cacheKey(action, payload);
    if (!key) return enqueue(action, payload);

    var hit = readCache[key];
    var now = Date.now();

    if (hit && hit.res && (now - hit.at) < CACHE_TTL_MS) {
      // Paint from cache now; refresh behind it unless we just did.
      if (!hit.revalidating && (now - (hit.checkedAt || hit.at)) > REVALIDATE_GAP_MS) {
        hit.revalidating = true;
        var route = currentRoute();
        var before = hit.serialised;
        enqueue(action, payload).then(function (fresh) {
          hit.revalidating = false;
          hit.checkedAt = Date.now();
          if (!fresh || fresh.ok !== true) return;
          var s = safeSerialise(fresh);
          hit.res = fresh; hit.at = Date.now(); hit.serialised = s;
          if (s !== before) scheduleRerender(route);
        }, function () { hit.revalidating = false; hit.checkedAt = Date.now(); });
      }
      return Promise.resolve(hit.res);
    }

    if (inflight[key]) return inflight[key];

    var p = enqueue(action, payload).then(function (res) {
      delete inflight[key];
      if (res && res.ok === true) {
        readCache[key] = { res: res, at: Date.now(), checkedAt: Date.now(), serialised: safeSerialise(res) };
      }
      return res;
    }, function (e) { delete inflight[key]; throw e; });

    inflight[key] = p;
    return p;
  }

  function safeSerialise(v) {
    try { return JSON.stringify(v); } catch (e) { return null; }
  }

  window.HRIS = {
    transport: transport,
    endpoint: ENDPOINT,
    clearReadCache: clearReadCache,
    isWrite: isWrite
  };

  /* ====================================================================== */
  /*  6. View modules                                                       */
  /* ====================================================================== */

  var MODULE_FILE = {
    ViewsHome: 'home', ViewsAttendance: 'attendance', ViewsLeave: 'leave',
    ViewsPeople: 'people', ViewsAdmin: 'admin', ViewsPayroll: 'payroll',
    ViewsPerformance: 'performance', ViewsExit: 'exit', ViewsExpenses: 'expenses',
    ViewsAssets: 'assets', ViewsNotices: 'notices', ViewsHelpdesk: 'helpdesk',
    ViewsRecruitment: 'recruitment', ViewsLetters: 'letters'
  };

  /* Kept here as well as in app.js so the landing route's module can start
     downloading before the app has even booted. */
  var ROUTE_MODULE = {
    home: 'ViewsHome', me: 'ViewsHome',
    attendance: 'ViewsAttendance', leave: 'ViewsLeave',
    people: 'ViewsPeople', approvals: 'ViewsPeople', reports: 'ViewsPeople',
    payslips: 'ViewsPayroll', performance: 'ViewsPerformance', exit: 'ViewsExit',
    expenses: 'ViewsExpenses', notices: 'ViewsNotices', helpdesk: 'ViewsHelpdesk',
    openings: 'ViewsRecruitment', signatures: 'ViewsLetters', sign: 'ViewsLetters'
  };

  var moduleLoads = Object.create(null);

  window.HRIS.loadViewModule = function (name) {
    if (moduleLoads[name]) return moduleLoads[name];
    var file = MODULE_FILE[name];
    if (!file) return Promise.reject(new Error('Unknown module: ' + name));

    var p = new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = 'js/views/' + file + '.js?v=' + encodeURIComponent(window.HRIS_BUILD || '1');
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () {
        el.remove();
        delete moduleLoads[name];
        reject(new Error('Could not load the ' + file + ' screen. Check your connection and try again.'));
      };
      document.head.appendChild(el);
    });
    moduleLoads[name] = p;
    return p;
  };

  /* ====================================================================== */
  /*  7. Globals the view modules still read                                */
  /* ====================================================================== */

  var q = new URLSearchParams(window.location.search);

  window.GOOGLE_AUTH_URL = '';
  window.GOOGLE_CLAIM_CODE = q.get('gc') || '';
  window.GOOGLE_LOGIN_ERROR = q.get('gerr') || '';
  window.GOOGLE_LINKED = q.get('glink') || '';
  window.GOOGLE_LINK_ERROR = q.get('glerr') || '';
  window.SIGN_TOKEN = q.get('sign') || '';
  window.LOGIN_HINT = '';
  window.BRAND_LOGO = 'assets/logo-full.webp';
  window.BRAND_MARK = 'assets/logo-mark.webp';
  window.APP_VERSION = '1.6.0';
  window.ORG_NAME = 'AVP Structural Consultants';

  if (q.get('gc') || q.get('gerr') || q.get('glink') || q.get('glerr')) {
    try {
      var keep = window.SIGN_TOKEN ? '?sign=' + encodeURIComponent(window.SIGN_TOKEN) : '';
      history.replaceState(null, '', window.location.pathname + keep + window.location.hash);
    } catch (e) {}
  }

  /* ====================================================================== */
  /*  8. Boot                                                               */
  /* ====================================================================== */

  var CFG_KEY = 'hris_appconfig_v1';

  function applyConfig(c) {
    if (!c) return;
    window.GOOGLE_AUTH_URL = c.googleAuthUrl || '';
    window.LOGIN_HINT = c.loginHint || '';
    window.APP_VERSION = c.version || window.APP_VERSION;
    window.ORG_NAME = c.orgName || window.ORG_NAME;
    window.HRIS_INSTALLED = c.installed !== false;
  }

  function fatal(message, detail) {
    var host = document.getElementById('app');
    if (!host) return;
    host.innerHTML =
      '<div class="boot-fatal">' +
      '  <img src="assets/logo-full.webp" alt="AVP Structural Consultants" width="180">' +
      '  <h3>' + message + '</h3>' +
      '  <p>' + (detail || '') + '</p>' +
      '  <button class="btn btn-primary" onclick="location.reload()">Try again</button>' +
      '</div>';
  }

  function refreshConfig(onApplied) {
    transport('app.config', {}).then(function (r) {
      if (!r || !r.ok) return;
      applyConfig(r.data);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {}
      if (onApplied) onApplied();
    }).catch(function () { /* the login screen still works without it */ });
  }

  function start() {
    if (!ENDPOINT) {
      return fatal('Not configured yet',
        'config.js still has a placeholder where the Apps Script /exec URL belongs.');
    }

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
    if (cached) applyConfig(cached);

    var token = null;
    try { token = localStorage.getItem('hris_token'); } catch (e) {}

    /* The landing route's module and the session call should be in flight at
       the same time, not one after the other. */
    if (token && !window.SIGN_TOKEN) {
      var mod = ROUTE_MODULE[currentRoute()] || 'ViewsHome';
      window.HRIS.loadViewModule(mod).catch(function () {});
    }

    /* app.config is only needed to draw the login screen. Making every signed-in
       load wait for it cost a whole round trip for nothing. */
    if (token || window.SIGN_TOKEN || window.GOOGLE_CLAIM_CODE) {
      window.App.boot();
      refreshConfig(null);
      return;
    }

    if (cached) {
      window.App.boot();                       // paint the login screen now
      refreshConfig(function () {
        // A changed OAuth client or hint should show without a reload.
        if (window.App && App.S && !App.S.user) App.renderLoginAgain && App.renderLoginAgain();
      });
      return;
    }

    // First ever visit, signed out: there is nothing cached to draw, so this
    // one call does have to be waited on.
    transport('app.config', {}).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'The server did not answer.');
      applyConfig(r.data);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {}
      window.App.boot();
    }).catch(function (e) {
      fatal('Could not reach the server', e.message || String(e));
    });
  }

  window.HRIS.start = start;
})();
