'use strict';
/**
 * Generates the upload fixtures from the app's own embedded data, so the codes are
 * real and the marks are realistic moves off the current values. Run once; the CSVs
 * are then committed and the tests read the files.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// 9 NAV marks and 3 market-value marks. The three apex funds are included so the
// override moves product NAV as well as the repriced value.
const NAV_CODES = ['ASCHON', 'DUNK', 'SPORTHLD', 'DEUCE', 'APCAXXII', 'SPORTEUR',
                   'SPORTB', 'SPORTC', 'APRAIL2'];
const MV_CODES = ['ASCON', 'SPORTA', 'DEUCE2FC'];
// deterministic, plausible administrator moves
const BUMP = [0.0125, -0.0080, 0.0042, -0.0215, 0.0090, 0.0031,
              -0.0154, 0.0067, -0.0048, 0.0102, -0.0119, 0.0076];

(async () => {
  const file = path.resolve(process.argv[2] || 'dist/TRACE_Platform.html');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:'))
      ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.goto('file://' + file);
  await page.evaluate(() => window.__platform.openModule('pro'));
  const f = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await f.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await f.waitForFunction(() => window.__phase1 && window.__phase1.ready === true);

  const cur = await f.evaluate(args => {
    const s = window.__phase1.ovStruct();
    const nav = currentNavMap();
    const out = {};
    args.nav.forEach(c => { out[c] = { kind: 'nav', base: nav[c] != null ? nav[c] : null }; });
    args.mv.forEach(c => { out[c] = { kind: 'mv', base: s.secMV.has(c) ? s.secMV.get(c) : null }; });
    return out;
  }, { nav: NAV_CODES, mv: MV_CODES });

  const codes = NAV_CODES.concat(MV_CODES);
  const lines = ['code,market_value,nav'];
  codes.forEach((c, i) => {
    const info = cur[c];
    if (info.base == null) throw new Error('no base value for ' + c);
    const v = +(info.base * (1 + BUMP[i])).toFixed(2);
    lines.push(info.kind === 'nav' ? c + ',,' + v : c + ',' + v + ',');
  });

  fs.mkdirSync('fixtures', { recursive: true });
  fs.writeFileSync('fixtures/overrides_12.csv', lines.join('\n') + '\n');
  console.log('fixtures/overrides_12.csv  (' + (lines.length - 1) + ' data rows)');

  // Rejected-rows fixture: three codes that match no SPV, mixed in with valid rows
  // so the test also proves the valid ones still reach the calculation.
  const rej = ['code,market_value,nav'];
  rej.push('NOTAREALSPV,,123456.78');
  rej.push(codes[0] + ',,' + (+(cur[codes[0]].base * 1.01).toFixed(2)));
  rej.push('SPORTB_TYPO,,99999.00');
  rej.push(codes[3] + ',,' + (+(cur[codes[3]].base * 0.99).toFixed(2)));
  rej.push('ZZZ999,,4200.00');
  fs.writeFileSync('fixtures/overrides_rejected.csv', rej.join('\n') + '\n');
  console.log('fixtures/overrides_rejected.csv  (' + (rej.length - 1) + ' data rows, 3 unmatched)');

  await browser.close();
})();
