'use strict';
/**
 * playwright_gate.js - drives the built file the way a controller would and fails on
 * anything the browser complains about.
 *
 *   node playwright_gate.js dist/TRACE_Platform.html
 *
 * Exits 0 only when, across the launcher, the TRACE module and all seven TRACE-Pro tabs:
 *   - zero console errors and zero console warnings of type "error"
 *   - zero uncaught page errors
 *   - zero failed requests
 *   - zero network requests of any kind (the file must be fully self-contained; it is
 *     meant to be opened by double-clicking with no connectivity at all)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const TABS = ['lt', 'rfx', 'str', 'sim', 'own', 'iss', 'gls'];

(async () => {
  const file = process.argv[2] || 'dist/TRACE_Platform.html';
  if (!fs.existsSync(file)) {
    console.error('playwright_gate: no such file: ' + file);
    process.exit(2);
  }

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const networkRequests = [];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC'
  });

  // Record every request that is not the local file itself. Nothing should appear here.
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:') ||
        u.startsWith('blob:')) return route.continue();
    networkRequests.push(u);
    return route.abort();
  });

  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', e => pageErrors.push(e && e.stack ? e.stack.split('\n')[0] : String(e)));
  page.on('requestfailed', r => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('about:') && !u.startsWith('data:')) {
      failedRequests.push(u + ' (' + (r.failure() && r.failure().errorText) + ')');
    }
  });

  console.log('playwright_gate: ' + file);
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });

  /* --- launcher ------------------------------------------------------ */
  await page.waitForSelector('#landing .card[data-mod]');
  console.log('  launcher rendered');

  /* --- TRACE module -------------------------------------------------- */
  await page.evaluate(() => window.__platform.openModule('trace'));
  const traceFrame = await (await page.waitForSelector('#frame-trace')).contentFrame();
  await traceFrame.waitForSelector('body');
  await page.waitForTimeout(2000);
  console.log('  TRACE module opened');

  /* --- TRACE-Pro ----------------------------------------------------- */
  await page.evaluate(() => window.__platform.openModule('pro'));
  const pro = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await pro.waitForSelector('.tabbar .tab');
  await pro.waitForSelector('#tree tbody tr');
  await page.waitForTimeout(1500);

  for (const tab of TABS) {
    await pro.evaluate(t => {
      const b = document.querySelector('.tab[data-tab="' + t + '"]');
      if (b) b.click();
    }, tab);
    await page.waitForTimeout(700);
    const ok = await pro.evaluate(t => {
      const pane = document.getElementById('tab-' + t);
      return !!pane && !pane.classList.contains('hidden');
    }, tab);
    console.log('  tab ' + tab.padEnd(4) + (ok ? 'ok' : 'NOT VISIBLE'));
    if (!ok) consoleErrors.push('tab ' + tab + ' did not become visible');
  }

  /* --- exercise the Look-Through interactions ------------------------ */
  await pro.evaluate(() => {
    const b = document.querySelector('.tab[data-tab="lt"]');
    if (b) b.click();
    const ex = document.getElementById('expand');
    if (ex) ex.click();
  });
  await page.waitForTimeout(1200);
  await pro.evaluate(() => {
    const co = document.getElementById('collapse');
    if (co) co.click();
  });
  await page.waitForTimeout(600);

  // open and close the detail drawer
  await pro.evaluate(() => {
    const r = document.querySelector('#tree tbody tr.rowv');
    if (r) r.click();
  });
  await page.waitForTimeout(500);
  await pro.evaluate(() => {
    const x = document.querySelector('[data-close="lt"]');
    if (x) x.click();
  });
  await page.waitForTimeout(400);
  console.log('  look-through interactions ok');

  await browser.close();

  /* --- verdict ------------------------------------------------------- */
  const problems = [];
  if (consoleErrors.length) problems.push(['console errors', consoleErrors]);
  if (pageErrors.length) problems.push(['uncaught page errors', pageErrors]);
  if (failedRequests.length) problems.push(['failed requests', failedRequests]);
  if (networkRequests.length) problems.push(['network requests (must be zero)', [...new Set(networkRequests)]]);

  console.log('');
  console.log('  console errors:  ' + consoleErrors.length);
  console.log('  page errors:     ' + pageErrors.length);
  console.log('  failed requests: ' + failedRequests.length);
  console.log('  network requests:' + networkRequests.length);

  if (!problems.length) {
    console.log('');
    console.log('PLAYWRIGHT GATE PASS');
    process.exit(0);
  }

  console.error('');
  console.error('PLAYWRIGHT GATE FAIL');
  for (const [label, items] of problems) {
    console.error('  ' + label + ':');
    items.slice(0, 20).forEach(i => console.error('    - ' + String(i).slice(0, 260)));
    if (items.length > 20) console.error('    ... and ' + (items.length - 20) + ' more');
  }
  process.exit(1);
})().catch(e => { console.error(e); process.exit(2); });
