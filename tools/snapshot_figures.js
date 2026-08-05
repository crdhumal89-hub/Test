'use strict';
/**
 * snapshot_figures.js - the project's safety net.
 *
 * Extracts every rendered numeric value from the whole app: the launcher, the TRACE
 * module, and all seven TRACE-Pro tabs (plus the extra UI states that reveal figures the
 * default state hides - the expanded Look-Through tree and the Repricing Walk view).
 *
 * Values are captured EXACTLY as rendered, in document order, with no normalisation,
 * rounding or tolerance of any kind. The comparison is a byte-for-byte match of the
 * emitted JSON. If a figure changes, moves, appears or disappears, this fails.
 *
 *   node tools/snapshot_figures.js                          # write dist snapshot
 *   node tools/snapshot_figures.js --out baseline/figures.json
 *   node tools/snapshot_figures.js --compare baseline/figures.json
 *
 * All external requests are blocked, because offline double-click is the product's
 * stated deployment mode and it is the only way the snapshot can be deterministic.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const TABS = ['lt', 'rfx', 'str', 'sim', 'own', 'iss', 'gls'];

/* ---------------------------------------------------------------- args */
function parseArgs(argv) {
  const a = { file: null, out: null, compare: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--compare') a.compare = argv[++i];
    else if (!argv[i].startsWith('--')) a.file = argv[i];
  }
  a.file = a.file || 'dist/TRACE_Platform.html';
  return a;
}

/* ------------------------------------------------- in-page extraction */
/**
 * Runs inside the page. Collects numeric tokens from rendered text, from form control
 * values (innerText misses those) and from SVG text (innerText misses that too).
 */
function EXTRACTOR() {
  window.__figScan = function (root) {
    if (!root) return null;
    // A number must not end on a group separator: "$1,234, and" is the figure
    // "$1,234" followed by prose punctuation, not a token ending in a comma.
    const NUM = /(?:[-+−]\s*)?\$?\d(?:[\d,]*\d)?(?:\.\d+)?/g;
    const out = [];

    const text = root.innerText || '';
    let m;
    while ((m = NUM.exec(text)) !== null) out.push({ s: 'text', v: m[0] });

    root.querySelectorAll('input,textarea,select').forEach(function (el) {
      const v = el.type === 'checkbox' || el.type === 'radio'
        ? (el.checked ? 'checked' : 'unchecked')
        : (el.value == null ? '' : String(el.value));
      if (/\d/.test(v)) out.push({ s: 'field:' + (el.id || el.name || el.className || el.tagName), v: v });
    });

    root.querySelectorAll('svg text, svg tspan').forEach(function (el) {
      const t = el.textContent || '';
      let mm; const R = /(?:[-+−]\s*)?\$?\d(?:[\d,]*\d)?(?:\.\d+)?/g;
      while ((mm = R.exec(t)) !== null) out.push({ s: 'svg', v: mm[0] });
    });

    return out;
  };
}

/* ------------------------------------------------------------ capture */
async function capture(file) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce'
  });

  const blocked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('about:') || u.startsWith('data:') ||
        u.startsWith('blob:')) return route.continue();
    blocked.push(u);
    return route.abort();
  });

  await ctx.addInitScript(EXTRACTOR);

  const page = await ctx.newPage();
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });

  const sections = {};

  /* --- launcher ------------------------------------------------------ */
  sections['shell:landing'] = await page.evaluate(() =>
    window.__figScan(document.getElementById('landing')));

  /* --- TRACE module (out of scope for redesign, but it is edited for the
         em-dash sweep and the meta guards, so its figures are pinned too) --- */
  await page.evaluate(() => window.__platform.openModule('trace'));
  const traceFrame = await (await page.waitForSelector('#frame-trace')).contentFrame();
  await traceFrame.waitForSelector('body', { timeout: 30000 });
  await page.waitForTimeout(2500);
  sections['trace:default'] = await traceFrame.evaluate(() =>
    window.__figScan(document.body));

  /* --- TRACE-Pro ----------------------------------------------------- */
  await page.evaluate(() => window.__platform.openModule('pro'));
  const proFrame = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await proFrame.waitForSelector('.tabbar .tab', { timeout: 30000 });
  await proFrame.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await page.waitForTimeout(2000);

  for (const tab of TABS) {
    await proFrame.evaluate(t => {
      const b = document.querySelector('.tab[data-tab="' + t + '"]');
      if (b) b.click();
    }, tab);
    await page.waitForTimeout(900);
    sections['pro:' + tab] = await proFrame.evaluate(t =>
      window.__figScan(document.getElementById('tab-' + t)), tab);
  }

  /* --- extra deterministic states that expose otherwise hidden figures - */
  await proFrame.evaluate(() => {
    const b = document.querySelector('.tab[data-tab="rfx"]');
    if (b) b.click();
    const walk = document.querySelector('#rfxsub button[data-v="walk"]');
    if (walk) walk.click();
  });
  await page.waitForTimeout(1200);
  sections['pro:rfx@walk'] = await proFrame.evaluate(() =>
    window.__figScan(document.getElementById('tab-rfx')));

  await proFrame.evaluate(() => {
    const t = document.querySelector('#rfxsub button[data-v="table"]');
    if (t) t.click();
    const b = document.querySelector('.tab[data-tab="lt"]');
    if (b) b.click();
    const ex = document.getElementById('expand');
    if (ex) ex.click();
  });
  await page.waitForTimeout(1800);
  sections['pro:lt@expanded'] = await proFrame.evaluate(() =>
    window.__figScan(document.getElementById('tab-lt')));

  await browser.close();

  const snap = { version: 1, sections: {} };
  let total = 0;
  for (const k of Object.keys(sections).sort()) {
    const rows = sections[k] || [];
    total += rows.length;
    snap.sections[k] = { count: rows.length, figures: rows };
  }
  snap.totalFigures = total;
  // Attempted external requests are reported to stdout but deliberately kept OUT of the
  // compared artifact: they are not rendered figures, and "no external requests" is
  // asserted far more strictly by playwright_gate.js and check_selfcontained.js.
  Object.defineProperty(snap, 'externalRequestsBlocked', {
    value: [...new Set(blocked)].sort(), enumerable: false
  });
  return snap;
}

function stable(snap) { return JSON.stringify(snap, null, 1) + '\n'; }
function hashOf(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

/* --------------------------------------------------------------- diff */
function reportDiff(baseText, curText) {
  const base = JSON.parse(baseText), cur = JSON.parse(curText);
  const keys = [...new Set([...Object.keys(base.sections), ...Object.keys(cur.sections)])].sort();
  let shown = 0;
  console.error('');
  console.error('FIGURE DIFF (baseline -> current)');
  console.error('  baseline total figures: ' + base.totalFigures);
  console.error('  current  total figures: ' + cur.totalFigures);
  for (const k of keys) {
    const b = base.sections[k], c = cur.sections[k];
    if (!b) { console.error('  + NEW SECTION ' + k + ' (' + c.count + ' figures)'); continue; }
    if (!c) { console.error('  - MISSING SECTION ' + k + ' (' + b.count + ' figures)'); continue; }
    if (b.count !== c.count) {
      console.error('  ! ' + k + ': figure count ' + b.count + ' -> ' + c.count);
    }
    const n = Math.max(b.figures.length, c.figures.length);
    for (let i = 0; i < n; i++) {
      const bf = b.figures[i], cf = c.figures[i];
      const bs = bf ? bf.s + '|' + bf.v : '(absent)';
      const cs = cf ? cf.s + '|' + cf.v : '(absent)';
      if (bs !== cs) {
        if (shown < 40) console.error('    [' + k + ' #' + i + '] ' + bs + '  ->  ' + cs);
        shown++;
      }
    }
  }
  if (shown > 40) console.error('    ... and ' + (shown - 40) + ' more differing positions');
  if (shown === 0) console.error('  (no positional differences; metadata differs)');
}

/* --------------------------------------------------------------- main */
(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    console.error('snapshot_figures: no such file: ' + args.file);
    process.exit(2);
  }

  const snap = await capture(args.file);
  const text = stable(snap);

  console.log('snapshot of ' + args.file);
  console.log('  sections:       ' + Object.keys(snap.sections).length);
  console.log('  total figures:  ' + snap.totalFigures);
  console.log('  sha256:         ' + hashOf(text));
  for (const k of Object.keys(snap.sections)) {
    console.log('    ' + k.padEnd(18) + snap.sections[k].count);
  }
  if (snap.externalRequestsBlocked.length) {
    console.log('  external requests attempted (blocked): ' +
                snap.externalRequestsBlocked.length);
    snap.externalRequestsBlocked.forEach(u => console.log('      ' + u));
  } else {
    console.log('  external requests attempted: none');
  }

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, text);
    console.log('  written to ' + args.out);
  }

  if (args.compare) {
    if (!fs.existsSync(args.compare)) {
      console.error('snapshot_figures: baseline not found: ' + args.compare);
      process.exit(2);
    }
    const baseText = fs.readFileSync(args.compare, 'utf8');
    if (baseText === text) {
      console.log('');
      console.log('COMPARE OK: byte-identical to ' + args.compare);
      console.log('  ' + snap.totalFigures + ' figures, sha256 ' + hashOf(text));
      process.exit(0);
    }
    console.error('');
    console.error('COMPARE FAILED: snapshot differs from ' + args.compare);
    console.error('  baseline sha256: ' + hashOf(baseText));
    console.error('  current  sha256: ' + hashOf(text));
    try { reportDiff(baseText, text); } catch (e) { console.error('  (diff failed: ' + e.message + ')'); }
    fs.writeFileSync('snapshot-current.json', text);
    console.error('');
    console.error('  current snapshot written to snapshot-current.json');
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(2); });
