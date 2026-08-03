import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4178/';
// Selectors taken from docs/first-run.md, per screen.
const SPEC = {
  reconciliation: {
    hash: '#/reconciliation',
    must: [
      ['tie verdict', '#reconciliation-waterfall .wf-tie-pill'],
      ['waterfall steps', '#reconciliation-waterfall .wf-step'],
      ['NAV', '[data-parity="reconciliation.waterfall.nav"]'],
      ['NAV basis', '[data-parity="reconciliation.waterfall.nav"] ~ .wf-basis, #reconciliation-waterfall .wf-basis'],
      ['delta pricing usd', '[data-parity="reconciliation.waterfall.delta_pricing_usd"]'],
      ['delta pricing bps', '[data-parity="reconciliation.waterfall.delta_pricing_bps"]'],
      ['delta nonposition usd', '[data-parity="reconciliation.waterfall.delta_nonposition_usd"]'],
      ['delta nonposition bps', '[data-parity="reconciliation.waterfall.delta_nonposition_bps"]'],
      ['exception chips', '#reconciliation-exceptions .chip'],
      ['question', '#reconciliation-question'],
    ],
  },
  pricing: {
    hash: '#/pricing',
    must: [
      ['question', '#pricing-question'],
      ['delta pricing usd', '[data-parity="pricing.score.delta_pricing_usd"]'],
      ['delta pricing detail', '[data-parity="pricing.score.delta_pricing_detail"]'],
      ['NAV', '[data-parity="pricing.score.nav"]'],
      ['flagged count', '[data-parity="pricing.score.nav_detail"]'],
      ['publish px rows 1-5', '#pricing-price-table tbody tr'],
      ['publish px cell', '[data-parity^="pricing.fund."][data-parity$=".publish_px"]'],
      ['view note', '#view-note'],
    ],
  },
  'diagnose-structure': {
    hash: '#/diagnose/structure',
    must: [
      ['question', '#structure-question'],
      ['stage svg', '#structure-stage svg'],
      ['caption', '#structure-caption'],
      ['controls', '#structure-controls'],
      ['diagnose subject', '#diagnose-subject'],
      ['entity combobox', '#diagnose-entity'],
      ['lens tabs', '#lens-tabs [role="tab"]'],
    ],
  },
  'diagnose-ownership': {
    hash: '#/diagnose/ownership',
    must: [
      ['identity', '#ownership-identity'],
      ['checks', '#ownership-checks'],
      ['ribbon', '#ownership-ribbon'],
      ['status', '#ownership-status'],
      ['owner rows 1-5', '#ownership-tree tbody tr'],
    ],
  },
  'diagnose-data-quality': {
    hash: '#/diagnose/data-quality',
    must: [
      ['question', '#data-quality-question'],
      ['kpi', '#data-quality-kpi'],
      ['scope', '#data-quality-scope'],
      ['buckets', '#data-quality-buckets'],
    ],
  },
  'diagnose-simulator': {
    hash: '#/diagnose/simulator',
    must: [
      ['baseline', '#simulator-baseline'],
      ['subject', '#simulator-subject'],
      ['shock inputs', '#simulator-shock'],
      ['stage', '#simulator-stage'],
      ['runline (what the test asserts)', '#simulator-runline'],
    ],
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const report = {};
for (const [id, spec] of Object.entries(SPEC)) {
  await page.goto(BASE + spec.hash, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const rows = [];
  for (const [name, sel] of spec.must) {
    const r = await page.evaluate((s) => {
      const nodes = Array.from(document.querySelectorAll(s));
      if (!nodes.length) return { exists: false };
      const n = Math.min(nodes.length, 5);
      const boxes = nodes.slice(0, n).map((e) => {
        const b = e.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
      });
      return {
        exists: true,
        count: nodes.length,
        boxes,
        allAbove: boxes.every((b) => b.top >= 0 && b.bottom <= window.innerHeight && b.h > 0),
        text: (nodes[0].textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    }, sel);
    rows.push({ name, sel, ...r });
  }
  const scroll = await page.evaluate(() => ({
    docHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  report[id] = { scroll, rows };
  await page.screenshot({ path: `docs/evidence/review-fold-${id}.png` });
}
fs.writeFileSync('/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/r5.json', JSON.stringify(report, null, 1));
for (const [id, r] of Object.entries(report)) {
  console.log(`=== ${id}  doc=${r.scroll.docHeight} viewport=${r.scroll.innerHeight}`);
  for (const row of r.rows) {
    const status = !row.exists ? 'MISSING' : row.allAbove ? 'above-fold' : 'BELOW FOLD';
    console.log(
      `  ${status.padEnd(11)} ${row.name.padEnd(28)} n=${row.count ?? 0} ${row.exists ? JSON.stringify(row.boxes[0]) : row.sel}`
    );
  }
}
await browser.close();
