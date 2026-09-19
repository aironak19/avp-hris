/* ==========================================================================
   AVP HRIS — smoke test
   --------------------------------------------------------------------------
   Drives the real frontend against tools/mock-server.js in a headless browser
   and fails on any console error, page error or failed request. It is not a
   substitute for testing against live data, but it catches the whole class of
   problems the port could introduce: a module that does not load, a helper
   that moved, a view that throws on first render.

       node tools/mock-server.js &
       node tools/smoke.js
   ========================================================================== */
'use strict';

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8080';
const ROUTES = [
  'home', 'attendance', 'leave', 'people', 'approvals',
  'expenses', 'notices', 'helpdesk', 'payslips', 'performance',
  'exit', 'openings', 'me', 'admin'
];

/* Failures the mock is expected to produce: it only implements the routes the
   first paint of each screen needs, so a secondary fetch returning "Unknown
   action" is the fixture's limitation, not the app's. */
const EXPECTED = [
  /Unknown action:/i,
  // The CI sandbox has no route to Google Fonts; the app falls back to the
  // system stack, which is exactly the designed behaviour.
  /fonts\.(googleapis|gstatic)\.com/i,
  /ERR_TUNNEL_CONNECTION_FAILED/i
];

function expected(text) { return EXPECTED.some((re) => re.test(text)); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const note = (kind, text) => { if (!expected(text)) errors.push(`[${kind}] ${text}`); };

  page.on('console', (m) => { if (m.type() === 'error') note('console', m.text()); });
  page.on('pageerror', (e) => note('pageerror', e.message));
  page.on('requestfailed', (r) => note('request', `${r.url()} — ${r.failure()?.errorText}`));

  // Point the app at the mock without editing the committed config.js.
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.HRIS_CONFIG={endpoint:'${BASE}/exec'};window.HRIS_BUILD='test';`
    }));

  const step = (msg) => console.log('  ' + msg);

  console.log('\n▸ boot');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#loginForm', { timeout: 15000 });
  step('login screen rendered');

  await page.screenshot({ path: 'tools/shot-login.png' });

  console.log('\n▸ sign in');
  await page.fill('input[name="identifier"]', 'AVP001');
  await page.fill('input[name="password"]', 'secret123');
  await page.click('#loginBtn');
  await page.waitForSelector('.layout', { timeout: 20000 });
  await page.waitForFunction(() => {
    const v = document.getElementById('view');
    return v && !v.querySelector('.skeleton') && v.textContent.trim().length > 40;
  }, { timeout: 20000 });
  step('signed in, shell + home rendered');

  console.log('\n▸ routes');
  for (const r of ROUTES) {
    await page.evaluate((route) => { window.location.hash = '#/' + route; }, r);
    try {
      await page.waitForFunction(() => {
        const v = document.getElementById('view');
        return v && !v.querySelector('.skeleton');
      }, { timeout: 20000 });
      await page.waitForTimeout(250);
      const broke = await page.evaluate(() =>
        /Something went wrong/i.test(document.getElementById('view')?.textContent || ''));
      step(`${r.padEnd(12)} ${broke ? '✗ render error panel' : '✓'}`);
      if (broke) errors.push(`[view] ${r} rendered the error panel`);
    } catch (e) {
      step(`${r.padEnd(12)} ✗ timed out`);
      errors.push(`[view] ${r} never finished rendering`);
    }
  }

  console.log('\n▸ interactions');
  await page.evaluate(() => { window.location.hash = '#/home'; });
  await page.waitForTimeout(500);

  await page.keyboard.press('Control+k');
  await page.waitForSelector('.cmdk', { timeout: 4000 });
  await page.fill('.cmdk input', 'leave');
  await page.waitForTimeout(150);
  const hits = await page.locator('.cmdk-item').count();
  step(`command palette: ${hits} result(s) for "leave"`);
  if (!hits) errors.push('[cmdk] no results for a query that must match');
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.HRIS.theme.apply('dark'));
  await page.waitForTimeout(250);
  const dark = await page.getAttribute('html', 'data-theme');
  step(`dark theme: ${dark}`);
  if (dark !== 'dark') errors.push('[theme] dark theme did not apply');
  await page.screenshot({ path: 'tools/shot-dark.png', fullPage: false });

  await page.evaluate(() => window.HRIS.theme.apply('light'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tools/shot-light.png', fullPage: false });

  console.log('\n▸ mobile');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobnav = await page.locator('.mobnav').isVisible();
  step(`bottom tab bar visible: ${mobnav}`);
  if (!mobnav) errors.push('[mobile] bottom navigation did not appear at 390px');
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step(`horizontal overflow: ${hScroll ? 'YES' : 'no'}`);
  if (hScroll) errors.push('[mobile] the page scrolls horizontally at 390px');
  await page.screenshot({ path: 'tools/shot-mobile.png' });

  await browser.close();

  console.log('\n' + '─'.repeat(60));
  if (errors.length) {
    console.log(`✗ ${errors.length} problem(s):\n`);
    [...new Set(errors)].forEach((e) => console.log('  ' + e));
    process.exit(1);
  }
  console.log('✓ smoke test passed');
})().catch((e) => { console.error('\n✗ smoke test crashed:', e.message); process.exit(1); });
