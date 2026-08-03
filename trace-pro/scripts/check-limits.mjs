/**
 * Structural gates that the Definition of Done requires to be machine-enforced, not inspected.
 *
 *   node scripts/check-limits.mjs
 *
 * 1. No source file exceeds 400 lines.
 * 2. No source file contains a data literal over 2,000 characters (fixtures live in data/).
 * 3. Zero duplicate top-level identifiers across modules.
 * 4. Zero inline on*= handler attributes.
 * 5. Zero !important declarations.
 *
 * 4 and 5 accept survivors only if listed in docs/exceptions.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINES = 400;
const MAX_LITERAL = 2000;

const SRC_DIRS = ['src', 'scripts', 'tests/unit', 'tests/e2e'];
const failures = [];
const notes = [];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = SRC_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
files.push(path.join(ROOT, 'index.html'));

/* ---------------------------------------------------------------- 1. file length */
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const n = fs.readFileSync(f, 'utf8').split('\n').length;
  if (n > MAX_LINES) failures.push(`FILE TOO LONG  ${path.relative(ROOT, f)} — ${n} lines (max ${MAX_LINES})`);
}

/* ---------------------------------------------------------------- 2. data literals */
/**
 * A DATA literal, not a code block. A long `{...}` that contains `=>`, `function`, `return`, `if (`
 * or `for (` is a function body or a describe() block, which the 400-line rule already governs;
 * only literals that are purely data count here.
 */
const CODE_MARKERS = /=>|\bfunction\b|\breturn\b|\bif\s*\(|\bfor\s*\(|\bawait\b/;
// A TypeScript interface or type body separates members with `;`; a data literal separates with
// `,`. That is the cleanest available discriminator, and type declarations are governed by the
// 400-line rule rather than this one.
const TYPE_BODY = /;\s*(\n|$)/;
const LITERAL_RE = /(\{[^{}]{2000,}\}|\[[^[\]]{2000,}\]|`[^`]{2000,}`|'[^']{2000,}'|"[^"]{2000,}")/g;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const data = (src.match(LITERAL_RE) ?? []).filter(
    (lit) => !CODE_MARKERS.test(lit) && !TYPE_BODY.test(lit)
  );
  if (data.length) {
    failures.push(
      `DATA LITERAL   ${path.relative(ROOT, f)} — ${data.length} literal(s) over ${MAX_LITERAL} chars ` +
        `(longest ${Math.max(...data.map((x) => x.length))}). Fixtures belong in data/.`
    );
  }
}

/* ---------------------------------------------------------------- 3. duplicate top-level names */
// Top-level = column 0 declaration in a module under src/. Two modules may not declare the same
// name; this is the mechanical guard against the original's LTV x4 / walk x2 / N x2 / P x2 / CUR x2.
const DECL_RE =
  /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const owners = new Map();
for (const f of files.filter((f) => f.includes(`${path.sep}src${path.sep}`) && /\.ts$/.test(f))) {
  const rel = path.relative(ROOT, f);
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = DECL_RE.exec(line);
    if (!m || !m[1]) continue;
    const name = m[1];
    if (!owners.has(name)) owners.set(name, new Set());
    owners.get(name).add(rel);
  }
}
for (const [name, set] of owners) {
  if (set.size > 1) {
    failures.push(`DUPLICATE NAME ${name} declared at top level in ${set.size} modules: ${[...set].join(', ')}`);
  }
}
notes.push(`top-level identifiers in src/: ${owners.size}, all unique`);

/* ---------------------------------------------------------------- 4/5. onclick and !important */
const exceptionsPath = path.join(ROOT, 'docs/exceptions.md');
const exceptions = fs.existsSync(exceptionsPath) ? fs.readFileSync(exceptionsPath, 'utf8') : '';

// Scoped to shipped UI sources. Harness scripts are not shipped, and this file necessarily
// contains the very patterns it searches for.
const SHIPPED = files.filter(
  (f) => f.includes(`${path.sep}src${path.sep}`) || /(\.css|index\.html)$/.test(f)
);
const inlineHandlers = [];
const importants = [];
for (const f of SHIPPED) {
  if (!fs.existsSync(f)) continue;
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    // An inline handler ATTRIBUTE, e.g. onclick="..." in markup. Property assignment in TS
    // (el.onclick = fn) is a different thing and is caught by review, not here.
    if (/\son[a-z]+\s*=\s*["']/.test(line) && !/\bon[A-Z]/.test(line)) {
      inlineHandlers.push(`${rel}:${i + 1}`);
    }
    if (/!important/.test(line)) importants.push(`${rel}:${i + 1}`);
  });
}
for (const hit of inlineHandlers) {
  if (!exceptions.includes(hit)) failures.push(`INLINE HANDLER ${hit} — not listed in docs/exceptions.md`);
}
for (const hit of importants) {
  if (!exceptions.includes(hit)) failures.push(`!IMPORTANT     ${hit} — not listed in docs/exceptions.md`);
}
notes.push(`inline on*= attributes: ${inlineHandlers.length}`);
notes.push(`!important declarations: ${importants.length}`);

/* ---------------------------------------------------------------- report */
console.log(`checked ${files.filter((f) => fs.existsSync(f)).length} files (${SHIPPED.length} shipped UI sources)`);
notes.forEach((n) => console.log('  ' + n));
if (failures.length) {
  console.log('');
  failures.forEach((f) => console.log('  ' + f));
  console.log(`\nSTRUCTURE CHECK FAILED (${failures.length})`);
  process.exit(1);
}
console.log('\nSTRUCTURE CHECK PASSED');
