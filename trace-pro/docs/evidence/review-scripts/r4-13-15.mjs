import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4178/';
const OUT = '/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/exports';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// ============ 1. OFFLINE: all four exports + both drawers + all lenses
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const blocked = [];
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u);
    return route.abort();
  });
  const grab = async (label, tag) => {
    const wait = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    const d = await wait;
    if (!d) return { label: tag, ok: false };
    const p = `${OUT}/${d.suggestedFilename()}`;
    await d.saveAs(p);
    return { label: tag, ok: true, file: p, bytes: fs.statSync(p).size };
  };
  await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const offRes = [];
  offRes.push(await grab('export csv', 'recon csv (offline)'));
  offRes.push(await grab('download excel', 'lookthrough xlsx (offline)'));
  await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  offRes.push(await grab('export pricing', 'send-to-pricing csv (offline)'));
  offRes.push(await grab('download excel', 'pricing xlsx (offline)'));
  // sources drawer offline
  await page.click('#open-sources');
  await page.waitForTimeout(500);
  const sourcesOk = await page.locator('#drawer-host .drawer').isVisible();
  await page.keyboard.press('Escape');
  console.log('OFFLINE exports:', JSON.stringify(offRes));
  console.log('OFFLINE sources drawer visible:', sourcesOk, 'blocked:', blocked, 'problems:', problems);
  await ctx.close();
}

// ============ 2. EXPORT CONTENT vs SCREEN, in BOTH bases
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const grab = async (label, tag) => {
    const wait = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    const d = await wait;
    const p = `${OUT}/${tag}-${d.suggestedFilename()}`;
    await d.saveAs(p);
    return p;
  };
  const results = {};
  for (const view of ['before', 'after']) {
    await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    if (view === 'after') {
      await page.click('#view-toggle button[data-view="after"]');
      await page.waitForTimeout(900);
    }
    const screen = await page.evaluate(() => {
      const g = (k) => document.querySelector(`[data-parity="${k}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      const pre = 'reconciliation.' + (document.querySelector('[data-parity="reconciliation.after.start_label"]') ? 'after' : 'waterfall') + '.';
      return {
        prefix: pre,
        start: g(pre + 'start_usd') ?? g(pre + 'derived_mv'),
        nav: g(pre + 'nav'),
        dPricing: g(pre + 'delta_pricing_usd'),
        dNonPos: g(pre + 'delta_nonposition_usd'),
        revised: g(pre + 'revised_mv'),
        allKeys: Array.from(document.querySelectorAll('[data-parity]')).map((e) => e.getAttribute('data-parity')).filter((k) => k.startsWith('reconciliation.')).slice(0, 40),
      };
    });
    results['recon-' + view] = { screen, csv: await grab('export csv', 'recon-' + view), xlsx: await grab('download excel', 'lt-' + view) };

    await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    if (view === 'after') {
      await page.click('#view-toggle button[data-view="after"]');
      await page.waitForTimeout(900);
    }
    const pscreen = await page.evaluate(() => {
      const g = (k) => document.querySelector(`[data-parity="${k}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      const rows = Array.from(document.querySelectorAll('#pricing-price-table tbody tr')).slice(0, 4).map((tr) =>
        Array.from(tr.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim())
      );
      return {
        nav: g('pricing.score.nav'),
        derived: g('pricing.score.derived_mv'),
        dPricing: g('pricing.score.delta_pricing_usd'),
        rows,
      };
    });
    results['pricing-' + view] = { screen: pscreen, csv: await grab('export pricing', 'px-' + view), xlsx: await grab('download excel', 'pxx-' + view) };
  }
  fs.writeFileSync('/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/export-screen.json', JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1).slice(0, 4000));
  await ctx.close();
}
await browser.close();
