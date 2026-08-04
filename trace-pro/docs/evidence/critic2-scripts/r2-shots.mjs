/** Screenshots of the bare-abbreviation occurrences R2 forbids, with their exact coordinates. */
import { openBrowser, go, settle, save, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const out = {};
const shot = async (name, clip) => page.screenshot({ path: path.join(EVIDENCE, `critic2-r2-${name}.png`), clip });
const boxOf = (sel, textMatch) => page.evaluate(([s, t]) => {
  const el = [...document.querySelectorAll(s)].find((e) => !t || new RegExp(t).test(e.textContent ?? ''));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: Math.min(900, r.width + 24), height: r.height + 24,
    text: (el.textContent ?? '').replace(/\s+/g,' ').trim().slice(0, 120), inGterm: !!el.closest('.gterm') };
}, [sel, textMatch]);

await go(page, '#/reconciliation');
out.mastheadTagline = await boxOf('.tagline');
if (out.mastheadTagline) await shot('masthead-tagline-NAV', { x: out.mastheadTagline.x, y: out.mastheadTagline.y, width: out.mastheadTagline.width, height: out.mastheadTagline.height });
await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r2-masthead.png'), clip: { x: 0, y: 0, width: 1600, height: 120 } });

await go(page, '#/diagnose/ownership');
out.ownershipIdentity = await boxOf('#ownership-identity');
out.ownershipTreeHeader = await boxOf('#ownership-tree thead tr');
await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r2-ownership-lens.png'), clip: { x: 0, y: 380, width: 1600, height: 300 } });

await go(page, '#/diagnose/data-quality');
out.dqBuckets = await boxOf('.dq-name', 'SPV');
await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r2-data-quality.png'), clip: { x: 0, y: 620, width: 1000, height: 220 } });

await go(page, '#/diagnose/simulator');
out.simulatorSubject = await boxOf('.sim-tile-value');
await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r2-simulator.png'), clip: { x: 0, y: 340, width: 1600, height: 360 } });
// the graph's bare "px 1.122812" captions
out.simulatorGraphPx = await page.evaluate(() => {
  const hits = [...document.querySelectorAll('#simulator-stage text, #simulator-stage tspan')]
    .filter((t) => /(?<![A-Za-z0-9])px(?![A-Za-z0-9])/.test(t.textContent ?? ''));
  return { count: hits.length, sample: hits.slice(0, 5).map((t) => (t.textContent ?? '').trim()),
    anyGlossaryLinked: hits.some((t) => !!t.closest('.gterm')) };
});
// does the simulator/ownership/data-quality lens render a vocabulary line at all?
out.vocabularyLines = {};
for (const [id, hash] of [['reconciliation-vocabulary','#/reconciliation'],['pricing-vocabulary','#/pricing'],
  ['structure-vocabulary','#/diagnose/structure'],['x-ownership','#/diagnose/ownership'],
  ['x-data-quality','#/diagnose/data-quality'],['x-simulator','#/diagnose/simulator']]) {
  await go(page, hash);
  out.vocabularyLines[hash] = await page.evaluate(() => ({
    vocabLines: [...document.querySelectorAll('#screen .screen-vocab')].map((n) => (n.textContent ?? '').slice(0, 90)),
  }));
}
console.log(JSON.stringify(out, null, 1));
save('critic2-r2-shots.json', out);
await browser.close();
