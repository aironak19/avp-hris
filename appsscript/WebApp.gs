/**
 * ============================================================================
 *  AVP HRIS — WebApp.gs   (v2.0.0)
 *
 *  The SPA is no longer served from here. It is a static site on GitHub Pages
 *  and it talks to doPost() in Rpc.gs. What is left in this file is the small
 *  set of things that must still happen on a google.com origin:
 *
 *    • ?code=&state=  the Google OAuth callback. The redirect_uri registered
 *                     with the OAuth client is this /exec URL, so the code has
 *                     to land here; we resolve it and bounce the browser to
 *                     the frontend carrying only a short-lived claim code.
 *    • ?sign=<token>  signing links already sitting in people's inboxes —
 *                     forwarded to the frontend so old emails keep working.
 *    • ?action=...    anonymous health check (see rpcGet_ in Rpc.gs).
 *    • ?legacy=1      the previous HtmlService UI, kept as a fallback during
 *                     the migration. Delete this branch once Pages is trusted.
 *    • anything else  sent to the frontend.
 * ============================================================================
 */

function doGet(e) {
  var p = (e && e.parameter) || {};

  /* ---- health / anonymous RPC over GET --------------------------------- */
  if (p.action) return rpcGet_(e);

  /* ---- Google OAuth callback ------------------------------------------- */
  if (p.code) {
    // googleCallback() returns "<execUrl>?gc=…" (or ?gerr= / ?glink= / ?glerr=).
    // Only the query matters; the base has to become the frontend.
    var next = String(Auth.googleCallback(p.code, p.state || ''));
    var query = next.indexOf('?') === -1 ? '' : next.slice(next.indexOf('?'));
    var linking = /^link:/.test(String(p.state || ''));
    return bounce_(webUiBase() + query, linking ? 'Google account linked.' : 'Signing you in…');
  }

  /* ---- legacy signing links -------------------------------------------- */
  if (p.sign) {
    return bounce_(webUiBase() + '?sign=' + encodeURIComponent(p.sign), 'Opening your document…');
  }

  /* ---- the old HtmlService UI, on request ------------------------------ */
  if (p.legacy) return legacyApp_(p);

  /* ---- everything else ------------------------------------------------- */
  return bounce_(webUiBase(), 'Opening AVP HRIS…');
}

/**
 * Sends the browser to `url`.
 *
 * This page runs inside Apps Script's sandboxed content iframe, whose sandbox
 * carries allow-top-navigation-by-user-activation: a script may only navigate
 * window.top when the navigation follows a real user click. Landing here is the
 * result of Google's redirect, not a click, so the automatic replace() is
 * usually blocked. We attempt it anyway (harmless when it is allowed) and
 * always render a real link, because a genuine click on that link satisfies the
 * sandbox and is the path that reliably works.
 */
function bounce_(url, message) {
  var safe = String(url)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return HtmlService.createHtmlOutput(
    '<div style="min-height:100vh;display:grid;place-items:center;font:14px Archivo,Arial,sans-serif;text-align:center;color:#555;background:#f3f2f2">' +
    '<div style="background:#fff;padding:36px 32px;border:1px solid #e3e1e1;max-width:360px">' +
    '<img src="' + BRAND.LOGO_FULL + '" alt="AVP" style="width:220px;display:block;margin:0 auto 18px">' +
    '<div style="margin-bottom:16px;font-size:15px;color:#201e1d">' + message + '</div>' +
    '<a href="' + safe + '" target="_top" style="display:inline-block;padding:11px 24px;' +
    'background:#ec3013;color:#fff;border-radius:4px;text-decoration:none;font-weight:700">Continue</a>' +
    '</div></div>' +
    '<script>try { window.top.location.replace(' + JSON.stringify(url) + '); } catch (e) {}</script>')
    .setTitle(APP.NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The pre-2.0 HtmlService application, reachable at ?legacy=1.
 * Kept deliberately for the first weeks after the cutover so there is always a
 * working way in if something about the static host misbehaves.
 */
function legacyApp_(p) {
  var installed = Repo.isInstalled();
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP.NAME;
  t.orgName = APP.ORG;
  t.version = APP.VERSION;
  t.installed = installed;
  t.googleAuthUrl = installed ? Auth.googleAuthUrlCached() : '';
  t.googleClaimCode = p.gc || '';
  t.googleError = p.gerr || '';
  t.googleLinked = p.glink || '';
  t.googleLinkError = p.glerr || '';
  t.signToken = p.sign || '';
  t.loginHint = installed ? loginHintCached() : '';
  t.brandLogo = BRAND.LOGO_FULL;
  t.brandMark = BRAND.LOGO_MARK;

  return t.evaluate()
    .setTitle(APP.NAME + ' · ' + APP.ORG)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/favicon.ico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Login-page hint text, cached so the login page never opens the database. */
function loginHintCached() {
  var KEY = 'login_hint_v1';
  try {
    var hit = CacheService.getScriptCache().get(KEY);
    if (hit !== null) return hit;
  } catch (e) {}
  var hint = '';
  try { hint = String(Repo.setting('auth.loginHint', '') || ''); } catch (e) { hint = ''; }
  try { CacheService.getScriptCache().put(KEY, hint, 1800); } catch (e) {}
  return hint;
}

/** Server-side include used by the legacy templates. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * The script's own /exec URL.
 *
 * Still the OAuth redirect_uri (it is what is registered with the Google
 * client), so this must keep returning the Apps Script URL. Links meant for a
 * person go to webUiBase() instead — see Rpc.gs.
 */
function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}
