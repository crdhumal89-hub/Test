/** R18 — the rubric's two named dead ends: the combobox "no matches", and the `None` bucket state. */
import { openBrowser, go, settle, save, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const out = {};
await go(page, '#/diagnose/data-quality');
// walk several entities looking for one whose scoped register is empty
const codes = ['DUNK', 'ASCHON', 'SPORTHFC', 'APCAXXII', 'ASCON', 'SPORTC'];
out.scoped = {};
for (const code of codes) {
  await page.locator('#diagnose-entity').fill(code);
  await settle(page);
  const opt = page.locator('.combo-option').first();
  if (!(await opt.count())) { out.scoped[code] = { noOption: true }; continue; }
  await opt.click(); await settle(page);
  out.scoped[code] = await page.evaluate(() => ({
    scope: document.querySelector('#data-quality-scope')?.innerText?.replace(/\s+/g,' ').trim().slice(0, 120),
    total: document.querySelector('[data-parity="data_quality.total_count"]')?.textContent,
    buckets: [...document.querySelectorAll('.dq-bucket')].map((b) => (b.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 80)),
    emptyStates: [...document.querySelectorAll('#screen .state-empty')].map((n) => ({ text: (n.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 140), actions: [...n.querySelectorAll('button,a')].map((x) => x.textContent?.trim()) })),
    noneMarker: /none|no issue|nothing/i.test(document.getElementById('screen')?.innerText ?? ''),
  }));
}
// the bucket accordion: expand one and look for an empty row list
await go(page, '#/diagnose/data-quality');
const bucketHeads = await page.locator('.dq-bucket button, .dq-bucket summary, .dq-bucket [role=button]').count();
out.bucketHeads = bucketHeads;
if (bucketHeads) { await page.locator('.dq-bucket button, .dq-bucket summary, .dq-bucket [role=button]').first().click(); await settle(page); }
out.expandedBucket = await page.evaluate(() => ({
  rows: document.querySelectorAll('.dq-bucket table tbody tr').length,
  truncationNote: [...document.querySelectorAll('.dq-bucket .note')].map((n) => (n.textContent ?? '').trim().slice(0, 110)).slice(0, 3),
}));
await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r18-data-quality.png') });
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
save('critic2-r18b.json', out);
await browser.close();
