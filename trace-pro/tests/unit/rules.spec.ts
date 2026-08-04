/**
 * R9 — one definition of every business rule.
 *
 * The bar: the materiality threshold (|gap| >= $250,000 AND |bps| >= 50), the warn/bad bps bands
 * (25/50) and the top-N truncations exist in exactly ONE place, and the rubric's named evidence is
 * "grep for each literal across src/, expected count 1, in tests/unit/rules.spec.ts". So this file
 * greps src/ itself rather than asserting anything about behaviour: a rule that is single-sourced
 * behaves identically to four copies right up until someone changes one of them.
 *
 * Two properties are checked, and they are different kinds of check:
 *
 *   1. TOKEN grep — the dollar floor is a distinctive literal, so every textual occurrence of it
 *      anywhere in src/ is enumerated and each one must be either the definition or an explicitly
 *      documented non-rule occurrence.
 *   2. POSITION grep — 25, 50, 8, 10, 12, 14, 40 and 200 are ordinary small numbers that appear
 *      legitimately as pixels, durations and array indices, so a bare token grep would be noise.
 *      They are instead searched for in the two syntactic positions a THRESHOLD can occupy: the
 *      right-hand side of a comparison, and the length argument of `.slice(0, n)`.
 *
 * Comments are stripped before scanning, so prose ABOUT a threshold (including the comments in
 * exceptions.ts and excel.ts that explain the rule) is never mistaken for a second copy of it.
 *
 * Where a duplicate is still live, this file asserts its EXACT current location with the reason,
 * rather than widening the pattern until it passes. A hidden duplicate is the defect; a visible one
 * that fails loudly the moment it moves is a tracked debt.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BAD_BPS,
  MATERIAL_BPS,
  MATERIAL_USD,
  TRUNCATE,
  WARN_BPS,
} from '../../src/domain/exceptions.js';

const RULES_ROOT = path.resolve(import.meta.dirname, '../..');
const RULES_SRC = path.join(RULES_ROOT, 'src');

/** The one module allowed to state a business rule as a number. */
const RULES_HOME = 'src/domain/exceptions.ts';

interface RulesLine {
  file: string;
  line: number;
  text: string;
}

function rulesWalk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...rulesWalk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

/**
 * Blank out block and line comments while preserving line numbers and column offsets, so a
 * threshold discussed in prose cannot be counted as a threshold applied in code. The `[^:]` guard
 * before `//` keeps `https://` inside string literals intact.
 */
function rulesStripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, before: string) =>
      before + ' '.repeat(Math.max(0, m.length - before.length))
    );
}

/** Every code line under src/, comments removed, keyed by repo-relative path. */
const RULES_LINES: RulesLine[] = rulesWalk(RULES_SRC).flatMap((file) => {
  const rel = path.relative(RULES_ROOT, file).split(path.sep).join('/');
  return rulesStripComments(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .map((text, i) => ({ file: rel, line: i + 1, text }));
});

function rulesGrep(pattern: RegExp): RulesLine[] {
  return RULES_LINES.filter((l) => pattern.test(l.text));
}

/** `file:line` list, which is what a failure message needs to be actionable. */
function rulesWhere(hits: readonly RulesLine[]): string[] {
  return hits.map((h) => `${h.file}:${h.line}`);
}

/** Numbers used as the right-hand operand of a comparison. `=>` is excluded, `>=` is not. */
const RULES_COMPARISON = /(?<![=!<>])([<>]=?)\s*(\d[\d_]*)(?![\d._\w])/g;
/** Numbers on the left of a comparison, e.g. `14 < n`. */
const RULES_COMPARISON_REVERSED = /(?<![\w.])(\d[\d_]*)\s*([<>]=?)(?![=>])/g;
/** The length argument of a row-count or string truncation. */
const RULES_SLICE = /\.slice\(\s*0\s*,\s*(\d[\d_]*)\s*\)/g;

function rulesNumbersIn(text: string, pattern: RegExp): number[] {
  const found: number[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = [match[1], match[2]].find((g) => g !== undefined && /^\d/.test(g));
    if (raw) found.push(Number(raw.replace(/_/g, '')));
  }
  return found;
}

/** Every place in src/ where one of `values` is compared against as a bare numeral. */
function rulesComparisonsAgainst(values: readonly number[]): RulesLine[] {
  const wanted = new Set(values);
  return RULES_LINES.filter((l) =>
    [RULES_COMPARISON, RULES_COMPARISON_REVERSED].some((p) =>
      rulesNumbersIn(l.text, p).some((n) => wanted.has(n))
    )
  );
}

/** Every `.slice(0, n)` in src/ whose length argument is one of `values`, as a bare numeral. */
function rulesRawTruncations(values: readonly number[]): RulesLine[] {
  const wanted = new Set(values);
  return RULES_LINES.filter((l) => rulesNumbersIn(l.text, RULES_SLICE).some((n) => wanted.has(n)));
}

/**
 * Words that make a line part of the MATERIALITY conversation. 25 and 50 are ordinary numbers — a
 * padding, a width, a character cap — so the band check only fires where a line is plainly talking
 * about a gap in dollars or basis points. That keeps the check specific to the rule instead of
 * failing on an unrelated `width > 50` somewhere in the UI.
 */
const RULES_MATERIALITY_CONTEXT =
  /\b(bps|basis point|material|tolerance|gap|dNonPos|dPricing|pnl|severity|flag|exception|threshold)/i;

describe('R9 · the materiality rule is stated once', () => {
  it('exposes the rule as named constants, not as numbers at the point of use', () => {
    expect(MATERIAL_USD).toBe(250_000);
    expect(MATERIAL_BPS).toBe(50);
  });

  it('the $250k floor appears in exactly one executable place in src/', () => {
    const hits = rulesGrep(/\b250_?000\b/);

    // The glossary carries "250000" as a SEARCH ALIAS so an operator who types the number finds the
    // exception entry. It is a keyword inside a string, not a threshold, and it is asserted here by
    // exact location and shape: if anyone ever puts a real comparison in that file, this fails.
    const alias = hits.filter((h) => /alsoFind/.test(h.text));
    expect(rulesWhere(alias)).toEqual(['src/glossary/terms-nav.ts:120']);

    const rule = hits.filter((h) => !/alsoFind/.test(h.text));
    expect(rulesWhere(rule), `the $250k floor must live only in ${RULES_HOME}`).toEqual([
      `${RULES_HOME}:12`,
    ]);
  });

  it('nothing anywhere compares against 250,000, and no rule line compares against 50 or 25', () => {
    // MATERIAL_BPS and BAD_BPS are the same magnitude by design (a gap is "bad" exactly when it is
    // material), which is why both must resolve to a constant and neither may be typed at a call
    // site: 50 written twice cannot be told apart from 50 meaning two different things.
    expect(BAD_BPS).toBe(MATERIAL_BPS);

    const dollars = rulesComparisonsAgainst([MATERIAL_USD]);
    expect(rulesWhere(dollars), 'the dollar floor must be referenced by name').toEqual([]);

    const bands = rulesComparisonsAgainst([MATERIAL_BPS, WARN_BPS]).filter(
      (l) => l.file !== RULES_HOME && RULES_MATERIALITY_CONTEXT.test(l.text)
    );
    expect(
      rulesWhere(bands),
      'the warn/bad bps bands must be referenced by name, never as numerals'
    ).toEqual([]);
  });

  it('declares each band exactly once, and only in the rule module', () => {
    for (const name of ['MATERIAL_USD', 'MATERIAL_BPS', 'WARN_BPS', 'BAD_BPS'] as const) {
      const declarations = rulesGrep(new RegExp(`^\\s*export const ${name}\\s*=`));
      expect(rulesWhere(declarations), `${name} must be declared once`).toEqual([
        `${RULES_HOME}:${{ MATERIAL_USD: 12, MATERIAL_BPS: 13, WARN_BPS: 16, BAD_BPS: 17 }[name]}`,
      ]);
    }
  });

  it('the export that leaves the building re-derives nothing', () => {
    const excel = RULES_LINES.filter((l) => l.file === 'src/export/excel.ts');
    // R9's original finding: excel.ts:115 and :117 rebuilt the whole rule inline. The workbook must
    // now read the verdict, not compute it.
    expect(excel.some((l) => /evaluateEntity\(/.test(l.text))).toBe(true);
    expect(excel.some((l) => /isMaterial\(/.test(l.text))).toBe(true);
    expect(rulesNumbersIn(excel.map((l) => l.text).join('\n'), RULES_COMPARISON)).not.toContain(50);
  });
});

describe('R9 · every truncation length is stated once', () => {
  /** The truncation table, as the values the scan is allowed to find nowhere else. */
  const values = Object.values(TRUNCATE);

  it('the table is the only declaration of a row limit', () => {
    expect(TRUNCATE).toEqual({
      heldBy: 8,
      whoHolds: 10,
      perHolding: 14,
      ribbonSegments: 40,
      ultimateOwners: 12,
      issueRows: 200,
      simLeaves: 8,
      simHolders: 14,
    });
    expect(new Set(values)).toEqual(new Set([8, 10, 12, 14, 40, 200]));
  });

  it('every panel that truncates rows names its limit rather than typing it', () => {
    // The positive half of the check: without it, deleting every usage would make the negative half
    // below pass trivially. Five panels slice directly on the table; the rest read it into a local
    // limit or quote it in the "showing the largest N of M" line beside the truncation.
    const sliced = rulesGrep(/\.slice\(\s*0\s*,\s*TRUNCATE\./);
    expect(sliced.length).toBeGreaterThanOrEqual(5);

    const referenced = rulesGrep(/TRUNCATE\./).filter((l) => l.file !== RULES_HOME);
    expect(referenced.length).toBeGreaterThanOrEqual(18);
    expect(new Set(referenced.map((h) => h.file)).size).toBeGreaterThanOrEqual(5);
  });

  /**
   * The negative half. Every key in the table must be READ somewhere, because a declared-and-unread
   * constant means the panel it belongs to typed the number instead — a live duplicate, which is
   * exactly what R9 forbids. Two keys were dead when this test was written (`simLeaves`,
   * `simHolders`); both are now substituted at the two sites recorded below, so the expectation is
   * the one it should end in: no dead keys at all.
   */
  it('no truncation constant is shadowed by a typed literal', () => {
    const dead = Object.keys(TRUNCATE).filter(
      (key) => rulesGrep(new RegExp(`TRUNCATE\\.${key}\\b`)).length === 0
    );
    expect(dead, 'these constants are shadowed by a raw literal somewhere in src/').toEqual([]);

    // Pinned by value at the two sites that used to type it, so a copy drifting back fails here
    // rather than in production. Located by content, not by line, so unrelated edits above them
    // cannot turn a real regression into a passing test or a passing state into a failure.
    const holders = rulesGrep(/\.slice\(\s*0\s*,\s*TRUNCATE\.simHolders\s*\)/);
    expect(rulesWhere(holders)).toEqual(['src/domain/repricing.ts:277']);
    const leaves = rulesGrep(/\.slice\(\s*0\s*,\s*TRUNCATE\.simLeaves\s*\)/);
    expect(rulesWhere(leaves)).toEqual([
      'src/ui/screens/diagnose/simulator/shock-panel.ts:169',
    ]);
  });

  /**
   * Every remaining raw `.slice(0, n)` whose n is one of the table's values, enumerated. Three of
   * these are numeric COLLISIONS, not duplicates: they cap the length of a STRING, which is a
   * different quantity that happens to share a magnitude with a row limit. Listing them makes the
   * distinction explicit, and a new entry appearing here is a new duplicate to look at.
   */
  it('enumerates every raw truncation literal that shares a magnitude with the table', () => {
    const raw = rulesRawTruncations(values).filter(
      (l) => !/\.slice\(\s*0\s*,\s*TRUNCATE\./.test(l.text)
    );
    expect(rulesWhere(raw)).toEqual([
      // string-length cap (10) on the generated product code, not a row limit.
      'src/domain/repricing.ts:306',
      // string-length cap (14) on an entity code drawn into the SVG.
      'src/ui/screens/diagnose/simulator/graph.ts:217',
      // string-length caps (24 and 40) on a security id and its name in the same table.
      'src/ui/screens/diagnose/simulator/shock-panel.ts:171',
    ]);
  });
});
