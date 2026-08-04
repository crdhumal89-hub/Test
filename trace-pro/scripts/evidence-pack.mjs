/**
 * Phase 3 evidence pack.
 *
 * Runs the four sub-gates in one pass, captures each one's output VERBATIM to
 * `docs/evidence/gate/<slug>.txt`, and assembles `docs/evidence/PHASE3.md` from what it observed.
 *
 * The point of this script is that the evidence pack cannot claim a pass I did not see. Every row
 * in the summary table is an exit code this process collected from a child process; the overall
 * verdict is `codes.every(c => c === 0)` and nothing else. There is no flag to force a pass, no
 * "expected" list to compare against, and the markdown is written whether the gate is green or red —
 * a red pack is the deliverable when the gate is red.
 *
 *   node scripts/evidence-pack.mjs            # run every gate, write the pack
 *   node scripts/evidence-pack.mjs --reuse    # re-assemble from logs already in docs/evidence/gate
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE_DIR = join(ROOT, 'docs/evidence/gate');
const PACK = join(ROOT, 'docs/evidence/PHASE3.md');
const REUSE = process.argv.includes('--reuse');

/**
 * The gate, as four named sub-gates. The order is the mission's: nothing downstream is worth
 * running if the build does not compile, and parity is checked against the `dist/` the build made.
 */
const GATES = [
  { slug: 'static-build', gate: 'STATIC', title: 'Build', cmd: 'npm', args: ['run', 'build'] },
  { slug: 'static-typecheck', gate: 'STATIC', title: 'Typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { slug: 'static-lint', gate: 'STATIC', title: 'Lint + structure limits + fixtures', cmd: 'npm', args: ['run', 'lint'] },
  { slug: 'static-keys', gate: 'STATIC', title: 'Parity key classification', cmd: 'npm', args: ['run', 'keys:classify'] },
  { slug: 'unit', gate: 'UNIT', title: 'Unit tests (domain)', cmd: 'npm', args: ['test'] },
  { slug: 'e2e', gate: 'UX CRITIC', title: 'Headless suite (Playwright)', cmd: 'npx', args: ['playwright', 'test'] },
  {
    slug: 'parity',
    gate: 'PARITY',
    title: 'Semantic parity vs frozen baseline',
    cmd: 'node',
    args: ['scripts/snapshot.mjs', '--target', 'dist/', '--diff', 'tests/baseline.json', '--expect-renamed'],
  },
];

function logPath(slug) {
  return join(GATE_DIR, slug + '.txt');
}

/** Run one sub-gate, streaming nothing but recording everything. Returns {code, output}. */
function run(step) {
  const started = process.hrtime.bigint();
  const res = spawnSync(step.cmd, step.args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  const output = (res.stdout ?? '') + (res.stderr ?? '');
  const code = res.status ?? (res.error ? 127 : 1);
  const header =
    `$ ${step.cmd} ${step.args.join(' ')}\n` +
    `# sub-gate: ${step.gate} — ${step.title}\n` +
    `# exit code: ${code}\n` +
    '# ' + '-'.repeat(76) + '\n';
  writeFileSync(logPath(step.slug), header + output + (res.error ? `\n[spawn error] ${res.error.message}\n` : ''));
  return { code, output, seconds };
}

/** Read a log back when --reuse, so the pack can be re-assembled without re-running an hour of tests. */
function reuse(step) {
  const path = logPath(step.slug);
  if (!existsSync(path)) return { code: null, output: '', seconds: null };
  const text = readFileSync(path, 'utf8');
  const m = /^# exit code: (\d+)$/m.exec(text);
  return { code: m ? Number(m[1]) : null, output: text, seconds: null };
}

/**
 * Pull the parity harness's own summary line out of its output rather than restating it. If the
 * shape of that line ever changes this returns null and the pack says so — it does not guess.
 */
function parityFacts(output) {
  // The harness prints `keys resolved : 1020 / 1020`, with the word `keys` BEFORE the numbers.
  // The first version of this regex expected it after, matched nothing, and the pack rendered
  // "? / ?" — a missing figure rather than a wrong one, but still a gap in the evidence.
  const keys =
    /keys\s+resolved\s*:\s*(\d+)\s*\/\s*(\d+)/i.exec(output) ??
    /(\d+)\s*\/\s*(\d+)\s+keys/.exec(output);
  const unresolved = /unresolved\s*:\s*(\d+)/i.exec(output);
  const diffs = /(\d+)\s+diffs?/.exec(output);
  const digits = /(\d+)\s+digit violations?/.exec(output);
  const strict = /(\d+)\s+strict/.exec(output);
  const relabel = /(\d+)\s+declared[- ]label/.exec(output);
  const verdict = /RESULT:\s*(PASS|FAIL)/.exec(output);
  if (!keys && !verdict) return null;
  return {
    resolved: keys ? Number(keys[1]) : null,
    total: keys ? Number(keys[2]) : null,
    diffs: diffs ? Number(diffs[1]) : null,
    digits: digits ? Number(digits[1]) : null,
    strict: strict ? Number(strict[1]) : null,
    relabelled: relabel ? Number(relabel[1]) : null,
    unresolved: unresolved ? Number(unresolved[1]) : null,
    verdict: verdict ? verdict[1] : null,
  };
}

/** Test counts, read from the runners' own summary lines. */
function testFacts(output) {
  const vitest = /Tests\s+(\d+) passed(?:\s*\|\s*(\d+) failed)?/.exec(output);
  const pw = /(\d+) passed/.exec(output);
  const pwFailed = /(\d+) failed/.exec(output);
  return {
    passed: vitest ? Number(vitest[1]) : pw ? Number(pw[1]) : null,
    failed: vitest ? Number(vitest[2] ?? 0) : pwFailed ? Number(pwFailed[1]) : null,
  };
}

/** Every shipped source file with its line count, so the 400-line rule is visible not asserted. */
function sourceTree() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|css|html|json|mjs)$/.test(name)) {
        out.push({
          path: relative(ROOT, full),
          lines: readFileSync(full, 'utf8').split('\n').length,
        });
      }
    }
  };
  for (const top of ['src', 'scripts', 'tests']) {
    const dir = join(ROOT, top);
    if (existsSync(dir)) walk(dir);
  }
  return out;
}

function table(rows) {
  return rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
}

function fence(text, lang = '') {
  return '```' + lang + '\n' + text.replace(/```/g, '`­``').trimEnd() + '\n```';
}

function main() {
  mkdirSync(GATE_DIR, { recursive: true });
  const results = [];
  for (const step of GATES) {
    const r = REUSE ? reuse(step) : run(step);
    results.push({ ...step, ...r });
    const mark = r.code === 0 ? 'PASS' : r.code == null ? 'NO LOG' : 'FAIL(' + r.code + ')';
    process.stdout.write(`${mark.padEnd(9)} ${step.gate.padEnd(10)} ${step.title}\n`);
  }

  const green = results.every((r) => r.code === 0);
  const parity = parityFacts(results.find((r) => r.slug === 'parity')?.output ?? '');
  const unit = testFacts(results.find((r) => r.slug === 'unit')?.output ?? '');
  const e2e = testFacts(results.find((r) => r.slug === 'e2e')?.output ?? '');
  const files = sourceTree();
  const overLong = files.filter((f) => f.lines > 400 && /^src\//.test(f.path));

  const head = readFileSync(join(ROOT, 'docs/ux-scorecard.md'), 'utf8');
  const scoreLine = /\*\*PASS\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(head);
  const failLine = /\*\*FAIL\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(head);

  const md = [
    '# TRACE-Pro — Phase 3 evidence pack',
    '',
    'Generated by `node scripts/evidence-pack.mjs`. Every figure below was collected by that script',
    'from a child process it ran; the verbatim output of each sub-gate is in `docs/evidence/gate/`.',
    'The verdict is the conjunction of the exit codes and nothing else.',
    '',
    '## Verdict',
    '',
    '**GATE RESULT: ' + (green ? 'PASS' : 'FAIL') + '** — ' +
      results.filter((r) => r.code === 0).length + ' of ' + results.length + ' sub-gate steps exited 0.',
    '',
    table([
      ['Sub-gate', 'Step', 'Command', 'Exit', 'Verdict', 'Log'],
      ['---', '---', '---', '---', '---', '---'],
      ...results.map((r) => [
        r.gate,
        r.title,
        '`' + r.cmd + ' ' + r.args.join(' ') + '`',
        r.code == null ? '—' : String(r.code),
        r.code === 0 ? 'PASS' : 'FAIL',
        '[`' + r.slug + '.txt`](gate/' + r.slug + '.txt)',
      ]),
    ]),
    '',
    '## PARITY — the figures, unchanged',
    '',
    parity
      ? table([
          ['Measure', 'Observed'],
          ['---', '---'],
          ['Keys resolved', (parity.resolved ?? '?') + ' / ' + (parity.total ?? '?')],
          ['Unresolved', parity.unresolved ?? '—'],
          ['Compared byte-for-byte (strict)', parity.strict ?? '—'],
          ['Declared relabels (digit-guarded)', parity.relabelled ?? '—'],
          ['Digit violations', parity.digits ?? '—'],
          ['**Value diffs**', '**' + (parity.diffs ?? '—') + '**'],
          ["Harness's own verdict", parity.verdict ?? '—'],
        ])
      : 'The parity log did not contain a summary line this script recognises. Read ' +
        '`docs/evidence/gate/parity.txt` directly rather than trusting a number here.',
    '',
    'Baseline under comparison: `tests/baseline.json`, frozen at Phase 1 and unmodified since. That',
    'is not a claim made here — `scripts/check-frozen.mjs` (inside `npm run lint`, above) derives it',
    'from git: each of the four frozen artifacts must be introduced by exactly one commit and never',
    'touched again, and its working-tree bytes must equal the blob at that commit. A checksum written',
    'into a script would prove nothing, because the same commit could change both.',
    '',
    '## UNIT and headless suites',
    '',
    table([
      ['Suite', 'Passed', 'Failed'],
      ['---', '---', '---'],
      ['`npm test` (Vitest, domain)', unit.passed ?? '—', unit.failed ?? '—'],
      ['`npx playwright test` (all projects)', e2e.passed ?? '—', e2e.failed ?? '—'],
    ]),
    '',
    '## UX CRITIC',
    '',
    'Scored in `docs/ux-scorecard.md` against `docs/ux-rubric.md` (18 criteria, frozen at Phase 0).',
    'Most recent recorded pass: **' + (scoreLine?.[1] ?? '?') + ' PASS / ' + (failLine?.[1] ?? '?') + ' FAIL**.',
    'The rubric\'s own rule is that the gate passes only when all 18 pass with cited evidence, so a',
    'non-zero FAIL count above means this sub-gate is RED regardless of the test suites.',
    '',
    '## Structure limits',
    '',
    files.length + ' source files under `src/`, `scripts/` and `tests/`. ' +
      (overLong.length === 0
        ? 'No file under `src/` exceeds 400 lines.'
        : overLong.length + ' file(s) under `src/` exceed 400 lines: ' +
          overLong.map((f) => '`' + f.path + '` (' + f.lines + ')').join(', ') + '.'),
    '',
    '### Ten largest files',
    '',
    table([
      ['File', 'Lines'],
      ['---', '---'],
      ...files
        .slice()
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 10)
        .map((f) => ['`' + f.path + '`', String(f.lines)]),
    ]),
    '',
    '## Verbatim gate output',
    '',
    ...results.flatMap((r) => [
      '### ' + r.gate + ' — ' + r.title + ' (exit ' + (r.code ?? '—') + ')',
      '',
      fence(tail(r.output, 120)),
      '',
      'Full log: `docs/evidence/gate/' + r.slug + '.txt`' + (r.seconds ? ' (' + r.seconds.toFixed(1) + 's)' : ''),
      '',
    ]),
  ].join('\n');

  writeFileSync(PACK, md + '\n');
  process.stdout.write('\nwrote ' + relative(ROOT, PACK) + '\n');
  process.stdout.write('GATE RESULT: ' + (green ? 'PASS' : 'FAIL') + '\n');
  process.exit(green ? 0 : 1);
}

/** Last n lines, so the pack stays readable while the full log stays on disk. */
function tail(text, n) {
  const lines = text.split('\n');
  if (lines.length <= n) return text;
  return '… ' + (lines.length - n) + ' earlier lines in the full log …\n' + lines.slice(-n).join('\n');
}

main();
