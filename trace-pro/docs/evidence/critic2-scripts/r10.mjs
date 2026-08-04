/** R10 — the two collisions the rubric names, and label uniqueness in BOTH views.
 *  There is no machine check of docs/labels.md anywhere in scripts/ or tests/, so this is it. */
import { openBrowser, go, settle, save, ROUTES } from './lib.mjs';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const RETIRED = ['Applied px', 'Applied %', 'Repriced MV', 'Derived MV', 'Revised MV', 'Publish px', 'Current px', 'Revised px', 'Immediate %', 'Carried MV', 'Position MV', 'in tol', 'Global Qty'];
const out = { retiredLabelsFound: {}, duplicateLabels: {} };
for (const basis of ['before', 'after']) {
  for (const route of ROUTES) {
    await go(page, '#/pricing');
    await page.locator(`#view-toggle button[data-view="${basis}"]`).click(); await settle(page);
    await page.evaluate((h) => (location.hash = h), route.hash); await settle(page);
    if (route.id === 'pricing') { await page.locator('#pricing-subview button[data-subview="walk"]').click(); await settle(page); }
    const r = await page.evaluate((retired) => {
      const labels = [];
      for (const sel of ['th', '.wf-label', '.tile-label', '.kpi-label', '.chip-label', '.th-label', 'dt', 'label', '.sim-tile-label', '.dq-card-label']) {
        for (const el of document.querySelectorAll('#screen ' + sel)) {
          if (el.closest('[hidden]')) continue;
          const b = el.getBoundingClientRect(); if (b.height === 0) continue;
          const t = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (t) labels.push({ sel, t });
        }
      }
      const text = document.getElementById('screen')?.innerText ?? '';
      return { labels, retiredHits: retired.filter((x) => text.includes(x)) };
    }, RETIRED);
    out.retiredLabelsFound[`${basis}|${route.id}`] = r.retiredHits;
    // duplicate first-line labels within one view
    const heads = r.labels.map((l) => l.t.split('\n')[0]).filter((t) => t.length > 2 && t.length < 60);
    const seen = {}; const dupes = [];
    for (const h of heads) { seen[h] = (seen[h] ?? 0) + 1; }
    for (const [k, v] of Object.entries(seen)) if (v > 1) dupes.push(`${k} ×${v}`);
    out.duplicateLabels[`${basis}|${route.id}`] = dupes;
  }
}
const anyRetired = Object.entries(out.retiredLabelsFound).filter(([, v]) => v.length);
console.log('retired labels still rendered:', JSON.stringify(anyRetired));
console.log('repeated labels within a view:');
for (const [k, v] of Object.entries(out.duplicateLabels)) if (v.length) console.log('  ', k, JSON.stringify(v));
save('critic2-r10.json', out);
await browser.close();
