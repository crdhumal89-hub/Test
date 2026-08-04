/**
 * R3 — every displayed figure carries a unit AND resolves to a simultaneously-visible as-of.
 *      Figures are enumerated from RENDERED TEXT (any element whose own text contains a digit),
 *      not from `[data-parity]`, because the rubric says "every numeric figure".
 * R5 — above-the-fold, against docs/first-run.md INCLUDING the rows the shipped test omits.
 */
import { openBrowser, watch, go, settle, save, ROUTES, EVIDENCE } from './lib.mjs';
import path from 'node:path';

const FIGURE_SCAN = () => {
  const asof = document.getElementById('asof');
  const ab = asof?.getBoundingClientRect();
  const asofVisible = !!ab && ab.height > 0 && ab.top >= 0 && ab.bottom <= innerHeight;
  const UNIT = /[$%€£]|\bbps\b|\bbp\b|\bunits?\b|\bqty\b|\bdays?\b|\bUSD\b|per unit|×|:/i;
  const figures = [];
  for (const el of document.querySelectorAll('#screen *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).filter(Boolean).join(' ');
    if (!own || !/\d/.test(own)) continue;
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (b.height === 0 || b.width === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
    if (el.closest('[hidden]')) continue;
    // A figure is any own-text that is essentially a number (allowing separators/signs/parens).
    const numeric = /^[(\-+$]?\s*[\d,]+(\.\d+)?\s*(\)|%|bps|bp|units?|x|×)?$/i.test(own) || /^[\-+(]?\$[\d,]/.test(own) || /^[\d,]+(\.\d+)?\s*(bps|%)$/i.test(own);
    if (!numeric) continue;
    // Unit at the point of reading: in the text itself, in the cell's column header, or the
    // panel's caption/label.
    const selfUnit = UNIT.test(own);
    let headerText = '';
    const td = el.closest('td,th');
    const tr = el.closest('tr');
    const table = el.closest('table');
    if (td && tr && table) {
      const idx = [...tr.children].indexOf(td);
      const head = table.querySelector('thead tr');
      if (head && head.children[idx]) headerText = (head.children[idx].textContent ?? '').trim();
    }
    const caption = table?.querySelector('caption')?.textContent ?? '';
    let labelText = '';
    for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
      const lab = p.querySelector('.tile-label,.sim-tile-label,.wf-label,.kpi-label,.chip-label,.th-label,label');
      if (lab && lab !== el) { labelText = (lab.textContent ?? '').trim(); break; }
    }
    figures.push({
      text: own.slice(0, 40), id: el.id || '', cls: String(el.className).slice(0, 40),
      top: Math.round(b.top),
      selfUnit, headerUnit: UNIT.test(headerText), captionUnit: UNIT.test(caption), labelUnit: UNIT.test(labelText),
      header: headerText.slice(0, 40), label: labelText.slice(0, 40),
    });
  }
  return { asofVisible, asofText: (asof?.textContent ?? '').replace(/\s+/g, ' ').trim(), asofTop: ab ? Math.round(ab.top) : null,
    mastheadPosition: getComputedStyle(document.querySelector('.masthead')).position, figures,
    scrollHeight: document.documentElement.scrollHeight };
};

const FIRST_RUN_CONTRACT = {
  reconciliation: [['question','#reconciliation-question'],['tie verdict','#reconciliation-waterfall .wf-tie-pill'],
    ['five waterfall steps','#reconciliation-waterfall .wf-step, #reconciliation-waterfall .wf-op',5],
    ['NAV','[data-parity="reconciliation.waterfall.nav"]'],['NAV basis','#reconciliation-waterfall .wf-basis'],
    ['pricing diff $','[data-parity="reconciliation.waterfall.delta_pricing_usd"]'],
    ['pricing diff bps','[data-parity="reconciliation.waterfall.delta_pricing_bps"]'],
    ['non-position diff $','[data-parity="reconciliation.waterfall.delta_nonposition_usd"]'],
    ['non-position diff bps','[data-parity="reconciliation.waterfall.delta_nonposition_bps"]'],
    ['exception chips','#reconciliation-exceptions .chip',3]],
  pricing: [['question','#pricing-question'],['repricing P&L','[data-parity="pricing.score.delta_pricing_usd"]'],
    ['P&L bps','[data-parity="pricing.score.delta_pricing_detail"]'],['NAV','[data-parity="pricing.score.nav"]'],
    ['flagged count','[data-parity="pricing.score.nav_detail"]'],['first five price rows','#pricing-price-table tbody tr',5],
    ['first five publish prices','[data-parity^="pricing.fund."][data-parity$=".publish_px"]',5],['which basis','#view-note']],
  'diagnose-structure': [['question','#structure-question'],['graph svg','#structure-stage svg'],
    ['caption','#structure-caption'],['controls','#structure-controls']],
  'diagnose-ownership': [['LENS QUESTION (first-run.md §3 row 4)','#ownership-question'],
    ['identity','#ownership-identity'],['checks','#ownership-checks'],['ribbon','#ownership-ribbon'],
    ['status','#ownership-status'],['first five owner rows','#ownership-tree tbody tr',5]],
  'diagnose-data-quality': [['question','#data-quality-question'],['four counts','#data-quality-kpi'],
    ['scope','#data-quality-scope'],['five buckets','#data-quality-buckets']],
  'diagnose-simulator': [['LENS QUESTION (first-run.md §3 row 4)','#simulator-question'],
    ['baseline','#simulator-baseline'],['subject','#simulator-subject'],['shock panel','#simulator-shock'],
    ['mv input','#simulator-shock-mv'],['qty input','#simulator-shock-qty'],['nav input','#simulator-shock-nav'],
    ['Run','#simulator-run'],['stage','#simulator-stage']],
};
const CHROME = [['masthead','#masthead'],['active product','#active-product'],['as-of','#asof'],['screen nav','#screen-nav']];
const DIAGNOSE = [['diagnose question','#diagnose-question'],['diagnose subject','#diagnose-subject'],
  ['entity combobox','#diagnose-entity'],['four lenses','#lens-tabs [role="tab"]',4]];

const { browser, context } = await openBrowser();
const allProblems = [];
const r3 = {}; const r5 = {};

for (const route of ROUTES) {
  // A hash-only navigation is same-document and PRESERVES scroll, which would silently corrupt an
  // above-the-fold measurement. Each route gets a genuine load in a fresh page.
  const page = await context.newPage();
  const problems = watch(page);
  allProblems.push(...problems);
  await go(page, route.hash);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  // --- R5 (on load, no scroll, no click)
  const spec = [...CHROME, ...(route.id.startsWith('diagnose') ? DIAGNOSE : []), ...(FIRST_RUN_CONTRACT[route.id] ?? [])];
  r5[route.id] = await page.evaluate((entries) => entries.map(([label, selector, want]) => {
    const nodes = [...document.querySelectorAll(selector)];
    const need = want ?? 1;
    const boxes = nodes.slice(0, need).map((n) => { const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
    return { label, selector, found: nodes.length, need, boxes,
      aboveFold: boxes.length === need && boxes.every((b) => b.top >= 0 && b.bottom <= innerHeight && b.h > 0) };
  }), spec);
  r5[route.id + '__scrollY'] = await page.evaluate(() => window.scrollY);
  await page.screenshot({ path: path.join(EVIDENCE, `critic2-fold-${route.id}.png`) });

  // --- R3: scroll the route in viewport steps, enumerate figures at each step
  const steps = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / innerHeight));
  const walk = [];
  for (let s = 0; s <= steps; s++) {
    await page.evaluate((n) => window.scrollTo(0, n * innerHeight * 0.9), s);
    await page.waitForTimeout(120);
    const scan = await page.evaluate(FIGURE_SCAN);
    const unitless = scan.figures.filter((f) => !f.selfUnit && !f.headerUnit && !f.captionUnit && !f.labelUnit);
    walk.push({ step: s, scrollY: await page.evaluate(() => Math.round(scrollY)),
      asofVisible: scan.asofVisible, asofText: scan.asofText, mastheadPosition: scan.mastheadPosition,
      figureCount: scan.figures.length, unitlessCount: unitless.length,
      unitlessSample: unitless.slice(0, 12) });
  }
  r3[route.id] = walk;
  const bad = walk.filter((w) => w.figureCount > 0 && !w.asofVisible);
  const noUnit = walk.flatMap((w) => w.unitlessSample);
  console.log(route.id, '| steps', walk.length, '| asof-missing-while-figures:', bad.length,
    '| unitless figures (max at a step):', Math.max(...walk.map((w)=>w.unitlessCount)),
    '| R5 rows failing:', r5[route.id].filter((r)=>!r.aboveFold).map((r)=>r.label).join(', ') || 'none');
  await page.close();
}
save('critic2-r3-asof-units.json', r3);
save('critic2-r5-above-fold.json', r5);
save('critic2-console.json', allProblems);
await browser.close();
