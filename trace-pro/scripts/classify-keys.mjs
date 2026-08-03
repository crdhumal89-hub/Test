/**
 * Classifies every key in the frozen tests/baseline.json, finds the label keys the rename table
 * touches, and self-checks docs/rename-map.json against them.
 *
 *   node scripts/classify-keys.mjs            # report + self-check
 *   node scripts/classify-keys.mjs --json OUT # also write the machine-readable classification
 *
 * Why this exists: the rebuild deliberately renames user-visible vocabulary, so a naive byte-diff
 * of all 1,020 keys would force the rebuild to keep the original's cryptic labels. The gate
 * therefore needs to know EXACTLY which keys carry renamed text — no more, no fewer. This script
 * derives that set from the baseline itself rather than from anybody's memory, and asserts that
 * every declared replacement preserves every digit.
 *
 * Reads only. tests/baseline.json, parity-map.json and docs/rename-map.json are frozen.
 *
 * Exit codes: 0 all checks pass. 1 a check failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { numericTokens, loadRenameMap, validateRenameMap } from './lib/parity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

/* ------------------------------------------------------------------ expectations
 * These are the numbers Phase 1 observed. They are asserted, not printed and trusted, so that a
 * future edit to the baseline (or to this classifier) cannot silently move the boundary between
 * "a figure the rebuild must reproduce to the byte" and "a label the rebuild may rename".
 */
const EXPECT = { figure: 728, empty: 14, text: 278, renamed: 50, glossary: 12, declared: 38 };

/* ------------------------------------------------------------------ classification
 * A `figure` is a string that carries a number and nothing else: no prose, no vocabulary, so no
 * rename can touch it. Each pattern below is listed with a baseline value it exists to cover.
 */
const FIGURE_PATTERNS = [
  // Count / currency / percent / bps / multiplier, optional sign, parenthesised negative,
  // thousands separators, decimals:  "58"  "1.9"  "$2,062,198,836"  "22.6%"  "+1.9 bps"
  // "($2,356,271)"  "-195.3"  "1.4x"
  /^\(?[-+]?\$?-?[\d,]+(?:\.\d+)?\)?(?:\s*(?:%|bps|x|×))?$/,
  // Compact currency with a magnitude suffix:  "$2.06bn"  (simulator.product_nav)
  /^[-+]?\$?[\d,]+(?:\.\d+)?(?:k|mm|bn|tn)$/,
  // A bps chip whose unit annotation includes the word "gap":  "+10 bps gap"
  // (pricing.bridge.gap_bps) — still a bare figure plus its unit, with no renamable vocabulary.
  /^[-+]?[\d,]+(?:\.\d+)?\s*bps(?:\s*gap)?$/,
  // An ISO as-of date: numeric, and no word in it can be renamed:  "2026-06-30"  (chrome.asof)
  /^\d{4}-\d{2}-\d{2}$/,
];

function classify(value) {
  if (value === '') return 'empty';
  if (FIGURE_PATTERNS.some((re) => re.test(value))) return 'figure';
  return 'text';
}

/* ------------------------------------------------------------------ renamed vocabulary
 * The terms docs/redesign-spec.md 3.1 retires. Case-sensitive on purpose: "Applied" catches the
 * "Applied px" / "Applied %" column labels, and lower-case prose such as "applied" in a glossary
 * sentence is not a label.
 */
const RENAMED_TERMS = [
  'Derived MV',
  'Revised MV',
  'Publish px',
  'Current px',
  'Revised px',
  'Repricing P&L',
  'Immediate %',
  'Applied',
  'Δ Pricing',
  'Δ Non-position',
  'Repriced MV',
  'mv100',
  'apex',
  'terminal',
  'in tol',
  'no NAV',
];

/**
 * glossary.* keeps the ORIGINAL vocabulary by design: the glossary is where a controller looks up
 * what the retired term meant, so it must keep saying it. Those keys therefore need no rename
 * entry and stay strict.
 */
const KEEPS_ORIGINAL_VOCABULARY = (key) => key.startsWith('glossary.');

/* ------------------------------------------------------------------ run */
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/baseline.json'), 'utf8'));
const values = baseline.values ?? baseline;
const entries = Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const buckets = { figure: [], empty: [], text: [] };
for (const [key, value] of entries) buckets[classify(value)].push([key, value]);

const withRenamedTerm = buckets.text
  .map(([key, value]) => [key, value, RENAMED_TERMS.filter((t) => value.includes(t))])
  .filter(([, , hits]) => hits.length > 0);
const glossaryHits = withRenamedTerm.filter(([key]) => KEEPS_ORIGINAL_VOCABULARY(key));
const mustDeclare = withRenamedTerm.filter(([key]) => !KEEPS_ORIGINAL_VOCABULARY(key));

const failures = [];
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failures.push(`${label}: got ${got}, expected ${want}`);
  return ok ? 'ok' : `MISMATCH (expected ${want})`;
};

console.log(`baseline      : tests/baseline.json — ${entries.length} keys`);
console.log(`figures       : ${buckets.figure.length}  ${check('figures', buckets.figure.length, EXPECT.figure)}`);
console.log(`empty         : ${buckets.empty.length}  ${check('empty', buckets.empty.length, EXPECT.empty)}`);
console.log(`text          : ${buckets.text.length}  ${check('text', buckets.text.length, EXPECT.text)}`);
console.log(
  `renamed terms : ${withRenamedTerm.length} text keys  ${check('renamed', withRenamedTerm.length, EXPECT.renamed)}`
);
console.log(
  `  glossary.*  : ${glossaryHits.length} — keep the original vocabulary, NO rename entry  ` +
    `${check('glossary', glossaryHits.length, EXPECT.glossary)}`
);
console.log(
  `  to declare  : ${mustDeclare.length} — must appear in docs/rename-map.json  ` +
    `${check('declared', mustDeclare.length, EXPECT.declared)}`
);

console.log('\n--- per-term incidence (outside glossary.*) ---');
for (const term of RENAMED_TERMS) {
  const n = mustDeclare.filter(([, v]) => v.includes(term)).length;
  console.log(`  ${term.padEnd(16)} ${String(n).padStart(2)}`);
}

console.log(`\n--- THE ${mustDeclare.length} DECLARED-LABEL KEYS (baseline values) ---`);
mustDeclare.forEach(([key, value, hits], i) => {
  console.log(`${String(i + 1).padStart(3)}. ${key}`);
  console.log(`     terms   : ${hits.join(', ')}`);
  console.log(`     baseline: ${JSON.stringify(value)}`);
});

console.log('\n--- glossary.* keys that mention a retired term (intentionally NOT renamed) ---');
glossaryHits.forEach(([key, , hits]) => console.log(`  ${key}  [${hits.join(', ')}]`));

/* ------------------------------------------------------------------ rename-map self-check */
console.log('\n=== docs/rename-map.json SELF-CHECK ===');
const renameMap = loadRenameMap(ROOT);
if (!renameMap) {
  failures.push('docs/rename-map.json is missing');
  console.log('  FAIL — docs/rename-map.json not found');
} else {
  const declaredKeys = Object.keys(renameMap.keys);
  const expectedKeys = new Set(mustDeclare.map(([k]) => k));
  const missing = [...expectedKeys].filter((k) => !declaredKeys.includes(k));
  const extra = declaredKeys.filter((k) => !expectedKeys.has(k));

  console.log(`  entries        : ${declaredKeys.length}  ${check('rename-map entries', declaredKeys.length, EXPECT.declared)}`);
  console.log(`  vocabulary     : ${Object.keys(renameMap.vocabulary).length} term(s) declared`);
  if (missing.length) {
    failures.push(`rename map is missing ${missing.length} key(s)`);
    missing.forEach((k) => console.log(`  MISSING        : ${k}`));
  }
  if (extra.length) {
    failures.push(`rename map declares ${extra.length} key(s) that carry no renamed term`);
    extra.forEach((k) => console.log(`  NOT A LABEL KEY: ${k}`));
  }

  const mapProblems = validateRenameMap(renameMap, values);
  if (mapProblems.length) {
    failures.push(`${mapProblems.length} rename-map declaration problem(s)`);
    mapProblems.forEach((p) => console.log(`  BAD DECLARATION: ${p}`));
  }

  // The digit guard, asserted here so it is proven before any browser run.
  let digitOk = 0;
  const digitBad = [];
  for (const [key, decl] of Object.entries(renameMap.keys)) {
    const base = values[key];
    const a = numericTokens(base).join(' ');
    const b = numericTokens(decl.expected).join(' ');
    if (a === b) digitOk++;
    else digitBad.push({ key, a, b });
  }
  console.log(`  digit guard    : ${digitOk}/${declaredKeys.length} declarations preserve every numeric token, in order`);
  digitBad.forEach((d) => console.log(`  DIGITS CHANGED : ${d.key}\n      baseline tokens: [${d.a}]\n      expected tokens: [${d.b}]`));
  if (digitBad.length) failures.push(`${digitBad.length} declaration(s) change a figure`);

  // Every replacement must actually be a replacement, and must not smuggle a retired term back in.
  const unchanged = Object.entries(renameMap.keys).filter(([k, d]) => d.expected === values[k]);
  if (unchanged.length) {
    failures.push(`${unchanged.length} declaration(s) are identical to the baseline`);
    unchanged.forEach(([k]) => console.log(`  NOT A RENAME   : ${k}`));
  }

  console.log('\n  --- declared replacements ---');
  Object.entries(renameMap.keys).forEach(([key, decl], i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${key}`);
    console.log(`       was: ${JSON.stringify(values[key])}`);
    console.log(`       now: ${JSON.stringify(decl.expected)}`);
  });
}

const jsonOut = arg('json');
if (jsonOut) {
  const payload = {
    keyCount: entries.length,
    counts: {
      figure: buckets.figure.length,
      empty: buckets.empty.length,
      text: buckets.text.length,
      renamedTerms: withRenamedTerm.length,
      glossaryKeepsOriginal: glossaryHits.length,
      mustDeclare: mustDeclare.length,
    },
    classification: Object.fromEntries(entries.map(([k, v]) => [k, classify(v)])),
    declaredLabelKeys: mustDeclare.map(([k, v, hits]) => ({ key: k, baseline: v, terms: hits })),
    glossaryLabelKeys: glossaryHits.map(([k]) => k),
  };
  fs.mkdirSync(path.dirname(path.resolve(ROOT, jsonOut)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(payload, null, 1) + '\n');
  console.log(`\nwrote ${jsonOut}`);
}

console.log('');
if (failures.length) {
  failures.forEach((f) => console.log('  FAIL  ' + f));
  console.log(`\nRESULT: FAIL (${failures.length} check(s) failed)`);
  process.exit(1);
}
console.log(
  `RESULT: PASS — ${buckets.figure.length} figures / ${buckets.empty.length} empty / ${buckets.text.length} text; ` +
    `${mustDeclare.length} declared-label keys, all ${mustDeclare.length} digit-guarded`
);
