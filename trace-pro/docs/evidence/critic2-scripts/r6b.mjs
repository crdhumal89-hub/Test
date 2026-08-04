/** R6(b) with per-ELEMENT identity, so duplicate accessible names cannot hide an unreached control. */
import { openBrowser, go, save, ROUTES } from './lib.mjs';
const { browser, context } = await openBrowser();
const report = {};
for (const route of ROUTES) {
  const page = await context.newPage();
  await go(page, route.hash);
  const total = await page.evaluate(() => {
    const sel = 'button, a[href], input, select, textarea, [role=button], [role=tab], [role=columnheader], [role=option], [tabindex]';
    let n = 0;
    for (const host of ['#masthead', '#screen'].map((s) => document.querySelector(s)).filter(Boolean)) {
      for (const el of host.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
        if (el.closest('[hidden]') || s.display === 'none' || s.visibility === 'hidden' || b.width === 0 || b.height === 0) continue;
        if (el.tabIndex < 0) continue;      // deliberately programmatic-only (e.g. #screen)
        el.setAttribute('data-c2cand', String(++n));
      }
    }
    return n;
  });
  const seen = new Set();
  let wraps = 0;
  for (let i = 0; i < 800; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return '__body__';
      const c = a.getAttribute('data-c2cand');
      return c ? 'c' + c : 'other:' + a.tagName.toLowerCase() + '#' + (a.id || '') + '.' + String(a.className).split(' ')[0];
    });
    if (id === '__body__') { if (++wraps > 1) break; continue; }
    if (seen.has(id)) { if (seen.size >= total) break; }
    seen.add(id);
  }
  const reached = [...seen].filter((s) => s.startsWith('c')).length;
  const missing = await page.evaluate((seenList) => {
    const set = new Set(seenList);
    return [...document.querySelectorAll('[data-c2cand]')]
      .filter((e) => !set.has('c' + e.getAttribute('data-c2cand')))
      .map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('role') ?? ''}]#${e.id || ''}.${String(e.className).split(' ')[0]} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g,' ').trim().slice(0, 40)}"`);
  }, [...seen]);
  const nonCandidateStops = [...seen].filter((s) => s.startsWith('other:'));
  report[route.id] = { candidates: total, reached, missingCount: missing.length, missing: missing.slice(0, 20), nonCandidateStops };
  console.log(route.id, 'candidates', total, 'reached', reached, 'missing', missing.length, missing.slice(0, 6));
  await page.close();
}
// are the reconciliation tree headers actually click targets?
{
  const page = await context.newPage();
  await go(page, '#/reconciliation');
  report.treeHeaderClickable = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('#tree thead th')];
    const before = document.querySelector('#tree tbody tr.rowv')?.textContent;
    ths[2]?.click();
    return { count: ths.length, cursor: getComputedStyle(ths[2]).cursor,
      role: ths[2]?.getAttribute('role'), tabindex: ths[2]?.getAttribute('tabindex'),
      ariaSort: ths[2]?.getAttribute('aria-sort'),
      clickChangedFirstRow: document.querySelector('#tree tbody tr.rowv')?.textContent !== before };
  });
  console.log('tree headers:', JSON.stringify(report.treeHeaderClickable));
  await page.close();
}
save('critic2-r6b-reachability.json', report);
await browser.close();
