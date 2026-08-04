/**
 * The frozen artifacts, enforced by git rather than by my word.
 *
 * The mission freezes four files after their phase: the parity contract, the baseline it is compared
 * against, the rubric the build is graded on, and the original itself. Editing any of them to make a
 * check pass is the single most effective way to fake this entire project — a parity gate is only
 * evidence if the thing it compares against was written before the code it grades.
 *
 * A checksum recorded in this file would prove nothing, because I could edit the checksum in the
 * same commit as the file. So this check derives everything from git history instead:
 *
 *   1. Each frozen file was introduced by EXACTLY ONE commit and never touched again. A later edit
 *      shows up as a second commit; an amend or a rebase that rewrote the freeze commit changes its
 *      hash, and the expected hash below is itself in git.
 *   2. The working-tree bytes equal the blob at that commit — so an uncommitted local edit, which
 *      is what a gate run would actually read, fails here.
 *
 * Both are properties of the repository's history, not assertions about it. To defeat this check you
 * would have to rewrite published history, which is visible in a way an edited constant is not.
 *
 * If one of these files is genuinely wrong, the instruction is to HALT and say why — not to amend it
 * and continue. This script is what makes "I did not amend it" a verifiable claim.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `path` is relative to this package; `prefix` is how git sees it, since the git root is the parent
 * directory. `phase` is when it froze, quoted from the mission.
 */
const FROZEN = [
  { path: 'parity-map.json', phase: 'Phase 1', why: 'the semantic parity contract' },
  { path: 'tests/baseline.json', phase: 'Phase 1', why: 'the figures the original reported' },
  { path: 'docs/ux-rubric.md', phase: 'Phase 0', why: 'the bar the rebuild is graded against' },
  { path: 'reference/TRACE-Pro-original.html', phase: 'Phase 1', why: 'the original, read-only' },
];

function git(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (res.stderr || '').trim());
  return res.stdout;
}

/**
 * Two path forms, and they are NOT interchangeable — the first version of this script used one for
 * both and reported all four files as amended with "0 commits touch it", which is what a fabricated
 * pass looks like in reverse. A pathspec (`git log -- <p>`) resolves against the cwd; a blob
 * reference (`git show <rev>:<p>`) resolves against the repository root.
 */
const PREFIX = git(['rev-parse', '--show-prefix']).trim();

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const problems = [];
const rows = [];

for (const item of FROZEN) {
  const abs = join(ROOT, item.path);
  if (!existsSync(abs)) {
    problems.push(`MISSING  ${item.path} — frozen at ${item.phase} and no longer on disk.`);
    continue;
  }
  const blobRef = PREFIX + item.path;

  // (1) exactly one commit, ever.
  const commits = git(['log', '--format=%H', '--', item.path]).trim().split('\n').filter(Boolean);
  if (commits.length !== 1) {
    problems.push(
      `AMENDED  ${item.path} — frozen at ${item.phase}, but ${commits.length} commits touch it:\n` +
        commits.map((c) => '           ' + c.slice(0, 12) + ' ' + git(['log', '-1', '--format=%s', c]).trim()).join('\n')
    );
  }

  // (2) the working tree equals the committed blob.
  const freeze = commits[commits.length - 1];
  let committed = null;
  if (freeze) {
    const res = spawnSync('git', ['show', freeze + ':' + blobRef], {
      cwd: ROOT,
      maxBuffer: 256 * 1024 * 1024,
    });
    if (res.status === 0) committed = res.stdout;
  }
  const disk = readFileSync(abs);
  const diskHash = sha256(disk);
  if (committed && sha256(committed) !== diskHash) {
    problems.push(
      `EDITED   ${item.path} — working tree differs from the bytes committed at ` +
        (freeze ?? '?').slice(0, 12) + '. A gate run reads the working tree, so this is a live edit.'
    );
  }

  rows.push({
    path: item.path,
    phase: item.phase,
    why: item.why,
    commit: (freeze ?? '?').slice(0, 12),
    bytes: disk.length,
    sha: diskHash.slice(0, 16),
    commits: commits.length,
  });
}

const pad = (s, n) => String(s).padEnd(n);
process.stdout.write('frozen artifacts — one commit each, working tree equal to it\n\n');
for (const r of rows) {
  process.stdout.write(
    `  ${pad(r.path, 36)} ${pad(r.phase, 8)} ${pad(r.commit, 14)} ` +
      `${pad(r.bytes.toLocaleString('en-US') + ' B', 13)} sha256:${r.sha}…  ${r.commits} commit\n`
  );
}
process.stdout.write('\n');

if (problems.length) {
  for (const p of problems) process.stdout.write(p + '\n');
  process.stdout.write(
    `\nFROZEN CHECK FAILED (${problems.length})\n\n` +
      'One of the four artifacts this project is graded against has moved. Do not adjust it to make\n' +
      'the gate pass — that is the one thing the mission forbids outright. HALT and explain why you\n' +
      'believe it is wrong.\n'
  );
  process.exit(1);
}

process.stdout.write('FROZEN CHECK PASSED\n');
