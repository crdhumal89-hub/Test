/** R17 — a rendered-text scan: is each quantity class rendered at exactly one precision everywhere? */
import { openBrowser, go, settle, save, ROUTES } from './lib.mjs';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const buckets = { money0: new Set(), money2: new Set(), moneyOther: new Set(), price6: new Set(), priceOther: new Set(),
  bps1: new Set(), bpsOther: new Set(), pct2: new Set(), pctOther: new Set(), compact: new Set() };
const samples = {};
const record = (bucket, text, where) => { buckets[bucket].add(text); (samples[bucket] ??= []).push(`${text}  @${where}`); };

async function scan(label) {
  const found = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('#screen *, #masthead *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).filter(Boolean).join(' ');
      if (!own || !/\d/.test(own)) continue;
      if (el.closest('[hidden]')) continue;
      const s = getComputedStyle(el); const b = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || b.height === 0) continue;
      items.push({ own, cls: String(el.className).slice(0, 40), id: el.id || '' });
    }
    return items;
  });
  for (const { own, cls, id } of found) {
    const where = `${label}:${id || cls}`;
    for (const m of own.matchAll(/\(?-?\$[\d,]+(?:\.(\d+))?\)?(bn|m|k)?/g)) {
      if (m[3]) { record('compact', m[0], where); continue; }
      const dp = m[1]?.length ?? 0;
      if (dp === 0) record('money0', m[0], where);
      else if (dp === 2) record('money2', m[0], where);
      else record('moneyOther', `${m[0]} (${dp}dp)`, where);
    }
    for (const m of own.matchAll(/([+-]?[\d,]+\.(\d+))\s*bps/g)) {
      (m[2].length === 1 ? record('bps1', m[0], where) : record('bpsOther', `${m[0]} (${m[2].length}dp)`, where));
    }
    for (const m of own.matchAll(/(?<![.\d])([+-]?\d+)\s*bps/g)) record('bpsOther', `${m[0]} (0dp)`, where);
    for (const m of own.matchAll(/([\d,]+\.(\d+))\s*%/g)) {
      (m[2].length === 2 ? record('pct2', m[0], where) : record('pctOther', `${m[0]} (${m[2].length}dp)`, where));
    }
    for (const m of own.matchAll(/(?<![$\d.,])(\d\.(\d+))(?![\d%])/g)) {
      (m[2].length === 6 ? record('price6', m[0], where) : record('priceOther', `${m[0]} (${m[2].length}dp)`, where));
    }
  }
}
for (const route of ROUTES) { await go(page, route.hash); await scan(route.id); }
// and the two drawers plus the walk subview
await go(page, '#/pricing');
await page.locator('#pricing-subview button[data-subview="walk"]').click(); await settle(page); await scan('walk');
await page.locator('#pricing-price-table, #pricing-walk-table tbody tr').first().click().catch(()=>{}); await settle(page); await scan('fund-detail');
await go(page, '#/reconciliation');
await page.locator('#tree tbody tr.rowv').nth(1).click(); await settle(page); await scan('row-detail');
await page.keyboard.press('Escape'); await settle(page);
await page.locator('#open-glossary').click(); await settle(page); await scan('glossary');

const summary = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.size]));
console.log(JSON.stringify(summary, null, 1));
for (const k of ['moneyOther', 'priceOther', 'bpsOther', 'pctOther']) {
  if (buckets[k].size) console.log('\n== ' + k + ' ==\n' + [...new Set(samples[k])].slice(0, 40).join('\n'));
}
save('critic2-r17-precision.json', { summary, samples: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, [...new Set(v)].slice(0, 60)])) });
await browser.close();
