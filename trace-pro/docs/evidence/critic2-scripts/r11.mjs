/** R11 — both product NAVs with a basis, and every view-sensitive column header in both views. */
import { openBrowser, go, settle, save, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const out = {};
const HEADERS = () => ({
  treeHeaders: [...document.querySelectorAll('#tree thead th')].map((t) => (t.innerText ?? t.textContent ?? '').replace(/\s+/g,' ').trim()),
  priceHeaders: [...document.querySelectorAll('#pricing-price-table thead th')].map((t) => (t.textContent ?? '').replace(/\s+/g,' ').trim()),
  walkHeaders: [...document.querySelectorAll('#pricing-walk-table thead th')].map((t) => (t.textContent ?? '').replace(/\s+/g,' ').trim()),
  waterfall: [...document.querySelectorAll('#reconciliation-waterfall .wf-step, #reconciliation-waterfall .wf-op')].map((n) => (n.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 90)),
  viewNote: document.querySelector('#view-note')?.textContent?.replace(/\s+/g,' ').trim() ?? null,
});
for (const basis of ['before', 'after']) {
  await go(page, '#/pricing');
  await page.locator(`#view-toggle button[data-view="${basis}"]`).click(); await settle(page);
  await page.locator('#pricing-subview button[data-subview="walk"]').click(); await settle(page);
  const pricing = await page.evaluate(HEADERS);
  await page.evaluate(() => (location.hash = '#/reconciliation')); await settle(page);
  const recon = await page.evaluate(HEADERS);
  out[basis] = { pricing, recon };
}
// both product NAVs, wherever they appear, each with its basis
await go(page, '#/reconciliation');
out.productNav = { reconciliation: await page.evaluate(() => ({
  nav: document.querySelector('[data-parity="reconciliation.waterfall.nav"]')?.textContent?.trim(),
  basis: document.querySelector('#reconciliation-waterfall .wf-basis')?.textContent?.replace(/\s+/g,' ').trim() })) };
await go(page, '#/diagnose/structure');
out.productNav.structure = await page.evaluate(() => ({
  basisPara: document.querySelector('#structure-basis')?.innerText?.replace(/\s+/g,' ').trim().slice(0, 500),
  readoutHidden: (() => { const r = document.querySelector('#structure-readout'); return r ? (r.hidden || getComputedStyle(r).display === 'none' || r.getBoundingClientRect().height === 0) : null; })(),
  readoutText: document.querySelector('#structure-readout')?.textContent?.replace(/\s+/g,' ').trim(),
}));
await go(page, '#/diagnose/simulator');
out.productNav.simulator = await page.evaluate(() => ({
  baseline: document.querySelector('#simulator-baseline')?.innerText?.replace(/\s+/g,' ').trim().slice(0, 250) }));
// diffs
const changed = [];
for (const grp of ['pricing', 'recon']) for (const k of ['treeHeaders','priceHeaders','walkHeaders','waterfall','viewNote']) {
  const a = JSON.stringify(out.before[grp][k]), b = JSON.stringify(out.after[grp][k]);
  if (a !== b) changed.push(`${grp}.${k}`);
}
out.headersThatRelabel = changed;
console.log('headers that relabel with the basis:', JSON.stringify(changed));
console.log('tree derived header:', out.before.recon.treeHeaders[3], '->', out.after.recon.treeHeaders[3]);
console.log('price ltv header:', out.before.pricing.priceHeaders[5], '->', out.after.pricing.priceHeaders[5]);
console.log('walk headers identical in both bases:', JSON.stringify(out.before.pricing.walkHeaders) === JSON.stringify(out.after.pricing.walkHeaders));
console.log('product NAV:', JSON.stringify(out.productNav, null, 1).slice(0, 1400));
save('critic2-r11.json', out);
await browser.close();
