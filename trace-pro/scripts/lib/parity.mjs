/**
 * Parity diff engine, shared by scripts/snapshot.mjs (the gate) and scripts/classify-keys.mjs
 * (which self-checks the frozen rename map).
 *
 * The gate splits the 1,020 baseline keys in two:
 *
 *   - STRICT keys (983): the rendered string must be byte-identical to tests/baseline.json.
 *   - DECLARED-LABEL keys (37): the rename table in docs/redesign-spec.md 3.1 deliberately changes
 *     the user-visible vocabulary, so the string legitimately differs. For those keys the expected
 *     new string must be DECLARED, per key, in docs/rename-map.json — and every numeric token in
 *     it must be identical, in order, to the numeric tokens of the baseline string. Words may
 *     change; digits may not. An undeclared relabel is a failure, not a pass.
 *
 * Nothing here mutates parity-map.json, tests/baseline.json or docs/rename-map.json; the map is
 * re-validated against the baseline on every run, so a hand-edit to the map cannot smuggle a
 * figure past the gate.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The digit guard's tokenizer. Exactly as specified by the gate design: every match of the
 * numeric-token regex below, commas stripped, in document order. It is deliberately dumb — it
 * does not know about
 * currency, units or word boundaries — so a figure cannot hide by being reformatted, and two
 * numbers rendered adjacent with no separator read as one token in the baseline and must stay
 * rendered adjacent in the replacement.
 */
export function numericTokens(s) {
  if (s == null) return [];
  return (String(s).match(/-?[\d,]+\.?\d*/g) ?? []).map((t) => t.replace(/,/g, ''));
}

export function sameTokens(a, b) {
  const x = numericTokens(a);
  const y = numericTokens(b);
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

/** Loads docs/rename-map.json if it exists. Returns null when absent (pre-rename repos). */
export function loadRenameMap(root, rel = 'docs/rename-map.json') {
  const p = path.resolve(root, rel);
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw || typeof raw.keys !== 'object') throw new Error(`${rel}: missing "keys" object`);
  return { path: rel, vocabulary: raw.vocabulary ?? {}, keys: raw.keys };
}

/**
 * Re-validates the frozen map against the frozen baseline. Every declared key must exist in the
 * baseline, must quote the baseline string verbatim, and must carry the same numeric tokens.
 * Returns a list of problem strings; empty means the map is sound.
 */
export function validateRenameMap(renameMap, baselineValues) {
  const problems = [];
  if (!renameMap) return problems;
  for (const [key, decl] of Object.entries(renameMap.keys)) {
    if (!decl || typeof decl.expected !== 'string') {
      problems.push(`${key}: no "expected" string declared`);
      continue;
    }
    if (!(key in baselineValues)) {
      problems.push(`${key}: declared in the rename map but absent from the baseline`);
      continue;
    }
    const base = baselineValues[key];
    if (typeof decl.baseline === 'string' && decl.baseline !== base) {
      problems.push(`${key}: declared "baseline" does not match tests/baseline.json`);
    }
    if (!sameTokens(decl.expected, base)) {
      problems.push(
        `${key}: DIGITS CHANGED in the declaration itself — expected tokens ` +
          `[${numericTokens(decl.expected).join(' ')}] vs baseline [${numericTokens(base).join(' ')}]`
      );
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ diff kinds */
export const KIND = {
  added: 'ADDED',
  missing: 'MISSING',
  changed: 'CHANGED',
  undeclared: 'UNDECLARED RELABEL',
  wrongDeclared: 'WRONG DECLARED STRING',
  notRenamed: 'RENAME NOT APPLIED',
  renamedWithoutFlag: 'RENAMED WITHOUT --expect-renamed',
  digits: 'DIGITS CHANGED — a figure moved',
};

const MESSAGE = {
  [KIND.added]: 'key is not in the baseline at all',
  [KIND.missing]: 'baseline key did not resolve in the target',
  [KIND.changed]: 'strict key: the rendered string must be byte-identical to the baseline',
  [KIND.undeclared]:
    'the string changed but every digit survived — an undeclared relabel or a reformat. This key ' +
    'is NOT declared in docs/rename-map.json, so it is strict: revert the wording (and the number ' +
    'formatting), or, only if the rename table sanctions it, declare it in the map.',
  [KIND.wrongDeclared]:
    'declared-label key: the app renders neither the baseline string nor the string declared in ' +
    'docs/rename-map.json. Fix the app, or the declaration — not the digits.',
  [KIND.notRenamed]:
    'declared-label key: the app still renders the ORIGINAL vocabulary. --expect-renamed asserts ' +
    'the rebuilt app, which must render the declared string.',
  [KIND.renamedWithoutFlag]:
    'this run did NOT pass --expect-renamed, yet the target renders the declared NEW string. A ' +
    'legacy-vocabulary run cannot certify the rebuilt app — re-run with --expect-renamed.',
  [KIND.digits]:
    'a numeric token appeared, vanished, moved or changed value. This is a real parity break ' +
    'wearing a relabel as a disguise.',
};

export function explain(kind) {
  return MESSAGE[kind] ?? '';
}

/**
 * Compares a snapshot against the baseline.
 *
 * @param {object}   o
 * @param {object}   o.baseline       baseline values, key -> string
 * @param {object}   o.current        snapshot values, key -> string
 * @param {object?}  o.renameMap      loadRenameMap() result, or null
 * @param {boolean}  o.expectRenamed  true when the target is the REBUILT app
 * @param {string?}  o.only           key-prefix filter (iteration only, never certification)
 */
/**
 * Prints the parity verdict. Returns true when the gate passed.
 *
 * `only` is echoed loudly on every filtered run: a filtered run proves something about one prefix
 * and nothing about the other 1,000 keys, so it must never be mistaken for a certification.
 */
export function printParityReport({ diffPath, result, baselineKeys, currentKeys, only, expectRenamed, hasMap }) {
  const { diffs, strictCount, declaredCount, digitViolations } = result;
  console.log(`\n=== PARITY vs ${diffPath} ===`);
  if (only) console.log(BANNER);
  console.log(`baseline keys : ${baselineKeys}`);
  console.log(`current keys  : ${currentKeys}`);
  if (only) console.log(`--only        : ${only} (${result.comparedKeys} keys compared)`);
  console.log(
    `label basis   : ${
      expectRenamed
        ? 'REBUILT APP — the 37+ declared keys must render docs/rename-map.json'
        : 'ORIGINAL VOCABULARY — declared keys must still render the baseline string'
    }${hasMap ? '' : ' (no docs/rename-map.json found — every key is strict)'}`
  );

  if (diffs.length) {
    console.log('\n--- DIFFS ---');
    for (const d of diffs.slice(0, 200)) {
      console.log(`  [${d.kind}] ${d.key}`);
      console.log(`      baseline: ${JSON.stringify(d.baseline)}`);
      console.log(`      current : ${JSON.stringify(d.current)}`);
      if (d.expected !== undefined) console.log(`      declared: ${JSON.stringify(d.expected)}`);
      const why = explain(d.kind);
      if (why) console.log(`      why     : ${why}`);
    }
    if (diffs.length > 200) console.log(`  … +${diffs.length - 200} more`);
  }

  console.log('\n=== GATE SUMMARY ===');
  console.log(`  ${strictCount} strict keys`);
  console.log(`  ${declaredCount} declared-label keys`);
  console.log(`  ${digitViolations} digit violations`);
  console.log(`  ${diffs.length} diffs`);
  if (!diffs.length) console.log('\n  ZERO value diffs.');
  if (only) console.log('\n' + BANNER);
  return diffs.length === 0;
}

export const BANNER = '*** FILTERED RUN — NOT VALID FOR CERTIFICATION ***';

export function computeDiffs({ baseline, current, renameMap, expectRenamed, only }) {
  const declared = renameMap ? renameMap.keys : {};
  const inScope = (k) => !only || k === only || k.startsWith(only);
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(current)])]
    .filter(inScope)
    .sort();

  const diffs = [];
  let strictCount = 0;
  let declaredCount = 0;
  let digitViolations = 0;
  const push = (key, kind, extra) => {
    if (kind === KIND.digits) digitViolations++;
    diffs.push({ key, kind, baseline: baseline[key] ?? null, current: current[key] ?? null, ...extra });
  };

  for (const key of keys) {
    const a = baseline[key];
    const b = current[key];
    if (a === undefined) {
      push(key, KIND.added);
      continue;
    }
    if (b === undefined) {
      push(key, KIND.missing);
      continue;
    }
    const decl = Object.prototype.hasOwnProperty.call(declared, key) ? declared[key] : null;
    if (!decl) {
      strictCount++;
      if (a !== b) push(key, sameTokens(a, b) ? KIND.undeclared : KIND.digits);
      continue;
    }
    declaredCount++;
    const expected = decl.expected;
    if (!expectRenamed) {
      // Legacy vocabulary asserted: the 37 must still read exactly as the baseline does. This is
      // what lets the ORIGINAL pass unchanged. It is not a licence to skip the rename check —
      // rendering the declared NEW string here is itself a failure, so the flag cannot be
      // dropped to make the rebuilt app's label failures disappear.
      if (b === a) continue;
      if (b === expected) push(key, KIND.renamedWithoutFlag, { expected });
      else push(key, sameTokens(a, b) ? KIND.undeclared : KIND.digits, { expected });
      continue;
    }
    if (!sameTokens(a, b)) {
      push(key, KIND.digits, { expected });
      continue;
    }
    if (b === expected) continue;
    push(key, b === a ? KIND.notRenamed : KIND.wrongDeclared, { expected });
  }

  return { diffs, strictCount, declaredCount, digitViolations, comparedKeys: keys.length };
}
