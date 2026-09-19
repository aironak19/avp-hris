/**
 * ============================================================================
 *  AVP HRIS — Rpc.gs   (v2.0.0 — static-frontend bridge)
 *
 *  The UI now lives on GitHub Pages instead of HtmlService, so the browser can
 *  no longer call rpc() through google.script.run. This file is the whole
 *  replacement: one JSON endpoint in front of the existing dispatcher.
 *
 *  Nothing in Api.gs / Auth.gs / the module files changed. The route table,
 *  the bearer-token guard, the role checks and every business rule are exactly
 *  as they were — this only swaps the transport.
 *
 *  ---------------------------------------------------------------- CORS note
 *  The client posts with Content-Type: text/plain on purpose. An
 *  application/json body would make the request "non-simple", the browser
 *  would fire a CORS preflight, and Apps Script has no way to answer OPTIONS —
 *  every call would fail. text/plain keeps it a simple request, Google adds
 *  `Access-Control-Allow-Origin: *` to the response, and the body is parsed
 *  here instead. Do not "fix" the content type.
 *
 *  --------------------------------------------------------------- deployment
 *  Deploy → Manage deployments → Web app
 *      Execute as:      Me  (the owner of the HRIS spreadsheet)
 *      Who has access:  Anyone
 *  "Anyone" exposes this URL, not the data: every route except the handful
 *  marked `anon` still requires a valid session token.
 * ============================================================================
 */

/** Script property holding the public URL of the static frontend. */
var PROP_WEB_UI_URL = 'HRIS_WEB_UI_URL';

/**
 * Where the human-facing app lives. Every link we email or redirect to has to
 * point here rather than at /exec. Falls back to the script's own URL so a
 * half-configured deployment still works.
 */
function webUiBase() {
  var url = '';
  try { url = PropertiesService.getScriptProperties().getProperty(PROP_WEB_UI_URL) || ''; } catch (e) {}
  url = String(url).trim();
  if (!url) { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
  return url.replace(/[?#].*$/, '').replace(/\/+$/, '') + '/';
}

/** One-time setup helper — run this from the editor after deploying Pages. */
function setWebUiUrl(url) {
  var v = String(url || '').trim();
  if (!/^https:\/\//.test(v)) throw new Error('Pass the full https:// URL of the GitHub Pages site.');
  PropertiesService.getScriptProperties().setProperty(PROP_WEB_UI_URL, v);
  return webUiBase();
}

/* -------------------------------------------------------------------------- */
/*  Extra anonymous routes the static client needs before anyone is signed in  */
/* -------------------------------------------------------------------------- */

/**
 * Replaces the server-rendered template variables that Index.html used to
 * inject. Anonymous by necessity — it is what the login screen is built from —
 * so it must never return anything that is not already public to a visitor who
 * can open the sign-in page.
 */
function appConfig() {
  var installed = false;
  try { installed = Repo.isInstalled(); } catch (e) { installed = false; }

  return {
    installed: installed,
    version: APP.VERSION,
    appName: APP.NAME,
    orgName: APP.ORG,
    googleAuthUrl: installed ? Auth.googleAuthUrlCached() : '',
    loginHint: installed ? loginHintCached() : '',
    serverTime: (function () { try { return Util.stamp(); } catch (e) { return ''; } })()
  };
}

/** Adds the transport-only routes to the existing table, once. */
function ensureBridgeRoutes_() {
  var routes = Api.routes();
  if (!routes['app.config']) {
    routes['app.config'] = { anon: true, fn: function () { return appConfig(); } };
  }
  if (!routes['app.ping']) {
    routes['app.ping'] = { anon: true, fn: function () { return { ok: true, at: new Date().toISOString() }; } };
  }
  return routes;
}

/* -------------------------------------------------------------------------- */
/*  The endpoint                                                              */
/* -------------------------------------------------------------------------- */

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST { action, payload } -> { ok, data } | { ok:false, error, code }
 *
 * rpc() already wraps its own failures, so a 200 with ok:false is the normal
 * way an error comes back; the client distinguishes them by `code`. Anything
 * thrown before rpc() gets the same envelope here so the client only ever has
 * one shape to parse.
 */
function doPost(e) {
  var action = '';
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    var body = raw ? JSON.parse(raw) : {};
    action = String(body.action || '');
    if (!action) return jsonOut_({ ok: false, error: 'No action given.', code: 'BAD_REQUEST' });

    ensureBridgeRoutes_();
    return jsonOut_(rpc(action, body.payload || {}));
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    console.error('doPost(' + action + ') failed: ' + msg + (err && err.stack ? '\n' + err.stack : ''));
    return jsonOut_({ ok: false, error: msg, code: 'ERROR' });
  }
}

/**
 * A GET form of the same thing, for health checks and for debugging from a
 * plain browser tab. Restricted to anonymous routes on purpose: a token in a
 * query string ends up in logs and history, and this endpoint must never be
 * the reason that happens.
 */
function rpcGet_(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || 'app.ping');
  ensureBridgeRoutes_();
  var route = Api.routes()[action];
  if (!route || !route.anon) {
    return jsonOut_({ ok: false, error: 'This action requires a POST with a session token.', code: 'POST_REQUIRED' });
  }
  return jsonOut_(rpc(action, {}));
}
