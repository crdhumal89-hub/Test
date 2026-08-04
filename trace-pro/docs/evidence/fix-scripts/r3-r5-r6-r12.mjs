/**
 * Reproducible evidence for the four criteria fixed in this pass — R3, R5, R6, R12.
 *
 *   npx vite preview --port 4188 --strictPort   # serves dist/
 *   node docs/evidence/fix-scripts/r3-r5-r6-r12.mjs
 *
 * Writes docs/evidence/r3-*.png, r5-*.png, r6-*.png, r12-*.png and r3-r5-r6-r12.json.
 * Every number quoted in the report comes out of here or out of the Playwright specs
 * (tests/e2e/rubric.spec.ts for R3/R5/R12, tests/e2e/rubric-focus.spec.ts for R6).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4188/';
const OUT = 'docs/evidence/';
const ROUTES = [
  ['reconciliation', '#/reconciliation'],
  ['pricing', '#/pricing'],
  ['diagnose-structure', '#/diagnose/structure'],
  ['diagnose-ownership', '#/diagnose/ownership'],
  ['diagnose-data-quality', '#/diagnose/data-quality'],
  ['diagnose-simulator', '#/diagnose/simulator'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
const report = { r3: [], r5: [], r6: {}, r12: [] };

/* ---------------------------------------------------------------- R3: the as-of cannot scroll away */
for (const [id, hash] of ROUTES) {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => {
    const asof = document.getElementById('asof').getBoundingClientRect();
    const figures = [...document.querySelectorAll('#screen [data-parity]')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.height > 0 && r.top < innerHeight && r.bottom > 0;
    }).length;
    return {
      scrollY: Math.round(scrollY),
      docHeight: document.documentElement.scrollHeight,
      mastheadPosition: getComputedStyle(document.querySelector('.masthead')).position,
      asofTop: Math.round(asof.top),
      asofVisible: asof.top >= 0 && asof.bottom <= innerHeight && asof.height > 0,
      figuresInViewport: figures,
    };
  });
  report.r3.push({ route: id, ...seen });
  await page.screenshot({ path: `${OUT}r3-asof-at-page-bottom-${id}.png` });
}

/* ---------------------------------------------------------------- R5: every contract element, boxed */
for (const [id, hash] of ROUTES) {
  // about:blank first, so each route is a genuine cold load: `goto` between two hashes of the same
  // document is a same-document navigation and would inherit the previous scroll position.
  await page.goto('about:blank');
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForTimeout(1600);
  report.r5.push({ route: id, scrollY: await page.evaluate(() => window.scrollY) });
  await page.screenshot({ path: `${OUT}r5-above-the-fold-${id}.png` });
}

/* ---------------------------------------------------------------- R6: rings, drawn and measured */
const shot = async (hash, selector, name) => {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const node = page.locator(selector).first();
  await node.focus();
  const clip = await node.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left - 14), y: Math.max(0, r.top - 14), width: r.width + 28, height: r.height + 28 };
  });
  await page.screenshot({ path: `${OUT}r6-${name}.png`, clip });
  report.r6[name] = await node.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      outlineOffset: s.outlineOffset,
      halo: s.boxShadow,
      fill: s.backgroundColor,
    };
  });
};
await shot('#/reconciliation', '#view-toggle button[data-view="before"]', 'basis-segment');
await shot('#/reconciliation', '#view-toggle button[data-view="after"]', 'basis-segment-active');
await shot('#/diagnose/ownership', '#ownership-ribbon .own-seg', 'ribbon-segment');
await page.goto(BASE + '#/diagnose/ownership', { waitUntil: 'load' });
await page.waitForTimeout(1600);
await page.locator('#ownership-ribbon .own-seg').nth(3).focus();
await page.screenshot({ path: `${OUT}r6-ribbon-in-context.png`, clip: { x: 20, y: 380, width: 1560, height: 220 } });

/* ---------------------------------------------------------------- R12: offered only where it acts */
for (const [id, hash] of ROUTES) {
  await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(1400);
  const state = await page.evaluate(() => {
    const t = document.getElementById('view-toggle');
    const n = document.getElementById('view-note');
    return {
      toggleHidden: t.hidden,
      toggleDisplay: getComputedStyle(t).display,
      toggleHeight: Math.round(t.getBoundingClientRect().height),
      noteHidden: n.hidden,
      noteDisplay: getComputedStyle(n).display,
      noteHeight: Math.round(n.getBoundingClientRect().height),
    };
  });
  report.r12.push({ route: id, ...state });
  await page.screenshot({ path: `${OUT}r12-basis-control-${id}.png`, clip: { x: 0, y: 0, width: 1600, height: 230 } });
}

fs.writeFileSync(OUT + 'r3-r5-r6-r12.json', JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
await browser.close();
