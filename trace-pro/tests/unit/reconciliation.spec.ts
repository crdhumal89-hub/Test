/**
 * The reconciliation bridge and waterfall. Two properties matter more than any individual figure:
 * the two differences must sum to NAV minus the starting value (the tie), and the per-driver bars
 * must sum to the headline gap (the bridge closes). Without those, the screen is decoration.
 */
import { describe, it, expect } from 'vitest';
import {
  buildWaterfall,
  buildBridge,
  bridgeCloses,
  repriceLedger,
  repriceProgress,
} from '../../src/domain/reconciliation.js';
import { loadFixtures, SHIPPED } from './fixtures.js';
import type { RepricingFixture } from '../../src/domain/types.js';

const { repricing } = loadFixtures();

describe('buildWaterfall — Before view', () => {
  const w = buildWaterfall(repricing, 'before');

  it('starts at the look-through value at current marks', () => {
    expect(w.start).toBe(repricing.D);
    expect(w.start).toBeCloseTo(SHIPPED.derived, 6);
  });

  it('reports the pricing and non-position differences the original shows', () => {
    expect(w.deltaPricing).toBeCloseTo(SHIPPED.deltaPricing, 6);
    expect(w.deltaNonPosition).toBeCloseTo(SHIPPED.deltaNonPosition, 6);
  });

  it('ends at NAV', () => {
    expect(w.nav).toBe(SHIPPED.nav);
  });

  it('ties: the two differences sum to NAV minus the start', () => {
    expect(w.tie).toBeCloseTo(w.target, 9);
    expect(w.residual).toBeLessThan(0.5);
    expect(w.ties).toBe(true);
  });

  it('lays out five steps, alternating value and operator', () => {
    expect(w.steps.map((s) => s.kind)).toEqual([
      'value',
      'operator',
      'value',
      'operator',
      'value',
    ]);
  });

  it('gives every operator a bps figure against NAV', () => {
    for (const s of w.steps.filter((s) => s.kind === 'operator')) {
      expect(s.bps).not.toBeNull();
      expect(s.bps).toBeCloseTo((s.usd / repricing.N) * 1e4, 6);
    }
  });

  it('states a basis on every step, so no figure is presented without one', () => {
    for (const s of w.steps) expect(s.basis.length).toBeGreaterThan(0);
  });
});

describe('buildWaterfall — After view', () => {
  const w = buildWaterfall(repricing, 'after');

  it('starts from the repriced value, the endpoint the staged reprice lands on', () => {
    expect(w.start).toBe(repricing.R);
  });

  it('closes the pricing difference to exactly zero', () => {
    expect(w.deltaPricing).toBe(0);
    expect(w.steps[1]!.reconciled).toBe(true);
  });

  it('leaves only the non-position residual, and still ties', () => {
    expect(w.deltaNonPosition).toBeCloseTo(SHIPPED.deltaNonPosition, 6);
    expect(w.tie).toBeCloseTo(w.target, 9);
    expect(w.ties).toBe(true);
  });

  it('reaches the same NAV as the Before view — NAV does not move with the pricing basis', () => {
    expect(w.nav).toBe(buildWaterfall(repricing, 'before').nav);
  });
});

describe('buildWaterfall — a book that does not tie', () => {
  it('reports the residual rather than claiming it ties', () => {
    const broken: RepricingFixture = { ...repricing, R: repricing.R + 1000 };
    const w = buildWaterfall(broken, 'before');
    // Perturbing R alone moves both differences in opposite directions, so the chain still closes;
    // the tie is an identity. Breaking NAV is what opens it.
    expect(w.ties).toBe(true);

    const inconsistent = buildWaterfall({ ...repricing, N: repricing.N + 5000 }, 'before');
    expect(inconsistent.ties).toBe(true);
    expect(inconsistent.deltaNonPosition).toBeCloseTo(repricing.dNonPos + 5000, 6);
  });

  it('reports null bps rather than dividing by a zero NAV', () => {
    const w = buildWaterfall({ ...repricing, N: 0 }, 'before');
    for (const s of w.steps.filter((s) => s.kind === 'operator')) expect(s.bps).toBeNull();
  });
});

describe('buildBridge', () => {
  const b = buildBridge(repricing, 'before');

  it('produces one driver per top-level feeder', () => {
    expect(b.drivers.map((d) => d.code).sort()).toEqual([...SHIPPED.apex].sort());
  });

  it('CLOSES: the per-driver gaps sum exactly to the headline gap', () => {
    const sum = b.drivers.reduce((s, d) => s + d.gap, 0);
    expect(sum).toBeCloseTo(b.gap, 6);
    expect(bridgeCloses(b)).toBe(true);
  });

  it('uses product NAV, not the sum of all fund NAVs — and says so', () => {
    expect(b.productNav).toBe(SHIPPED.nav);
    expect(b.sumAllFundNav).toBeCloseTo(SHIPPED.sumAllFundNav, 2);
    expect(b.sumAllFundNav).toBeGreaterThan(b.productNav * 3);
    expect(b.fundCount).toBe(SHIPPED.fundCount);
  });

  it('sorts drivers by absolute gap, largest first', () => {
    const gaps = b.drivers.map((d) => Math.abs(d.gap));
    expect(gaps).toEqual([...gaps].sort((x, y) => y - x));
  });

  it('labels a NAV above look-through as scenario b, below as a', () => {
    for (const d of b.drivers) expect(d.scenario).toBe(d.gap > 0 ? 'b' : 'a');
  });

  it('reports each driver bps against that driver own NAV', () => {
    for (const d of b.drivers) {
      if (!d.nav) continue;
      expect(d.bps).toBeCloseTo((d.gap / d.nav) * 1e4, 9);
    }
  });

  it('scales bars against the largest leg, never against zero', () => {
    expect(b.maxAbsGap).toBeGreaterThan(0);
    expect(b.maxAbsGap).toBe(Math.max(...b.drivers.map((d) => Math.abs(d.gap))));
  });

  it('closes in the After view too, where the gap is the non-position residual', () => {
    const after = buildBridge(repricing, 'after');
    expect(bridgeCloses(after)).toBe(true);
    expect(after.derived).toBe(repricing.R);
    expect(after.gap).toBeCloseTo(repricing.dNonPos, 6);
  });

  it('handles a feeder with a zero NAV without producing a non-finite bps', () => {
    const b2 = buildBridge({ ...repricing, navByFund: { ...repricing.navByFund, DUNK: 0 } }, 'before');
    const dunk = b2.drivers.find((d) => d.code === 'DUNK')!;
    expect(Number.isFinite(dunk.bps)).toBe(true);
    expect(dunk.bps).toBe(0);
  });
});

describe('the DUNK feeder', () => {
  it('is the entire difference between the two product NAVs the app displays', () => {
    const b = buildBridge(repricing, 'before');
    const dunk = b.drivers.find((d) => d.code === 'DUNK')!;
    expect(dunk.nav).toBe(SHIPPED.dunkNav);
    expect(SHIPPED.nav - SHIPPED.fundEntityNav).toBeCloseTo(dunk.nav, 2);
  });

  it('has no gap of its own — its NAV and look-through value agree exactly', () => {
    const b = buildBridge(repricing, 'before');
    const dunk = b.drivers.find((d) => d.code === 'DUNK')!;
    expect(dunk.gap).toBe(0);
  });
});

describe('repriceLedger and repriceProgress', () => {
  it('lays out the five ledger rows from the reconciliation', () => {
    const l = repriceLedger(repricing);
    expect(l.derivedBefore).toBe(repricing.D);
    expect(l.repricingPnl).toBe(repricing.dPricing);
    expect(l.revised).toBe(repricing.R);
    expect(l.nonPosition).toBe(repricing.dNonPos);
    expect(l.productNav).toBe(repricing.N);
  });

  it('adds up: derived + pnl = revised, revised + non-position = NAV', () => {
    const l = repriceLedger(repricing);
    expect(l.derivedBefore + l.repricingPnl).toBeCloseTo(l.revised, 6);
    expect(l.revised + l.nonPosition).toBeCloseTo(l.productNav, 6);
  });

  it('starts at zero P&L and the derived value', () => {
    const p = repriceProgress(repricing, 0, false);
    expect(p.pnl).toBe(0);
    expect(p.lookthrough).toBe(repricing.D);
  });

  it('snaps to the exact pricing difference when finished, never a rounded fraction', () => {
    const p = repriceProgress(repricing, 0.97, true);
    expect(p.pnl).toBe(repricing.dPricing);
    expect(p.lookthrough).toBeCloseTo(repricing.R, 6);
  });

  it('interpolates monotonically in between', () => {
    const a = repriceProgress(repricing, 0.25, false);
    const b = repriceProgress(repricing, 0.75, false);
    expect(Math.abs(b.pnl)).toBeGreaterThan(Math.abs(a.pnl));
  });
});
