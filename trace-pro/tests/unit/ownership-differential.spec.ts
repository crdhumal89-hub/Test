/**
 * Differential test: the extracted ownership solve against the ORIGINAL's `solveU` / `effOwners`,
 * pasted verbatim below, over the whole shipped universe.
 *
 * This is the guard that the extraction is behaviour-preserving rather than merely plausible. It is
 * the reason a parity break can be attributed to the layer that was just touched: if this passes,
 * the math did not move.
 */
import { describe, it, expect } from 'vitest';
import { graphFromUniverse, solveEffectiveShares, effectiveOwners } from '../../src/domain/ownership.js';
import { loadFixtures } from './fixtures.js';

const { universe: UNI } = loadFixtures();

/* --- verbatim from reference/TRACE-Pro-original.html lines 1147, 1149, 1155 --- */
interface OriginalGraph {
  owners: Map<string, [string, number][]>;
  gu: Map<string, number>;
  ult: Set<string>;
}
function buildRevFromUNI(): OriginalGraph {
  const owners = new Map<string, [string, number][]>(),
    gu = new Map(Object.entries(UNI.gu).map(([k, v]) => [k, +v] as [string, number]));
  for (const [h, i, u] of UNI.edges) {
    if (h === i) continue;
    if (!owners.has(i)) owners.set(i, []);
    owners.get(i)!.push([h, +u]);
  }
  return { owners, gu, ult: new Set(UNI.ultimates) };
}
function solveU(R: OriginalGraph): Map<string, Map<string, number>> {
  const Uu = new Map<string, Map<string, number>>();
  const nodes = [...R.gu.keys()].filter((n) => !R.ult.has(n));
  for (let it = 0; it < 120; it++) {
    let md = 0;
    for (const n of nodes) {
      const tot = R.gu.get(n) || 0;
      const acc = new Map<string, number>();
      if (tot > 0)
        for (const [h, u] of R.owners.get(n) || []) {
          const f = u / tot;
          const hu = R.ult.has(h) ? new Map([[h, 1]]) : Uu.get(h) || new Map<string, number>();
          for (const [up, w] of hu) acc.set(up, (acc.get(up) || 0) + f * w);
        }
      const prev = Uu.get(n) || new Map<string, number>();
      let d = 0;
      const ks = new Set([...acc.keys(), ...prev.keys()]);
      for (const k of ks) d += Math.abs((acc.get(k) || 0) - (prev.get(k) || 0));
      if (d > md) md = d;
      Uu.set(n, acc);
    }
    if (md < 1e-12) break;
  }
  return Uu;
}
function effOwnersOriginal(
  REV: OriginalGraph,
  Umap: Map<string, Map<string, number>>,
  c: string
): Map<string, number> {
  const res = new Map<string, number>();
  const tot = REV.gu.get(c) || 0;
  if (tot <= 0) return res;
  for (const [h, u] of REV.owners.get(c) || []) {
    const f = u / tot;
    const hu = REV.ult.has(h) ? new Map([[h, 1]]) : Umap.get(h) || new Map([[h, 1]]);
    for (const [up, w] of hu) res.set(up, (res.get(up) || 0) + f * w);
  }
  return res;
}

describe('ownership solve is behaviour-identical to the original', () => {
  const REV = buildRevFromUNI();
  const originalShares = solveU(REV);
  const graph = graphFromUniverse(UNI);
  const mine = solveEffectiveShares(graph);

  it('resolves the same set of entities', () => {
    expect(mine.size).toBe(originalShares.size);
  });

  it('produces bit-identical weights for every entity and every parent', () => {
    let compared = 0;
    for (const [code, expected] of originalShares) {
      const got = mine.get(code);
      expect(got, `missing entity ${code}`).toBeDefined();
      expect(got!.size, `parent count for ${code}`).toBe(expected.size);
      for (const [parent, weight] of expected) {
        expect(got!.get(parent), `${code} <- ${parent}`).toBe(weight);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('produces bit-identical effective owners for every entity with units outstanding', () => {
    let compared = 0;
    for (const code of graph.globalUnits.keys()) {
      const expected = effOwnersOriginal(REV, originalShares, code);
      const got = effectiveOwners(graph, mine, code);
      expect(got.size, `owner count for ${code}`).toBe(expected.size);
      for (const [parent, weight] of expected) {
        expect(got.get(parent), `${code} <- ${parent}`).toBe(weight);
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(400);
  });
});
