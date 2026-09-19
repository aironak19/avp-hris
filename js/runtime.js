/* ==========================================================================
   AVP HRIS — runtime bridge
   Replaces everything Apps Script's HtmlService used to inject into the page.

   In the old build, Index.html was a server-rendered template: GOOGLE_AUTH_URL,
   BRAND_LOGO, LOGIN_HINT and friends were baked into the HTML, and every RPC
   went through google.script.run. On GitHub Pages the document is a static
   file, so this module supplies the same globals from a single anonymous
   `app.config` call and swaps the transport for fetch().

   Everything below runs before App.boot() and is deliberately dependency-free.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.HRIS_CONFIG || {};
  var ENDPOINT = String(CFG.endpoint || '').trim();

  /* ---------------------------------------------------------------- transport
     Apps Script web apps answer cross-origin requests with
     `Access-Control-Allow-Origin: *`, but only for "simple" requests. A JSON
     content-type would trigger a CORS preflight, and Apps Script never answers
     OPTIONS — so the body is sent as text/plain and parsed with JSON.parse on
     the server. This is the single most important detail of the whole port.

     /exec also 302s to googleusercontent.com; fetch follows that transparently
     as long as we never set a header that forces a preflight.
  ------------------------------------------------------------------------- */
  var TIMEOUT_MS = 60000;      // Apps Script cold starts are genuinely slow
  var RETRIES = 2;
  var RETRY_BASE_MS = 700;

  function once(action, payload, attempt) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      // text/plain keeps this a "simple request" — no preflight, no CORS error.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload }),
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
        // Almost always Google's own HTML error/consent page rather than our JSON.
        throw new Error(
          /accounts\.google\.com|Sign in|Authorization/i.test(text)
            ? 'The server rejected the request. The web app deployment needs to be set to "Anyone" access.'
            : 'The server sent an unexpected response. Please try again.');
      }
    }).catch(function (e) {
      clearTimeout(timer);
      var retriable = e.name === 'AbortError' || e.__retriable || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      if (retriable && attempt < RETRIES && navigator.onLine !== false) {
        return new Promise(function (res) { setTimeout(res, RETRY_BASE_MS * Math.pow(2, attempt)); })
          .then(function () { return once(action, payload, attempt + 1); });
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

  /* De-duplicate identical calls that are already in flight. Two widgets asking
     for the same list on the same paint should cost one round trip, not two. */
  var inflight = {};

  function transport(action, payload) {
    if (!ENDPOINT) {
      return Promise.reject(new Error('The app is not configured yet: set the Apps Script /exec URL in config.js.'));
    }
    var key = action + '|' + JSON.stringify(payload || {});
    if (inflight[key]) return inflight[key];
    var p = once(action, payload || {}, 0);
    // Only de-dup reads; a write must never be collapsed into another write.
    if (isRead(action)) {
      inflight[key] = p;
      var clear = function () { delete inflight[key]; };
      p.then(clear, clear);
    }
    return p;
  }

  var WRITE_HINT = /\.(save|create|submit|apply|decide|cancel|delete|update|issue|generate|process|lock|publish|archive|acknowledge|approve|reject|close|comment|remind|void|return|convert|move|schedule|mark|set|import|reset|link|unlink|sign|withdraw|relieve|prepare|send|refer|feedback|read|logout|login|checkin|checkout|request|complete|upload|add|skip|finalize|assign|confirm|verify)/i;
  function isRead(action) { return !WRITE_HINT.test(action); }

  window.HRIS = { transport: transport, endpoint: ENDPOINT };

  /* ------------------------------------------------------------ view modules
     Used to be fetched through an `app.viewScript` RPC and eval'd. Now they are
     ordinary files next to this one, so the browser caches them properly and a
     module load costs no server time at all.
  ------------------------------------------------------------------------- */
  var MODULE_FILE = {
    ViewsHome: 'home', ViewsAttendance: 'attendance', ViewsLeave: 'leave',
    ViewsPeople: 'people', ViewsAdmin: 'admin', ViewsPayroll: 'payroll',
    ViewsPerformance: 'performance', ViewsExit: 'exit', ViewsExpenses: 'expenses',
    ViewsAssets: 'assets', ViewsNotices: 'notices', ViewsHelpdesk: 'helpdesk',
    ViewsRecruitment: 'recruitment', ViewsLetters: 'letters'
  };

  window.HRIS.loadViewModule = function (name) {
    var file = MODULE_FILE[name];
    if (!file) return Promise.reject(new Error('Unknown module: ' + name));
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = 'js/views/' + file + '.js?v=' + encodeURIComponent(window.HRIS_BUILD || '1');
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () {
        el.remove();
        reject(new Error('Could not load the ' + file + ' module. Check your connection and try again.'));
      };
      document.head.appendChild(el);
    });
  };

  /* ---------------------------------------------------------------- globals
     The template variables App.js still reads via `typeof X !== 'undefined'`.
     Declared up front so nothing has to change inside the view modules.
  ------------------------------------------------------------------------- */
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

  /* Strip the one-time auth parameters out of the address bar as soon as they
     have been read, so a refresh or a shared link never replays them. */
  if (q.get('gc') || q.get('gerr') || q.get('glink') || q.get('glerr')) {
    try {
      var keep = window.SIGN_TOKEN ? '?sign=' + encodeURIComponent(window.SIGN_TOKEN) : '';
      history.replaceState(null, '', window.location.pathname + keep + window.location.hash);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------- boot
     One anonymous call replaces the server-rendered template. It is cached in
     localStorage so a returning visitor paints the login screen instantly and
     the fresh copy is swapped in behind it.
  ------------------------------------------------------------------------- */
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

  function start() {
    if (!ENDPOINT) {
      return fatal('Not configured yet',
        'config.js still has a placeholder where the Apps Script /exec URL belongs.');
    }

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
    if (cached) applyConfig(cached);

    var booted = false;
    function go() { if (!booted) { booted = true; window.App.boot(); } }

    // A cached config is enough to paint immediately; refresh it in the
    // background so a changed OAuth client or login hint lands next time.
    if (cached) {
      go();
      transport('app.config', {}).then(function (r) {
        if (r && r.ok) { try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {} }
      }).catch(function () {});
      return;
    }

    transport('app.config', {}).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'The server did not answer.');
      applyConfig(r.data);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(r.data)); } catch (e) {}
      go();
    }).catch(function (e) {
      fatal('Could not reach the server', e.message || String(e));
    });
  }

  window.HRIS.start = start;
})();
