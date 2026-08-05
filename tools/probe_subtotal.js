'use strict';
/** Diagnostic: does liveMVof(parent) already equal the sum over direct children? */
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FILE = path.resolve(process.argv[2] || 'dist/TRACE_Platform.html');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:'))
      ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.goto('file://' + FILE, { waitUntil: 'load' });
  await page.evaluate(() => window.__platform.openModule('pro'));
  const frame = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await frame.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const out = await frame.evaluate(() => {
    const depth = p => p.split('/').filter(Boolean).length;
    const kidsOf = n => MODEL.nodes.filter(x =>
      x.path.startsWith(n.path) && x.id !== n.id && depth(x.path) === depth(n.path) + 1);

    const cols = {
      derived: n => liveMVof(n),
      revised: n => revMVof(n),
      nav:     n => navMVof(n)
    };
    const res = {};
    for (const col of Object.keys(cols)) {
      const f = cols[col];
      let checked = 0, exact = 0, cent = 0; const worst = [];
      for (const n of MODEL.nodes) {
        const kids = kidsOf(n);
        if (!kids.length) continue;
        const pv = f(n);
        if (pv == null) continue;
        let sum = 0, anyNull = false;
        for (const k of kids) { const v = f(k); if (v == null) { anyNull = true; break; } sum += v; }
        if (anyNull) continue;
        checked++;
        const d = Math.abs(pv - sum);
        if (d === 0) exact++;
        if (d < 0.005) cent++;
        else worst.push({ code: n.code || n.name, kind: n.kind, level: n.level,
                          parent: pv, sum: sum, diff: pv - sum, kids: kids.length });
      }
      worst.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      res[col] = { checked, exact, withinCent: cent, offenders: worst.length, worst: worst.slice(0, 6) };
    }
    // node census
    const byKind = {}, byLevel = {};
    MODEL.nodes.forEach(n => {
      byKind[n.kind] = (byKind[n.kind] || 0) + 1;
      byLevel[n.level] = (byLevel[n.level] || 0) + 1;
    });
    return { res, byKind, byLevel, total: MODEL.nodes.length,
             maxLevel: Math.max(...MODEL.nodes.map(n => n.level)) };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
