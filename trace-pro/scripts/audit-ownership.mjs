/**
 * Which entities in the shipped universe fail to conserve ownership?
 *
 *   node scripts/audit-ownership.mjs
 *
 * The original surfaces this condition on screen ("⚠ Owners sum to X%") and as an Issue Log
 * bucket ("Ownership > 100%"), so it is a real data condition, not a solver fault. This script
 * names the entities so the unit tests can assert the true figures instead of an aspiration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNI = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/apollo-sports-capital/2026-06-30/universe.json'), 'utf8')
);

const owners = new Map();
for (const [h, i, u] of UNI.edges) {
  if (h === i) continue;
  if (!owners.has(i)) owners.set(i, []);
  owners.get(i).push([h, +u]);
}
const gu = new Map(Object.entries(UNI.gu).map(([k, v]) => [k, +v]));
const ult = new Set(UNI.ultimates);

const overHeld = [];
for (const [code, outstanding] of gu) {
  if (!outstanding) continue;
  const held = (owners.get(code) ?? []).reduce((s, [, u]) => s + u, 0);
  const ratio = held / outstanding;
  if (ratio > 1.0001) overHeld.push({ code, outstanding, held, ratio });
}
overHeld.sort((a, b) => b.ratio - a.ratio);

console.log(`entities with units outstanding      : ${gu.size}`);
console.log(`ultimate owners (held by nobody)     : ${ult.size}`);
console.log(`entities whose held units EXCEED 100%: ${overHeld.length}`);
console.log('');
for (const o of overHeld) {
  console.log(
    `  ${o.code.padEnd(12)} held ${o.held.toLocaleString('en-US')} of ${o.outstanding.toLocaleString('en-US')} ` +
      `= ${(o.ratio * 100).toFixed(2)}%   ${(UNI.names[o.code] ?? '').slice(0, 46)}`
  );
}
console.log('\nself-mappings (fund holds its own code, excluded from the solve):');
const selfs = UNI.edges.filter(([h, i]) => h === i);
console.log(`  ${selfs.length} edges in universe.json`);

/* ---- the EFFECTIVE solve: this is where cycles show up ---- */
function solveU() {
  const Uu = new Map();
  const nodes = [...gu.keys()].filter((n) => !ult.has(n));
  for (let it = 0; it < 120; it++) {
    let md = 0;
    for (const n of nodes) {
      const tot = gu.get(n) || 0;
      const acc = new Map();
      if (tot > 0)
        for (const [h, u] of owners.get(n) || []) {
          const f = u / tot;
          const hu = ult.has(h) ? new Map([[h, 1]]) : Uu.get(h) || new Map();
          for (const [up, w] of hu) acc.set(up, (acc.get(up) || 0) + f * w);
        }
      const prev = Uu.get(n) || new Map();
      let d = 0;
      for (const k of new Set([...acc.keys(), ...prev.keys()])) d += Math.abs((acc.get(k) || 0) - (prev.get(k) || 0));
      if (d > md) md = d;
      Uu.set(n, acc);
    }
    if (md < 1e-12) break;
  }
  return Uu;
}
function effOwners(shares, c) {
  const res = new Map();
  const tot = gu.get(c) || 0;
  if (tot <= 0) return res;
  for (const [h, u] of owners.get(c) || []) {
    const f = u / tot;
    const hu = ult.has(h) ? new Map([[h, 1]]) : shares.get(h) || new Map([[h, 1]]);
    for (const [up, w] of hu) res.set(up, (res.get(up) || 0) + f * w);
  }
  return res;
}
const shares = solveU();
const bad = [];
const over = [];
for (const code of gu.keys()) {
  if (ult.has(code)) continue;
  const eo = effOwners(shares, code);
  if (!eo.size) continue;
  const total = [...eo.values()].reduce((s, v) => s + v, 0);
  if (Math.abs(total - 1) > 1e-3) bad.push({ code, total, n: eo.size });
  for (const [p, w] of eo) if (w > 1 + 1e-9) over.push({ code, parent: p, w });
}
console.log(`\nEFFECTIVE solve over ${gu.size} entities:`);
console.log(`  entities whose ultimate owners do NOT sum to 100%: ${bad.length}`);
for (const b of bad.sort((a,b)=>b.total-a.total))
  console.log(`    ${b.code.padEnd(12)} sums to ${(b.total * 100).toFixed(2)}%  across ${b.n} parents   ${(UNI.names[b.code]??'').slice(0,40)}`);
console.log(`  parent shares above 100%: ${over.length}`);
for (const o of over.sort((a,b)=>b.w-a.w).slice(0, 8))
  console.log(`    ${o.code} <- ${o.parent}  ${(o.w * 100).toFixed(2)}%`);
console.log('\n  Issue Log buckets that describe this condition:');
for (const b of UNI.issues) if (/circular|self/i.test(b.name)) console.log(`    [${b.sev}] ${b.name}: ${b.count}`);
