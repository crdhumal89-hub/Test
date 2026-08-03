/**
 * The ownership solve. This is the piece a controller is most exposed by: if effective shares are
 * wrong, every "who ultimately owns this" answer is wrong, and the error is invisible because the
 * numbers still look like percentages.
 */
import { describe, it, expect } from 'vitest';
import {
  graphFromUniverse,
  solveEffectiveShares,
  effectiveOwners,
  totalQuantity,
  immediateHolders,
  directShare,
  walkOwnersUpward,
  isSubtotal,
  type OwnershipGraph,
} from '../../src/domain/ownership.js';
import type { UniverseFixture } from '../../src/domain/types.js';
import { formatCount } from '../../src/domain/money.js';
import { loadFixtures } from './fixtures.js';

/** Minimal hand-built graph so the algebra is checkable by hand. */
function graphOf(edges: [string, string, number][], gu: Record<string, number>): OwnershipGraph {
  const universe = {
    edges,
    gu,
    names: {},
    symByInv: {},
    ultimates: [],
    entReach: {},
    entities: [],
    search: [],
    issues: [],
    counts: {},
  } as unknown as UniverseFixture;
  const held = new Set(edges.map(([, i]) => i));
  const all = new Set(edges.flatMap(([h, i]) => [h, i]));
  const g = graphFromUniverse(universe);
  g.ultimates = new Set([...all].filter((c) => !held.has(c)));
  return g;
}

describe('directShare', () => {
  it('is units held over units outstanding', () => {
    expect(directShare(25, 100)).toBe(0.25);
  });

  it('is zero rather than Infinity when nothing is outstanding', () => {
    expect(directShare(25, 0)).toBe(0);
  });
});

describe('solveEffectiveShares — simple chains', () => {
  it('attributes a single hop entirely to the one holder', () => {
    const g = graphOf(
      [
        ['TOP', 'MID', 100],
      ],
      { MID: 100 }
    );
    const shares = solveEffectiveShares(g);
    expect(shares.get('MID')!.get('TOP')).toBeCloseTo(1, 12);
  });

  it('multiplies through a two-hop chain', () => {
    // TOP owns 50% of MID; MID owns 100% of BOTTOM => TOP effectively owns 50% of BOTTOM.
    const g = graphOf(
      [
        ['TOP', 'MID', 50],
        ['MID', 'BOTTOM', 100],
      ],
      { MID: 100, BOTTOM: 100 }
    );
    const shares = solveEffectiveShares(g);
    expect(shares.get('BOTTOM')!.get('TOP')).toBeCloseTo(0.5, 12);
  });

  it('splits across co-owners and still sums to one', () => {
    const g = graphOf(
      [
        ['A', 'X', 30],
        ['B', 'X', 70],
      ],
      { X: 100 }
    );
    const shares = solveEffectiveShares(g);
    const x = shares.get('X')!;
    expect(x.get('A')).toBeCloseTo(0.3, 12);
    expect(x.get('B')).toBeCloseTo(0.7, 12);
    expect([...x.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
  });

  it('merges a diamond, so a parent reached by two paths is counted once at the combined weight', () => {
    // TOP -> L (60%), TOP -> R (40%), both L and R own all of BOTTOM's two halves.
    const g = graphOf(
      [
        ['TOP', 'L', 100],
        ['TOP', 'R', 100],
        ['L', 'BOTTOM', 50],
        ['R', 'BOTTOM', 50],
      ],
      { L: 100, R: 100, BOTTOM: 100 }
    );
    const shares = solveEffectiveShares(g);
    const bottom = shares.get('BOTTOM')!;
    expect(bottom.size).toBe(1);
    expect(bottom.get('TOP')).toBeCloseTo(1, 12);
  });
});

describe('solveEffectiveShares — cycles', () => {
  it('terminates and conserves on a mutual holding', () => {
    // A and B hold each other; TOP holds A. A naive recursion would not terminate.
    const g = graphOf(
      [
        ['TOP', 'A', 80],
        ['B', 'A', 20],
        ['A', 'B', 100],
      ],
      { A: 100, B: 100 }
    );
    const shares = solveEffectiveShares(g);
    const a = shares.get('A')!;
    expect([...a.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
    expect(a.get('TOP')).toBeGreaterThan(0.79);
    expect([...a.keys()]).toContain('TOP');
  });

  it('ignores a self-mapping instead of letting a fund own itself', () => {
    const g = graphOf(
      [
        ['TOP', 'X', 100],
        ['X', 'X', 500],
      ],
      { X: 100 }
    );
    const shares = solveEffectiveShares(g);
    expect(shares.get('X')!.get('TOP')).toBeCloseTo(1, 12);
    expect(shares.get('X')!.has('X')).toBe(false);
  });
});

describe('solveEffectiveShares — the shipped universe', () => {
  const { universe } = loadFixtures();
  const graph = graphFromUniverse(universe);
  const shares = solveEffectiveShares(graph);

  it('resolves the default position APPOURI to 39 immediate owners', () => {
    expect(immediateHolders(graph, 'APPOURI')).toHaveLength(39);
  });

  it('reports APPOURI units outstanding at full precision, and rounds only for display', () => {
    // The screen shows "Total qty: 1,330,020,204"; the underlying figure carries cents.
    expect(totalQuantity(graph, 'APPOURI')).toBe(1330020204.24);
    expect(formatCount(totalQuantity(graph, 'APPOURI'))).toBe('1,330,020,204');
  });

  it('sums ultimate owners of APPOURI to 100%', () => {
    const owners = effectiveOwners(graph, shares, 'APPOURI');
    const total = [...owners.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('sums immediate owners of APPOURI to 100%', () => {
    const outstanding = totalQuantity(graph, 'APPOURI');
    const held = immediateHolders(graph, 'APPOURI').reduce((s, [, u]) => s + u, 0);
    expect(held / outstanding).toBeCloseTo(1, 3);
  });

  /**
   * The original prints, in its footer: "ownership per node sums to 100% ... verified to conserve".
   * That claim is false for 5 of the 514 entities, because of the 2 circular mappings its own
   * Issue Log reports as High severity. The behaviour is bit-identical to the original (see
   * ownership-differential.spec.ts), so this is a DATA condition, not a solver fault — but the
   * blanket assurance is overstated. Recorded in docs/issues.md.
   *
   * These are pinned by name so a future change to the solve cannot quietly add a sixth.
   */
  const KNOWN_NON_CONSERVING = {
    ABFSUB6: 1.2928717140540038, // 129.29% — the circular holding, via ABFAGB
    APVCIAGA: 0.9982, // slight shortfall
    APVCIAGB: 0.9956,
    APVCIINA: 0.9956,
    MIDCAP: 0.031, // 3.10% — MidCap is overwhelmingly held outside the mapped universe
  } as const;

  it('conserves ownership for every entity except the 5 the data cannot close', () => {
    const offenders: Record<string, number> = {};
    let checked = 0;
    for (const code of graph.globalUnits.keys()) {
      if (graph.ultimates.has(code)) continue;
      const owners = effectiveOwners(graph, shares, code);
      if (!owners.size) continue;
      checked++;
      const total = [...owners.values()].reduce((s, v) => s + v, 0);
      if (Math.abs(total - 1) > 1e-3) offenders[code] = total;
    }
    expect(checked).toBeGreaterThan(400);
    expect(Object.keys(offenders).sort()).toEqual(Object.keys(KNOWN_NON_CONSERVING).sort());
    for (const [code, approx] of Object.entries(KNOWN_NON_CONSERVING)) {
      expect(offenders[code], code).toBeCloseTo(approx, 3);
    }
  });

  it('attributes above 100% to exactly one parent, and it is the circular holding', () => {
    const over: string[] = [];
    for (const code of graph.globalUnits.keys()) {
      for (const [parent, share] of effectiveOwners(graph, shares, code)) {
        if (share > 1 + 1e-9) over.push(`${code}<-${parent}`);
      }
    }
    expect(over).toEqual(['ABFSUB6<-ABFAGB']);
  });

  it('holds no self-mapping edge in the solve, so no fund can own itself', () => {
    for (const [code, holders] of graph.owners) {
      expect(holders.map(([h]) => h)).not.toContain(code);
    }
  });
});

describe('walkOwnersUpward', () => {
  const { universe } = loadFixtures();
  const graph = graphFromUniverse(universe);

  it('emits one row per immediate owner plus a subtotal row when collapsed', () => {
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set());
    expect(rows.filter((r) => !isSubtotal(r))).toHaveLength(39);
    expect(rows.filter(isSubtotal)).toHaveLength(1);
  });

  it('sorts owners by units held, largest first', () => {
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set()).filter((r) => !isSubtotal(r));
    const units = rows.map((r) => (isSubtotal(r) ? 0 : r.units));
    expect(units).toEqual([...units].sort((a, b) => b - a));
  });

  it('cumulative equals direct at the first level, because it is a single hop', () => {
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set());
    for (const r of rows) {
      if (isSubtotal(r)) continue;
      expect(r.cumulative).toBeCloseTo(r.direct, 12);
    }
  });

  it('compounds direct shares along the chain when expanded', () => {
    const first = walkOwnersUpward(graph, 'APPOURI', new Set()).find(
      (r) => !isSubtotal(r) && r.expandable
    );
    expect(first).toBeDefined();
    const id = (first as { id: string }).id;
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set([id]));
    const deeper = rows.filter((r) => !isSubtotal(r) && r.depth === 1);
    expect(deeper.length).toBeGreaterThan(0);
    for (const r of deeper) {
      if (isSubtotal(r)) continue;
      const product = r.chain.reduce((acc, step) => acc * step.direct, 1);
      expect(r.cumulative).toBeCloseTo(product, 12);
    }
  });

  it('marks a cycle instead of recursing into it', () => {
    const g = graphOf(
      [
        ['A', 'B', 100],
        ['B', 'A', 100],
      ],
      { A: 100, B: 100 }
    );
    const rows = walkOwnersUpward(g, 'A', new Set(['0|A|B']));
    const cyclic = rows.filter((r) => !isSubtotal(r) && r.cyclic);
    expect(cyclic.length).toBeGreaterThan(0);
  });
});
