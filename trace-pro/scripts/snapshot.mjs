/**
 * TRACE-Pro parity harness.
 *
 *   node scripts/snapshot.mjs --target reference/TRACE-Pro-original.html [--out FILE]
 *   node scripts/snapshot.mjs --target reference/TRACE-Pro-original.html --diff tests/baseline.json
 *   node scripts/snapshot.mjs --target dist/ --diff tests/baseline.json --expect-renamed
 *   node scripts/snapshot.mjs --target dist/ --diff tests/baseline.json --only reconciliation.
 *
 * Loads a target, visits all 7 screens, runs the documented default interactions, and writes
 * every key in parity-map.json with its rendered string.
 *
 * The gate is in two parts (see scripts/lib/parity.mjs). Most keys must be byte-identical to
 * tests/baseline.json. The keys the rename table touches must instead render the string DECLARED
 * for them in docs/rename-map.json, and every numeric token in that string must match the
 * baseline's, in order — words may change, digits may not. `--expect-renamed` says which
 * vocabulary this run asserts; it defaults to the ORIGINAL's, so the original still passes, and
 * omitting it on the rebuilt app fails rather than skips.
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
import { extractEntry } from './lib/extract.mjs';
import { applyStep, selectScreen, selectView } from './lib/steps.mjs';
import { BANNER, computeDiffs, loadRenameMap, printParityReport, validateRenameMap } from './lib/parity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const targetArg = arg('target');
if (!targetArg) {
  console.error(
    'usage: node scripts/snapshot.mjs --target <file|dir> [--diff baseline.json] [--out file]\n' +
      '                                [--expect-renamed] [--only <key-prefix>]\n\n' +
      '  --expect-renamed  assert the REBUILT vocabulary: the declared-label keys of\n' +
      '                    docs/rename-map.json must render their declared string. Off by default,\n' +
      '                    so the original passes, because for the original the labels ARE the\n' +
      '                    baseline. Dropping the flag does not disable the check — it inverts it.\n' +
      '  --only <prefix>   extract and diff only keys under <prefix>. For iteration only; the run\n' +
      '                    is stamped NOT VALID FOR CERTIFICATION.'
  );
  process.exit(3);
}
const diffPath = arg('diff');
const outPath = arg('out');
const only = arg('only');
const expectRenamed = process.argv.includes('--expect-renamed');

const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity-map.json'), 'utf8'));

/**
 * Entries that can emit a key under `prefix`. Prunes scenes so an iteration run is fast; the diff
 * is filtered independently, so pruning can only ever remove work, never change a verdict.
 */
function entriesUnder(entries, prefix) {
  if (!prefix) return entries;
  const out = [];
  for (const e of entries) {
    if (e.type === 'single' || e.type === 'count') {
      const keys = Object.fromEntries(Object.entries(e.keys).filter(([k]) => k.startsWith(prefix)));
      if (Object.keys(keys).length) out.push({ ...e, keys });
    } else if (e.keyPrefix && (e.keyPrefix.startsWith(prefix) || prefix.startsWith(e.keyPrefix))) {
      out.push(e);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ target resolution */
const absTarget = path.resolve(ROOT, targetArg);
if (!fs.existsSync(absTarget)) {
  console.error('target does not exist: ' + absTarget);
  process.exit(3);
}
const isDir = fs.statSync(absTarget).isDirectory();
const serveRoot = isDir ? absTarget : path.dirname(absTarget);
const entryPath = isDir ? '/index.html' : '/' + path.basename(absTarget);


/* ------------------------------------------------------------------ scenes */
/** A scene is one (screen, view, steps) triple; entries sharing a scene are extracted together. */
function sceneKeyOf(e) {
  return JSON.stringify([e.screen || 'any', e.view || 'before', e.steps || []]);
}

async function run() {
  const srv = await serve(serveRoot);
  const browser = await launch();

  const scenes = new Map();
  for (const e of entriesUnder(MAP.entries, only)) {
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

      await selectView(page, view);
      await selectScreen(page, screen);
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

  if (only) console.log(BANNER);
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
    const renameMap = loadRenameMap(ROOT);

    // The frozen map is re-validated against the frozen baseline on every run, so an edit to the
    // map cannot quietly redefine what a figure is: a declaration whose digits do not match the
    // baseline's fails here, before any value is compared.
    const mapProblems = validateRenameMap(renameMap, bv);
    if (mapProblems.length) {
      console.log('\n--- docs/rename-map.json IS INVALID (gate cannot run) ---');
      mapProblems.forEach((p) => console.log('  ' + p));
      exit = 2;
    }

    const result = computeDiffs({
      baseline: bv,
      current: snapshot.values,
      renameMap,
      expectRenamed,
      only,
    });
    const passed = printParityReport({
      diffPath,
      result,
      baselineKeys: Object.keys(bv).length,
      currentKeys: Object.keys(snapshot.values).length,
      only,
      expectRenamed,
      hasMap: !!renameMap,
    });
    if (!passed) exit = 2;
  }

  console.log(`\nRESULT: ${exit === 0 ? 'PASS' : 'FAIL'} (exit ${exit})`);
  process.exit(exit);
}

run().catch((e) => {
  console.error('harness error:', e);
  process.exit(3);
});
