# AVP HRIS — web client

The AVP Structural Consultants HRIS, served as a static site.

The application used to run entirely inside Google Apps Script: the UI was
rendered by `HtmlService` and every call went through `google.script.run`. That
works, but the whole interface is delivered through a sandboxed iframe, so the
first paint waits on Google's servers and every navigation pays a round trip.

This repository is the same application with the front half moved out. The UI is
plain HTML, CSS and JavaScript on GitHub Pages — a CDN, so it loads immediately —
and Google Sheets is still the database, reached through a single JSON endpoint
that the existing Apps Script project exposes.

**Nothing here costs money.** GitHub Pages is free for public repositories, and
Apps Script's free quota covers a company of this size comfortably. No Google
Cloud billing account is involved at any point.

---

## How it fits together

```
   Browser  ──────────  GitHub Pages  (this repo — HTML/CSS/JS, no build step)
      │
      │  POST { action, payload }        Content-Type: text/plain
      │  Authorization is the bearer token in the payload
      ▼
   Apps Script web app  /exec           doPost → rpc() → route table
      │
      ▼
   Google Sheets  "HRIS Database"       one tab per table
```

The split is deliberate:

- **Reads and writes both go through Apps Script.** An HR system needs row-level
  permissions — an employee may see their own payslip and nobody else's — and a
  static page cannot enforce that. The Apps Script layer holds the session, the
  role checks and every business rule, exactly as before.
- **The frontend holds no secrets.** The `/exec` URL in `config.js` is not one:
  the deployment is anonymous by design, and every route except sign-in requires
  a session token the server issued. That is what makes a public repository safe
  here.

### Why the request body is `text/plain`

This is the single detail that makes the whole thing work, so it is worth
stating plainly. Apps Script cannot respond to an HTTP `OPTIONS` request. A
`POST` with `Content-Type: application/json` is a *non-simple* cross-origin
request, so the browser sends a CORS preflight first — and every call fails.
Sending the same JSON as `text/plain` keeps it a simple request, no preflight is
issued, Google attaches `Access-Control-Allow-Origin: *` to the reply, and the
server parses the body with `JSON.parse`. Do not "fix" the content type.

---

## Repository layout

```
index.html              app shell; loads everything below
config.js               the /exec endpoint — the only per-deployment value
404.html                GitHub Pages fallback → back to the app root
sw.js                   service worker (network-first for code, cache for assets)
manifest.webmanifest    installable as an app on phones and desktops

js/
  runtime.js            fetch transport, retry/timeout, module loader, boot config
  app.js                shell, router, RPC wrapper, shared UI primitives
  enhance.js            progress bar, command palette, theme, offline, pull-to-refresh
  icons.js              inline stroke icons
  views/*.js            one file per screen, loaded on demand

styles/
  tokens.css            colour, type, spacing, elevation, motion — light and dark
  app.css               every component class the views emit
  motion.css            entrances, transitions, reduced-motion rules

appsscript/             the two bridge files, for reference and review
  Rpc.gs                the JSON endpoint (new)
  WebApp.gs             OAuth callback + redirects (rewritten)
                        (the HR business logic stays in Apps Script — see the
                         Letters.gs note at the end of this file)

tools/
  mock-server.js        fixtures shaped like the real API, for local work
  smoke.js              headless run-through of every screen
```

`js/views/*.js` are carried over from the Apps Script build **unchanged**. They
were already written against an `App` facade rather than against Apps Script, so
the port only had to replace the transport underneath them. That is why this
migration is safe: the business screens are the same code that has been running
in production.

---

## Local development

```bash
node tools/mock-server.js          # serves the site and a fake API on :8080
# then open http://localhost:8080 and sign in with any code + any password
```

The mock intentionally implements only what each screen needs for its first
paint, so a secondary call may answer `Unknown action` — that is the fixture's
limit, not a bug.

```bash
npm install playwright             # once
node tools/smoke.js                # drives every route in a headless browser
```

The smoke test fails on any console error, page error or failed request, and
checks the command palette, dark theme and the 390px layout. Run it before every
deploy.

---

## Deploying

### 1 · Apps Script

Add `Rpc.gs`, replace `WebApp.gs`, and apply the one-line change in `Letters.gs`
from the `appsscript/` folder here. Then:

**Deploy → Manage deployments → (the existing deployment) → Edit → New version**

| Setting | Value |
| --- | --- |
| Execute as | Me |
| Who has access | Anyone |

Deploy a **new version of the existing deployment**, never a new deployment —
the `/exec` URL is registered as the OAuth redirect URI, and a new deployment
would change it and break "Sign in with Google".

Check it answers:

```bash
curl -L "https://script.google.com/macros/s/.../exec?action=app.ping"
# {"ok":true,"data":{"ok":true,"at":"..."}}
```

### 2 · This site

Put the `/exec` URL into `config.js`, commit, and enable
**Settings → Pages → Deploy from a branch → `main` / root**.

### 3 · Point the two at each other

In the Apps Script editor, run once:

```js
setWebUiUrl('https://<user>.github.io/<repo>/')
```

That is what makes emailed signing links and the Google sign-in redirect come
back to this site instead of to `/exec`.

### Rolling back

`/exec?legacy=1` still serves the previous HtmlService interface. It reads the
same database, so it is a genuine fallback, not a museum piece. Remove that
branch from `WebApp.gs` once the new client has been trusted for a few weeks.

---

## Notes for whoever maintains this next

- **Bump `HRIS_BUILD` in `config.js` and `CACHE` in `sw.js` on every release.**
  The service worker is network-first for code, so a stale shell is unlikely,
  but the version string is what guarantees it.
- **A new Apps Script *deployment* changes the `/exec` URL; a new *version* does
  not.** Always publish a new version.
- **Adding a screen** means adding a file to `js/views/`, registering it in
  `MODULE_FILE` in `runtime.js`, and adding the route to `LAZY_VIEW_ROUTES` in
  `app.js`.
- **Adding an endpoint** means adding a route to the table in `Api.gs`. Nothing
  in this repository needs to change; `App.api('your.action', {...})` will reach
  it.
- **Reduced motion is honoured throughout.** If you add an animation, make sure
  it is covered by the `prefers-reduced-motion` block in `motion.css`.

### The `Letters.gs` change

`Letters.gs` itself is not in this repository — it is HR business logic and stays
in Apps Script. The change is one line, in the `execUrl()` helper:

```js
// before
function execUrl() { try { return getWebAppUrl(); } catch (e) { return ''; } }

// after
function execUrl() { try { return webUiBase().replace(/\/$/, ''); } catch (e) { return ''; } }
```

That is what makes emailed signing links open this site instead of `/exec`.
Only `Rpc.gs` and `WebApp.gs` are published here, because they are transport and
redirect code with no business rules, no sheet IDs and no secrets in them.
