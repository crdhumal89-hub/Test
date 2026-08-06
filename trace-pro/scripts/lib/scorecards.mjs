/**
 * UX-CRITIC scorecard discovery and grading, for the Phase 3 evidence pack.
 *
 * There is more than one scorecard. The first pass (`docs/ux-scorecard.md`, 5 PASS / 13 FAIL) was
 * followed by a second independent pass (`docs/ux-scorecard-2.md`, 15 PASS / 3 FAIL), and a third
 * may follow. The pack used to read the first filename literally, so it reported a superseded grade
 * while claiming every figure in it had been collected mechanically.
 *
 * So: discover every `docs/ux-scorecard*.md`, parse each one's own Result table, and let the MOST
 * RECENT BY GIT COMMIT DATE drive the verdict. Every scorecard found is rendered as a row, so the
 * history stays visible instead of being overwritten, and a scorecard whose counts cannot be parsed
 * is reported as unparsed rather than silently dropped.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { table } from './md.mjs';

const DOCS = 'docs';
const SCORECARD_RE = /^ux-scorecard.*\.md$/;

/**
 * PASS/FAIL counts from a scorecard's own Result table. Patterns are tried in order, widest bar
 * first; the count is whatever the scorecard itself printed, never inferred from the criteria rows.
 */
const COUNT_PATTERNS = [
  // A Result-table row, anchored at the start of a line so a per-criterion score cell (`| R1 | … |
  // **PASS** | …`) can never be mistaken for the summary count.
  (label) => new RegExp('^\\|\\s*\\*\\*' + label + '\\*\\*\\s*\\|\\s*\\*\\*(\\d+)\\*\\*([^|\\n]*)', 'm'),
  (label) => new RegExp('^\\|\\s*' + label + '\\s*\\|\\s*(\\d+)([^|\\n]*)', 'm'),
  (label) => new RegExp(label + '\\s*[:=]\\s*(\\d+)([^\\n]*)'),
];

function count(text, label) {
  for (const build of COUNT_PATTERNS) {
    const m = build(label).exec(text);
    if (m) return { n: Number(m[1]), detail: (m[2] ?? '').replace(/^[\s—–-]+/, '').trim() };
  }
  return null;
}

/** Unix seconds of the last commit that touched `rel`, or null when git has no record of it. */
function commitEpoch(root, rel) {
  const res = spawnSync('git', ['log', '-1', '--format=%ct', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  const raw = (res.stdout ?? '').trim();
  return res.status === 0 && /^\d+$/.test(raw) ? Number(raw) : null;
}

function stamp(epoch) {
  return new Date(epoch * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Number of criteria the frozen rubric defines, counted from its own `### Rn —` headings. */
export function rubricCriteria(root) {
  const path = join(root, DOCS, 'ux-rubric.md');
  if (!existsSync(path)) return null;
  const ids = new Set(
    [...readFileSync(path, 'utf8').matchAll(/^#{2,4}\s*R(\d+)\b/gm)].map((m) => m[1])
  );
  return ids.size || null;
}

/**
 * Every scorecard in docs/, newest first. Never a hardcoded filename: a `docs/ux-scorecard-3.md`
 * added later is picked up with no edit to this file or to the pack.
 */
export function discoverScorecards(root) {
  const dir = join(root, DOCS);
  if (!existsSync(dir)) return [];
  const found = readdirSync(dir)
    .filter((name) => SCORECARD_RE.test(name))
    .sort()
    .map((name) => {
      const rel = DOCS + '/' + name;
      const text = readFileSync(join(dir, name), 'utf8');
      const pass = count(text, 'PASS');
      const fail = count(text, 'FAIL');
      const epoch = commitEpoch(root, rel);
      return {
        rel,
        pass: pass?.n ?? null,
        fail: fail?.n ?? null,
        failDetail: fail?.detail ?? '',
        parsed: pass != null && fail != null,
        epoch: epoch ?? Math.floor(statSync(join(dir, name)).mtimeMs / 1000),
        dated: epoch != null ? 'git commit' : 'file mtime, uncommitted',
      };
    });
  // Newest first. Two scorecards committed together tie on epoch, so the pass number in the
  // filename breaks the tie — `ux-scorecard-2.md` is a later pass than `ux-scorecard.md`.
  return found.sort((a, b) => b.epoch - a.epoch || passNumber(b) - passNumber(a));
}

/** Pass number encoded in a scorecard's filename; the unsuffixed first pass is 1. */
function passNumber(card) {
  const m = /-(\d+)\.md$/.exec(card.rel);
  return m ? Number(m[1]) : 1;
}

/**
 * The UX CRITIC section of the pack: one row per scorecard, the verdict taken from the most recent.
 * Returns an array of markdown lines.
 */
export function uxCriticSection(root) {
  const cards = discoverScorecards(root);
  const criteria = rubricCriteria(root);
  const rubric = 'against `docs/ux-rubric.md`' + (criteria ? ' (' + criteria + ' criteria, frozen at Phase 0)' : '');
  if (cards.length === 0) {
    return ['No `docs/ux-scorecard*.md` exists, so this script has no graded scorecard to report ' + rubric + '.'];
  }

  const driver = cards[0];
  const lines = [
    cards.length + ' scorecard(s) discovered by globbing `docs/ux-scorecard*.md`, graded ' + rubric + '.',
    'Each row is that file\'s own Result table, parsed by `scripts/lib/scorecards.mjs`; the ordering is',
    'by `git log -1 --format=%ct -- <file>`, newest first.',
    '',
    table([
      ['Scorecard', 'Dated', 'Date basis', 'PASS', 'FAIL', 'Failing criteria', 'Role'],
      ['---', '---', '---', '---', '---', '---', '---'],
      ...cards.map((c) => [
        '`' + c.rel + '`',
        stamp(c.epoch),
        c.dated,
        c.parsed ? String(c.pass) : '**unparsed**',
        c.parsed ? String(c.fail) : '**unparsed**',
        c.parsed ? c.failDetail || '—' : 'counts not found in this file',
        c === driver ? '**drives the verdict (most recent)**' : 'superseded',
      ]),
    ]),
    '',
  ];

  if (!driver.parsed) {
    lines.push(
      '**UX CRITIC verdict: UNKNOWN.** The most recent scorecard, `' + driver.rel + '`, does not contain a',
      'Result table this script can parse, so no count is reported for it above and none is asserted here.',
      'Read that file directly. A shape this script does not recognise is a gap in the evidence, not a pass.'
    );
  } else {
    lines.push(
      '**UX CRITIC verdict: ' + (driver.fail === 0 ? 'GREEN' : 'RED') + '** — `' + driver.rel + '` is the most',
      'recent scorecard by git commit date (' + stamp(driver.epoch) + ') and it records **' + driver.pass +
        ' PASS / ' + driver.fail + ' FAIL**.',
      'The rubric\'s own rule is that the gate passes only when all ' + (criteria ?? 18) + ' criteria pass with',
      driver.fail === 0
        ? 'cited evidence, and this scorecard records no FAIL, so the sub-gate is GREEN on its own terms.'
        : 'cited evidence, so the non-zero FAIL count means this sub-gate is RED regardless of the test suites.'
    );
    if (criteria && driver.pass + driver.fail !== criteria) {
      lines.push(
        '',
        'Note: ' + driver.pass + ' + ' + driver.fail + ' = ' + (driver.pass + driver.fail) + ', which does not' +
          ' equal the rubric\'s ' + criteria + ' criteria. One of the two files disagrees with the other; this',
        'script reports the discrepancy rather than reconciling it.'
      );
    }
  }

  const superseded = cards.slice(1).filter((c) => c.parsed);
  if (superseded.length) {
    lines.push(
      '',
      'Superseded, kept so the history is legible: ' +
        superseded.map((c) => '`' + c.rel + '` (' + c.pass + ' PASS / ' + c.fail + ' FAIL)').join(', ') + '.'
    );
  }
  return lines;
}
