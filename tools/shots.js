'use strict';
/** Visual check: capture the Look-Through tab before and after, plus an override run. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const OUT = process.argv[3] || 'shots';

(async () => {
  const file = path.resolve(process.argv[2]);
  const tag = path.basename(process.argv[2]).replace(/\W+/g, '_');
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:'))
      ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.goto('file://' + file);
  await page.evaluate(() => window.__platform.openModule('pro'));
  const f = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await f.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await page.waitForTimeout(1200);

  await f.evaluate(() => { const b = document.getElementById('expand'); if (b) b.click(); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, tag + '_lt.png') });

  // scroll the tree fully right to show the frozen columns
  await f.evaluate(() => {
    const w = document.getElementById('lttablewrap');
    w.scrollLeft = w.scrollWidth - w.clientWidth;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, tag + '_lt_scrolled.png') });

  // bulk override, if this build has it
  const has = await f.evaluate(() => !!document.getElementById('bofile'));
  if (has) {
    await f.setInputFiles('#bofile', path.resolve('fixtures/overrides_rejected.csv'));
    await f.waitForFunction(() => window.__phase1 && window.__phase1.lastOverride,
      null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await f.evaluate(() => {
      const el = document.getElementById('bulkov');
      if (el) el.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, tag + '_override.png') });
  }
  console.log('screenshots in ' + OUT + '/ for ' + tag + (has ? ' (with override panel)' : ''));
  await browser.close();
})();
