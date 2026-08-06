/**
 * Critic-3: does every selector the shipped R5 test asserts appear in its own contract document,
 * docs/first-run.md? The rubric makes first-run.md the naming authority; an assertion on a selector
 * the document does not name is the test choosing its own bar.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const spec = fs.readFileSync(path.join(ROOT, 'tests/e2e/rubric.spec.ts'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs/first-run.md'), 'utf8');

const start = spec.indexOf('const FIRST_RUN');
const end = spec.indexOf("test('R5");
const block = spec.slice(start, end);
const rows = [...block.matchAll(/\['([^']+)',\s*'([^']+)'(?:,\s*(\d+))?\]/g)].map((m) => ({
  label: m[1],
  selector: m[2],
  need: m[3] ? Number(m[3]) : 1,
}));

const missingSelector = rows.filter((r) => !doc.includes(r.selector));
const missingLabel = rows.filter((r) => !doc.toLowerCase().includes(r.label.toLowerCase()));

const out = {
  assertedRows: rows.length,
  selectorsNotInFirstRunMd: missingSelector,
  labelsNotInFirstRunMd: missingLabel.map((r) => r.label),
};
fs.writeFileSync(path.join(ROOT, 'docs/evidence/critic3-r5-contract.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
