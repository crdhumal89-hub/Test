/**
 * Phase 1 authoring aid: load the ORIGINAL, visit all 7 screens, and dump the rendered
 * text of every figure-bearing element so parity-map.json selectors are authored from
 * observed fact rather than from reading source. Not part of the gate.
 *
 *   node scripts/probe.mjs [screen]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './lib/server.mjs';
import { launch, newPage, settle } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];
const SCREENS = ['lt', 'rfx', 'str', 'sim', 'own', 'iss', 'gls'];

const srv = await serve(path.join(ROOT, 'reference'));
const browser = await launch();
const { page, problems } = await newPage(browser, srv.origin);
await page.goto(srv.origin + '/TRACE-Pro-original.html', { waitUntil: 'load' });
await settle(page);

const out = {};
for (const s of SCREENS) {
  if (only && s !== only) continue;
  await page.evaluate((t) => window.activateTab && window.activateTab(t), s).catch(() => {});
  await page.evaluate((t) => {
    const b = document.querySelector(`.tab[data-tab="${t}"]`);
    if (b) b.click();
  }, s);
  await settle(page);
  out[s] = await page.evaluate(() => {
    const rows = [];
    const seen = new Set();
    const sel = [
      '#ltwf .wfstep .wl', '#ltwf .wfstep .wv', '#ltwf .wfop .opl', '#ltwf .wfop .opv',
      '#ltwf .wfop .opb', '#ltwf .wftie', '#ltflags .flagchip', '#status',
      '#tree tbody tr.grand td', '#tree thead th',
      '#recscore .ss .sl', '#recscore .ss .sv', '#recscore .ss .sd',
      '#recbridge .brgend .l', '#recbridge .brgend .v', '#recbridge .brgar .g',
      '#recbridge .brgar .gb', '#recbridge .brow2 .bc', '#recbridge .brow2 .bamt',
      '#rectable thead th', '#rectable tbody tr td',
      '#walkwrap thead th', '#walkwrap tbody tr.tot td',
      '#isskpi .card .lab', '#isskpi .card .val', '#isskpi .card .sub',
      '#issbuckets .acc .nm2', '#issbuckets .acc .ct', '#issbdg',
      '#objhead span', '#objchecks .chk', '#objchecks .hint',
      '#revtree thead th', '#rollup .drv',
      '#glscount', '#glsbody .glssec .glssech', '#glsbody .glscard [data-term]',
      '#mastprodv', '#asofb', '#pmnote', '#simnavval', '#simprod', '#recprod',
      '.leg span', '#simledgerprod',
    ];
    for (const s of sel) {
      document.querySelectorAll(s).forEach((el, i) => {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!t) return;
        const key = s + '#' + i;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ sel: s, i, text: t.slice(0, 120) });
      });
    }
    return rows;
  });
}

fs.mkdirSync(path.join(ROOT, 'docs/evidence'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/evidence/probe.json'), JSON.stringify(out, null, 1));
for (const [s, rows] of Object.entries(out)) {
  console.log(`\n########## ${s} — ${rows.length} elements`);
  for (const r of rows) console.log(`  ${r.sel} [${r.i}] => ${r.text}`);
}
console.log('\n########## problems');
console.log(problems.length ? JSON.stringify(problems, null, 1) : '(none)');
await browser.close();
await srv.close();
