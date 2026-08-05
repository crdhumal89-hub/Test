'use strict';
/**
 * Shared browser harness for the Phase 1 tests.
 *
 * Always loads the built single file over file:// with every external request
 * blocked, which is exactly how a controller opens it.
 */
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FILE = path.resolve(process.env.TRACE_FILE || 'dist/TRACE_Platform.html');

async function openApp(opts) {
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce'
  });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') ||
            u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });

  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto('file://' + FILE, { waitUntil: 'load' });
  await page.evaluate(() => window.__platform.openModule('pro'));
  const frame = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await frame.waitForSelector('.tabbar .tab', { timeout: 30000 });
  await frame.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await frame.waitForFunction(() => window.__phase1 && window.__phase1.ready === true,
    null, { timeout: 30000 });

  return {
    browser, page, frame, consoleErrors,
    async tab(name) {
      await frame.evaluate(t => {
        const b = document.querySelector('.tab[data-tab="' + t + '"]');
        if (b) b.click();
      }, name);
      await page.waitForTimeout(500);
    },
    async expandAll() {
      await frame.evaluate(() => {
        const b = document.getElementById('expand');
        if (b) b.click();
      });
      await page.waitForTimeout(600);
    },
    async close() { await browser.close(); }
  };
}

/** Fail a test if the app logged anything to console.error while it ran. */
function assertNoConsoleErrors(app, assert) {
  assert.deepStrictEqual(app.consoleErrors, [],
    'app logged console errors: ' + JSON.stringify(app.consoleErrors));
}

module.exports = { openApp, assertNoConsoleErrors, FILE };
