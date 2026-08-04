/** R17, the sharpest case: the SAME quantity (repricing gain/loss in bps, fund ASCHON) at two
 *  precisions in two arrangements of the same table, on one screen. */
import { openBrowser, go, settle, save } from './lib.mjs';
const { browser, context } = await openBrowser();
const page = await context.newPage();
await go(page, '#/pricing');
const table = await page.evaluate(() => ({
  header: [...document.querySelectorAll('#pricing-price-table thead th')].map((t) => (t.textContent ?? '').trim()),
  aschon: document.querySelector('[data-parity="pricing.fund.ASCHON.pnl_bps"]')?.textContent?.trim(),
  sporthld: document.querySelector('[data-parity="pricing.fund.SPORTHLD.pnl_bps"]')?.textContent?.trim(),
  scoreDetail: document.querySelector('[data-parity="pricing.score.delta_pricing_detail"]')?.textContent?.trim(),
  bridge: [...document.querySelectorAll('.bridge-bps')].map((n) => n.textContent?.trim()),
}));
await page.locator('#pricing-subview button[data-subview="walk"]').click(); await settle(page);
const walk = await page.evaluate(() => ({
  aschon: document.querySelector('[data-parity="pricing.walk.fund.ASCHON.delta_bps"]')?.textContent?.trim(),
  sporthld: document.querySelector('[data-parity="pricing.walk.fund.SPORTHLD.delta_bps"]')?.textContent?.trim(),
  total: document.querySelector('[data-parity="pricing.walk.total.delta_bps"]')?.textContent?.trim(),
}));
await go(page, '#/reconciliation');
const recon = await page.evaluate(() => ({
  pricingBps: document.querySelector('[data-parity="reconciliation.waterfall.delta_pricing_bps"]')?.textContent?.trim(),
  nonPosBps: document.querySelector('[data-parity="reconciliation.waterfall.delta_nonposition_bps"]')?.textContent?.trim(),
}));
const out = { priceTable: table, repricingWalk: walk, reconciliation: recon,
  finding: 'ASCHON repricing gain/loss in bps renders as "' + table.aschon + '" in the price table and "' + walk.aschon + '" in the repricing walk — same quantity, same screen, two precisions.' };
console.log(JSON.stringify(out, null, 1));
save('critic2-r17b-bps.json', out);
await browser.close();
