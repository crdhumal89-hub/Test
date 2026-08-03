/**
 * TRACE-Pro parity harness.
 *
 *   node scripts/snapshot.mjs --target reference/TRACE-Pro-original.html [--out FILE]
 *   node scripts/snapshot.mjs --target dist/ --diff tests/baseline.json
 *
 * Loads a target, visits all 7 screens, runs the documented default interactions, and writes
 * every key in parity-map.json with its rendered string.
 *
 * Determinism contract (see docs/redesign-spec.md 5.4): fixed 1600x1000 viewport, en-US locale,
 * UTC timezone, reduced motion, a FRESH browser context per scene so sessionStorage
 * (tracePricingMode / traceSimTheme / traceChrome) can never leak from one scene or run into the
 * next, DOM-stability polling instead of fixed sleeps, and the two cdnjs dependencies fulfilled
 * from vendor/ so no request leaves the machine.
 *
 * Exit codes: 0 pass. 1 unresolved keys. 2 parity diffs. 3 harness error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './lib/server.mjs';
import { launch, newPage, settle } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const targetArg = arg('target');
if (!targetArg) {
  console.error('usage: node scripts/snapshot.mjs --target <file|dir> [--diff baseline.json] [--out file]');
  process.exit(3);
}
const diffPath = arg('diff');
const outPath = arg('out');

const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity-map.json'), 'utf8'));

/* ------------------------------------------------------------------ target resolution */
const absTarget = path.resolve(ROOT, targetArg);
if (!fs.existsSync(absTarget)) {
  console.error('target does not exist: ' + absTarget);
  process.exit(3);
}
const isDir = fs.statSync(absTarget).isDirectory();
const serveRoot = isDir ? absTarget : path.dirname(absTarget);
const entryPath = isDir ? '/index.html' : '/' + path.basename(absTarget);

/* ------------------------------------------------------------------ in-page extraction */
/** Runs in the browser. Returns { [key]: string } for one entry of the map. */
function extractEntry(entry) {
  const norm = (s) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim());
  const textOf = (el, opts = {}) => {
    if (!el) return null;
    if (opts.exclude) {
      const c = el.cloneNode(true);
      c.querySelectorAll(opts.exclude).forEach((n) => n.remove());
      return norm(c.textContent);
    }
    return norm(el.textContent);
  };
  const parseNum = (s) => {
    if (s == null) return null;
    const t = String(s).replace(/[\s,$%]/g, '').replace(/bps/gi, '');
    const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
    const d = t.replace(/[()\-+]/g, '');
    if (d === '' || !/^[0-9.]+$/.test(d)) return null;
    const v = parseFloat(d);
    return isNaN(v) ? null : neg ? -v : v;
  };
  const out = {};

  if (entry.type === 'single') {
    for (const [key, spec] of Object.entries(entry.keys)) {
      const el = document.querySelector(spec.selector);
      out[key] = textOf(el, spec);
    }
    return out;
  }

  if (entry.type === 'count') {
    for (const [key, spec] of Object.entries(entry.keys)) {
      out[key] = String(document.querySelectorAll(spec.selector).length);
    }
    return out;
  }

  if (entry.type === 'rows' || entry.type === 'list') {
    const rowSel = entry.rowSelector || entry.selector;
    let rows = Array.from(document.querySelectorAll(rowSel));
    if (entry.where) {
      rows = rows.filter((r) => {
        const w = r.querySelector(entry.where.selector);
        return textOf(w) === entry.where.equals;
      });
    }
    const ids = new Set();
    for (const r of rows) {
      let id = null;
      if (entry.idFrom.attr) id = r.getAttribute(entry.idFrom.attr);
      else if (entry.idFrom.selector) id = textOf(r.querySelector(entry.idFrom.selector));
      else if (entry.idFrom.text) id = textOf(r);
      if (id && entry.idFrom.strip) id = norm(String(id).replace(new RegExp(entry.idFrom.strip), ''));
      if (!id) continue;
      id = String(id).replace(/[^A-Za-z0-9_.>-]+/g, '_');
      if (ids.has(id)) continue; // first occurrence wins; duplicates are reported as row_count drift
      ids.add(id);
      for (const [suffix, spec] of Object.entries(entry.cells || {})) {
        const cs = typeof spec === 'string' ? { selector: spec } : spec;
        const cell = cs.selector === '.' ? r : r.querySelector(cs.selector);
        out[`${entry.keyPrefix}.${id}.${suffix}`] = textOf(cell, cs);
      }
      if (!entry.cells) out[`${entry.keyPrefix}.${id}`] = textOf(r);
    }
    out[`${entry.keyPrefix}.__row_count`] = String(ids.size);
    return out;
  }

  if (entry.type === 'digest') {
    const rows = Array.from(document.querySelectorAll(entry.rowSelector));
    out[`${entry.keyPrefix}.row_count`] = String(rows.length);
    for (const [name, colIdx] of Object.entries(entry.columns)) {
      let sum = 0;
      let n = 0;
      let min = null;
      let max = null;
      for (const r of rows) {
        const cell = r.querySelector(`td:nth-child(${colIdx})`);
        const v = parseNum(textOf(cell));
        if (v == null) continue;
        n++;
        sum += v;
        min = min == null ? v : Math.min(min, v);
        max = max == null ? v : Math.max(max, v);
      }
      const fx = (x) => (x == null ? null : x.toFixed(2));
      out[`${entry.keyPrefix}.${name}.count`] = String(n);
      out[`${entry.keyPrefix}.${name}.sum`] = fx(sum);
      out[`${entry.keyPrefix}.${name}.min`] = fx(min);
      out[`${entry.keyPrefix}.${name}.max`] = fx(max);
    }
    return out;
  }

  throw new Error('unknown entry type: ' + entry.type);
}

/* ------------------------------------------------------------------ documented interactions */
async function applyStep(page, step) {
  const [verb, ...rest] = step.split(':');
  const param = rest.join(':');
  switch (verb) {
    case 'expandAll':
      await page.click('#expand');
      break;
    case 'ltRow': {
      const ok = await page.evaluate((code) => {
        const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
        const row = rows.find((r) => {
          const c = r.querySelector('.codetag');
          return c && c.textContent.trim() === code;
        });
        if (!row) return false;
        row.click();
        return true;
      }, param);
      if (!ok) throw new Error(`step ltRow:${param} — no tree row with that code`);
      break;
    }
    case 'rfxRow': {
      const sel = `#rectable tbody tr[data-c="${param}"]`;
      if (!(await page.$(sel))) throw new Error(`step rfxRow:${param} — no such row`);
      await page.click(sel);
      break;
    }
    case 'rfxView':
      await page.click(`#rfxsub button[data-v="${param}"]`);
      break;
    case 'stageFullscreen':
      await page.click(param === 'sim' ? '#simfull' : '#strfull');
      break;
    case 'simFullReprice':
      await page.click('#simreprice');
      await page.waitForFunction(
        () => {
          const l = document.getElementById('simrunlab');
          return !!l && /complete/i.test(l.textContent || '');
        },
        undefined,
        { timeout: 120000 }
      );
      break;
    case 'ownRow': {
      const n = parseInt(param, 10);
      const rows = await page.$$('#revtree tbody tr.rowv');
      if (!rows[n - 1]) throw new Error(`step ownRow:${param} — fewer than ${n} rows`);
      await rows[n - 1].click();
      break;
    }
    case 'ownSearch':
      await pickFromCombo(page, '#objinput', '#objlist', param);
      break;
    case 'issScope':
      await pickFromCombo(page, '#issinput', '#isslist', param);
      break;
    case 'glsSearch':
      await page.fill('#glssearch', param);
      await page.dispatchEvent('#glssearch', 'input');
      break;
    case 'glsChip':
      await page.click(`.glschip[data-group="${param}"]`);
      break;
    default:
      throw new Error('unknown step: ' + step);
  }
  await settle(page);
}

/** Type into one of the app's comboboxes and click the first matching option. */
async function pickFromCombo(page, inputSel, listSel, query) {
  await page.click(inputSel);
  await page.fill(inputSel, query);
  await page.dispatchEvent(inputSel, 'input');
  await page.waitForSelector(`${listSel} li[data-i]`, { timeout: 10000 });
  await page.click(`${listSel} li[data-i]`);
}

/* ------------------------------------------------------------------ scenes */
/** A scene is one (screen, view, steps) triple; entries sharing a scene are extracted together. */
function sceneKeyOf(e) {
  return JSON.stringify([e.screen || 'any', e.view || 'before', e.steps || []]);
}

async function run() {
  const srv = await serve(serveRoot);
  const browser = await launch();

  const scenes = new Map();
  for (const e of MAP.entries) {
    const k = sceneKeyOf(e);
    if (!scenes.has(k)) scenes.set(k, []);
    scenes.get(k).push(e);
  }

  const values = {};
  const problems = [];
  const sceneLog = [];

  for (const [k, entries] of scenes) {
    const [screen, view, steps] = JSON.parse(k);
    // Fresh context per scene: sessionStorage cannot leak. This is the top determinism risk.
    const { page, context, problems: pageProblems } = await newPage(browser, srv.origin);
    try {
      await page.goto(srv.origin + entryPath, { waitUntil: 'load' });
      await settle(page);

      if (view === 'after') {
        await page.click('#pricetog button[data-pm="after"]');
        await settle(page);
      }
      if (screen !== 'any') {
        await page.click(`.tab[data-tab="${screen}"]`);
        await settle(page);
      }
      for (const s of steps) await applyStep(page, s);

      for (const e of entries) {
        const got = await page.evaluate(extractEntry, e);
        for (const [key, val] of Object.entries(got)) {
          if (key in values && values[key] !== val) {
            problems.push({ type: 'key-collision', key, a: values[key], b: val });
          }
          values[key] = val;
        }
      }
      sceneLog.push({ screen, view, steps, entries: entries.length });
    } catch (err) {
      problems.push({ type: 'scene-error', scene: { screen, view, steps }, text: String(err) });
    } finally {
      problems.push(...pageProblems.map((p) => ({ ...p, scene: { screen, view, steps } })));
      await context.close();
    }
  }

  await browser.close();
  await srv.close();

  /* ---------------------------------------------------------------- report */
  const unresolved = Object.entries(values)
    .filter(([, v]) => v == null)
    .map(([k]) => k);

  const snapshot = {
    parityMapVersion: MAP.$comment ? 'frozen-phase-1' : 'unknown',
    viewport: MAP.viewport,
    keyCount: Object.keys(values).length,
    values: Object.fromEntries(Object.keys(values).sort().map((k) => [k, values[k]])),
  };

  const consoleErrors = problems.filter((p) => p.type === 'console.error' || p.type === 'pageerror');
  const offline = problems.filter((p) => p.type === 'offline-violation');
  const sceneErrors = problems.filter((p) => p.type === 'scene-error');

  console.log(`target        : ${targetArg}`);
  console.log(`scenes        : ${sceneLog.length}`);
  console.log(`keys resolved : ${snapshot.keyCount - unresolved.length} / ${snapshot.keyCount}`);
  console.log(`unresolved    : ${unresolved.length}`);
  console.log(`console errors: ${consoleErrors.length}`);
  console.log(`offline viol. : ${offline.length}`);
  console.log(`scene errors  : ${sceneErrors.length}`);

  if (unresolved.length) {
    console.log('\n--- UNRESOLVED KEYS (a key that does not resolve is a FAILURE, not a pass) ---');
    unresolved.forEach((k) => console.log('  ' + k));
  }
  if (sceneErrors.length) {
    console.log('\n--- SCENE ERRORS ---');
    sceneErrors.forEach((p) => console.log('  ' + JSON.stringify(p.scene) + ' :: ' + p.text));
  }
  if (consoleErrors.length) {
    console.log('\n--- CONSOLE ERRORS ---');
    consoleErrors.forEach((p) => console.log('  ' + p.text));
  }
  if (offline.length) {
    console.log('\n--- OFFLINE VIOLATIONS (network requests attempted) ---');
    [...new Set(offline.map((p) => p.text))].forEach((t) => console.log('  ' + t));
  }

  const warns = problems.filter((p) => p.type === 'console.warn');
  if (warns.length) {
    console.log(`\n--- console.warn (${warns.length}, informational) ---`);
    [...new Set(warns.map((p) => p.text))].slice(0, 20).forEach((t) => console.log('  ' + t));
  }

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, outPath), JSON.stringify(snapshot, null, 1) + '\n');
    console.log(`\nwrote ${outPath}`);
  }

  let exit = 0;
  if (unresolved.length || sceneErrors.length) exit = 1;

  if (diffPath) {
    const base = JSON.parse(fs.readFileSync(path.resolve(ROOT, diffPath), 'utf8'));
    const bv = base.values || base;
    const allKeys = [...new Set([...Object.keys(bv), ...Object.keys(snapshot.values)])].sort();
    const diffs = [];
    for (const k of allKeys) {
      const a = bv[k];
      const b = snapshot.values[k];
      if (a === undefined) diffs.push({ key: k, kind: 'ADDED', baseline: null, current: b });
      else if (b === undefined) diffs.push({ key: k, kind: 'MISSING', baseline: a, current: null });
      else if (a !== b) diffs.push({ key: k, kind: 'CHANGED', baseline: a, current: b });
    }
    console.log(`\n=== PARITY vs ${diffPath} ===`);
    console.log(`baseline keys : ${Object.keys(bv).length}`);
    console.log(`current keys  : ${Object.keys(snapshot.values).length}`);
    console.log(`value diffs   : ${diffs.length}`);
    if (diffs.length) {
      console.log('\n--- DIFFS ---');
      for (const d of diffs.slice(0, 200)) {
        console.log(`  [${d.kind}] ${d.key}\n      baseline: ${JSON.stringify(d.baseline)}\n      current : ${JSON.stringify(d.current)}`);
      }
      if (diffs.length > 200) console.log(`  … +${diffs.length - 200} more`);
      exit = 2;
    } else {
      console.log('  ZERO value diffs.');
    }
  }

  console.log(`\nRESULT: ${exit === 0 ? 'PASS' : 'FAIL'} (exit ${exit})`);
  process.exit(exit);
}

run().catch((e) => {
  console.error('harness error:', e);
  process.exit(3);
});
