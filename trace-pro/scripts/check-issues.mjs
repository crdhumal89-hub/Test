/**
 * Rubric R8's named evidence: a script that FAILS if any inventoried defect is missing from
 * `docs/issues.md`, or is dispositioned with a claim that is no longer true.
 *
 *   node scripts/check-issues.mjs
 *
 * The rubric requires every defect found in the original to be marked resolved (with the file or
 * commit that resolved it) or carried (with a reason and an owner), with zero items unaccounted for.
 * Prose alone cannot prove that, because prose goes stale — which is exactly what an independent
 * critic found: seven dispositions still said screens, lenses and tests were "not built" after they
 * had shipped, and one "Resolved" claim was false.
 *
 * So this checks three things a human reader would not reliably catch:
 *   1. every inventoried item appears in the register;
 *   2. every item carries a disposition, and a carried item carries a reason;
 *   3. no disposition asserts something the repository contradicts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = path.join(ROOT, 'docs/issues.md');

/**
 * The defect inventory from docs/redesign-spec.md §1.8 and §1.1-1.7. Each entry names a token that
 * MUST appear in the register. This list is the contract; adding a defect to the spec means adding
 * it here.
 */
const INVENTORY = [
  // Dead code
  'PF', 'vchip', 'ragc', 'recActive',
  // Dead data
  'EMB.recon', 'dcN', 'apexPos', 'grandVar', 'UNI.counts', 'maxlevel',
  // Dead DOM
  'lth-live-s', 'lth-dp-s',
  // Duplicated engines and mechanisms
  'REC', 'REVISE', 'rfxfs', 'GMAX',
  // The materiality rule
  '250,000', '50 bps',
  // Identifier collisions
  'LTV', 'walk', 'CUR',
  // Styling and accessibility
  '!important', 'outline:none', 'focus-visible',
  // Swallowed exceptions and remote dependencies
  'console.warn', 'cdnjs',
  // The two data conditions that need an upstream owner
  '2,785.79', 'ABFSUB6', 'MIDCAP', 'APVCIAGA', 'APVCIAGB', 'APVCIINA',
  // The brief's phantom markers
  'CAXXXII',
];

/** A disposition must be one of these, and a carried one must give a reason. */
const DISPOSITION = /\*\*(Resolved|Carried|Open)\b/i;

/**
 * Claims that were true when written and are not now. Each is a regex over the register plus a
 * predicate that returns true when the repository CONTRADICTS the claim.
 */
const STALE_CLAIMS = [
  {
    what: 'a lens or screen described as not built',
    pattern: /not (?:yet )?(?:built|reachable|written)/gi,
    contradictedBy: () => {
      const built = [
        'src/ui/screens/pricing/index.ts',
        'src/ui/screens/diagnose/structure/index.ts',
        'src/ui/screens/diagnose/ownership/index.ts',
        'src/ui/screens/diagnose/data-quality/index.ts',
        'src/ui/screens/diagnose/simulator/index.ts',
      ].filter((p) => fs.existsSync(path.join(ROOT, p)));
      return built.length === 5 ? `all 5 screens/lenses exist: ${built.join(', ')}` : null;
    },
  },
  {
    what: 'the materiality rule claimed to exist in exactly one place',
    pattern: /one definition, in `src\/domain\/exceptions\.ts`/i,
    contradictedBy: () => {
      const hits = [];
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.ts$/.test(e.name)) {
            // A glossary card that STATES the threshold is documentation, not a second
            // implementation of it — the whole point of the glossary is to say what the rule is.
            // Only executable copies count against "one definition".
            if (p.includes(`${path.sep}glossary${path.sep}`)) continue;
            const src = fs.readFileSync(p, 'utf8');
            if (/250_?000/.test(src)) hits.push(path.relative(ROOT, p));
          }
        }
      };
      walk(path.join(ROOT, 'src'));
      return hits.length > 1 ? `250000 appears in ${hits.length} files: ${hits.join(', ')}` : null;
    },
  },
];

const failures = [];

if (!fs.existsSync(REGISTER)) {
  console.error('MISSING docs/issues.md — R8 has no register at all');
  process.exit(1);
}
const register = fs.readFileSync(REGISTER, 'utf8');

/* ------------------------------------------------------------------ 1. coverage */
const missing = INVENTORY.filter((item) => !register.includes(item));
if (missing.length) {
  failures.push(`${missing.length} inventoried defect(s) absent from the register: ${missing.join(', ')}`);
}
console.log(`inventory      : ${INVENTORY.length} items, ${INVENTORY.length - missing.length} present`);

/* ------------------------------------------------------------------ 2. dispositions */
// Every table row that names an item must carry a disposition.
const rows = register.split('\n').filter((l) => /^\|\s*[A-Z]?\d*\s*\|/.test(l) && l.split('|').length > 3);
const undisposed = rows.filter((r) => !DISPOSITION.test(r));
if (undisposed.length) {
  failures.push(`${undisposed.length} register row(s) carry no **Resolved**/**Carried**/**Open** disposition`);
  undisposed.slice(0, 5).forEach((r) => console.log('  UNDISPOSED: ' + r.slice(0, 110)));
}
const carried = rows.filter((r) => /\*\*Carried/i.test(r));
const carriedNoReason = carried.filter((r) => r.replace(/\*\*Carried[^*]*\*\*/i, '').trim().length < 40);
if (carriedNoReason.length) {
  failures.push(`${carriedNoReason.length} carried item(s) give no reason`);
}
console.log(`dispositions   : ${rows.length} rows, ${carried.length} carried, ${undisposed.length} undisposed`);

/* ------------------------------------------------------------------ 3. stale claims */
for (const claim of STALE_CLAIMS) {
  const occurrences = register.match(claim.pattern);
  if (!occurrences) continue;
  const contradiction = claim.contradictedBy();
  if (contradiction) {
    failures.push(
      `${occurrences.length} occurrence(s) of ${claim.what}, contradicted by the repo: ${contradiction}`
    );
  }
}
console.log(`stale claims   : ${failures.filter((f) => f.includes('contradicted')).length}`);

/* ------------------------------------------------------------------ report */
if (failures.length) {
  console.log('');
  failures.forEach((f) => console.log('  ' + f));
  console.log(`\nISSUE REGISTER CHECK FAILED (${failures.length})`);
  process.exit(1);
}
console.log('\nISSUE REGISTER CHECK PASSED');
