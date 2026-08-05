'use strict';
/**
 * Decisive experiment for the bulk-override feature.
 *
 * 1. Is reviseApplyNav() destructive for the embedded dataset (BASESTRUCT is built from
 *    a `holder` property EMB.nodes do not have)?
 * 2. Can a struct assembled from EMB.nodes' own path-parentage + existing ownpct/mv100
 *    reproduce the app's live Revised MV exactly through the engine's own recomputeR()?
 *    If yes, that is the correct seam for pushing overrides through the real engine.
 */
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

async function open(page, file) {
  await page.goto('file://' + path.resolve(file));
  await page.evaluate(() => window.__platform.openModule('pro'));
  const f = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await f.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await page.waitForTimeout(1500);
  return f;
}

(async () => {
  const file = process.argv[2] || 'dist/TRACE_Platform.html';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:'))
      ? r.continue() : r.abort();
  });

  /* --- 1. is reviseApplyNav destructive? ---------------------------- */
  let p1 = await ctx.newPage();
  let f1 = await open(p1, file);
  const destructive = await f1.evaluate(() => {
    const b = { D: REVISE.D, R: REVISE.R, N: REVISE.N };
    try { reviseApplyNav(currentNavMap()); } catch (e) { return { error: e.message }; }
    return { before: b, after: { D: REVISE.D, R: REVISE.R, N: REVISE.N } };
  });
  console.log('1. reviseApplyNav(currentNavMap()) with NO overrides (must be a no-op):');
  console.log(JSON.stringify(destructive, null, 1));
  await p1.close();

  /* --- 2. path-derived struct through recomputeR -------------------- */
  const p2 = await ctx.newPage();
  const f2 = await open(p2, file);
  const check = await f2.evaluate(() => {
    const nodes = EMB.nodes;
    const byPath = new Map(nodes.map(n => [n.path, n]));
    const parentOf = n => {
      const seg = n.path.split('/').filter(Boolean);
      seg.pop();
      return seg.length ? byPath.get(seg.join('/') + '/') : null;
    };

    // Build children / secMV once per distinct fund code (a fund can appear at many
    // places in the look-through; its own composition is the same everywhere).
    const children = new Map(), secMV = new Map(), scope = new Set();
    const doneKids = new Set(), doneSec = new Set();
    const apex = [];
    for (const n of nodes) {
      if (n.kind === 'apex' && apex.indexOf(n.code) < 0) apex.push(n.code);
      if (n.kind === 'apex' || n.kind === 'vehicle') scope.add(n.code);
    }
    for (const n of nodes) {
      const p = parentOf(n);
      if (!p) continue;
      if (n.kind === 'vehicle') {
        const key = p.code;
        if (doneKids.has(key + '@' + p.path) === false) { /* per-occurrence guard below */ }
        if (!children.has(key)) children.set(key, []);
        if (!children.get(key).some(c => c.i === n.code)) {
          children.get(key).push({ i: n.code, ownpct: n.ownpct });
        }
      } else if (n.isLeaf) {
        const key = p.code + '|' + p.path;      // sum leaves per OCCURRENCE first
        if (!doneSec.has(key)) doneSec.add(key);
      }
    }
    // secMV per distinct fund code, taken from its first occurrence only
    const firstOcc = new Map();
    for (const n of nodes) {
      const p = parentOf(n);
      if (!p || !n.isLeaf) continue;
      if (!firstOcc.has(p.code)) firstOcc.set(p.code, p.path);
      if (firstOcc.get(p.code) === p.path) {
        secMV.set(p.code, (secMV.get(p.code) || 0) + (n.mv100 || 0));
      }
    }

    const struct = { children, secMV, scope, apex: apex.slice().sort() };
    const navMap = currentNavMap();
    const R = recomputeR(struct, navMap);
    const Rprod = struct.apex.reduce((s, a) => s + (R.get(a) || 0), 0);

    // compare against the live per-fund revised values
    const live = REVISE.revByFund || {};
    let compared = 0, exact = 0, cent = 0; const worst = [];
    for (const code of Object.keys(live)) {
      if (!R.has(code)) continue;
      compared++;
      const d = Math.abs(R.get(code) - live[code]);
      if (d === 0) exact++;
      if (d < 0.005) cent++; else worst.push({ code, mine: R.get(code), live: live[code], diff: R.get(code) - live[code] });
    }
    worst.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return {
      liveR: REVISE.R, myRprod: Rprod, diff: Rprod - REVISE.R,
      apex: struct.apex, scopeSize: scope.size,
      childKeys: children.size, secMVKeys: secMV.size,
      compared, exact, withinCent: cent, offenders: worst.length, worst: worst.slice(0, 5)
    };
  });
  console.log('\n2. path-derived struct through the engine recomputeR():');
  console.log(JSON.stringify(check, null, 1));

  await browser.close();
})();
