/**
 * Quick render check against a built target. Not the gate — the gate is snapshot.mjs — but it
 * catches "does it come up at all" in one second during iteration.
 *
 *   node scripts/smoke.mjs [--target dist/] [--shot docs/evidence/smoke.png]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './lib/server.mjs';
import { launch, newPage, settle } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const target = path.resolve(ROOT, arg('target', 'dist'));
const shot = arg('shot', 'docs/evidence/smoke.png');

const srv = await serve(target);
const browser = await launch();
const { page, problems } = await newPage(browser, srv.origin);
await page.goto(srv.origin + '/index.html', { waitUntil: 'load' });
await settle(page);

const report = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  return {
    question: text('.screen-question'),
    product: text('#active-product'),
    asof: text('#asof'),
    waterfall: Array.from(document.querySelectorAll('.wf-value')).map((n) => n.textContent),
    tie: text('.wf-tie-pill'),
    exceptions: Array.from(document.querySelectorAll('.chip')).map((n) =>
      n.textContent?.replace(/\s+/g, ' ').trim()
    ),
    treeRows: document.querySelectorAll('.tbl.tree tbody tr').length,
    totals: Array.from(document.querySelectorAll('tr.totals td')).map((n) => n.textContent),
    bootError: text('.state-error'),
  };
});

fs.mkdirSync(path.join(ROOT, path.dirname(shot)), { recursive: true });
await page.screenshot({ path: path.join(ROOT, shot), fullPage: false });

console.log(JSON.stringify(report, null, 1));
console.log('\nproblems:', problems.length ? JSON.stringify(problems, null, 1) : '(none)');
console.log('screenshot:', shot);

await browser.close();
await srv.close();
process.exit(report.bootError || problems.some((p) => p.type !== 'console.warn') ? 1 : 0);
