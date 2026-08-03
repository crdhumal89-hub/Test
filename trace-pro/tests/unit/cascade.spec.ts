/**
 * The repricing cascade. This is what the Simulator promises: shock one fund, and see the value
 * travel up through every holder to product NAV. The property that makes it trustworthy is
 * conservation — the sum of what a parent's children book into it must equal that parent's own
 * value change, with nothing invented and nothing lost.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCascadeIndex,
  shockCascade,
  buildRepriceRun,
  pendingShock,
} from '../../src/domain/cascade.js';
import type { SimulatorFixture } from '../../src/domain/types.js';
import { loadFixtures, SHIPPED } from './fixtures.js';

const { simulator, repricing } = loadFixtures();

describe('buildCascadeIndex', () => {
  const index = buildCascadeIndex(simulator);

  it('indexes every edge in both directions', () => {
    expect(Object.keys(index.edgeUnits)).toHaveLength(simulator.edges.length);
    for (const e of simulator.edges) {
      expect(index.edgeUnits[`${e.h}|${e.i}`]).toBe(e.units);
      expect(index.holdersOf[e.i]!.some((x) => x.h === e.h)).toBe(true);
      expect(index.holdingsOf[e.h]!.some((x) => x.i === e.i)).toBe(true);
    }
  });

  it('carries the three top-level feeders as the apex set', () => {
    expect([...index.apex].sort()).toEqual([...SHIPPED.apex].sort());
  });
});

/** A three-level chain with a known answer: PROD <- MID <- DEEP. */
function chainFixture(): SimulatorFixture {
  return {
    product: 'P',
    productCode: 'P',
    productNodeId: 'P::PRODUCT',
    asof: '2026-06-30',
    productNAV: 1000,
    apex: ['PROD'],
    nFunds: 3,
    maxlevel: 3,
    funds: {
      PROD: { code: 'PROD', gq: 100, nav: 1000 },
      MID: { code: 'MID', gq: 200, nav: 400 },
      DEEP: { code: 'DEEP', gq: 50, nav: 100 },
    } as unknown as SimulatorFixture['funds'],
    edges: [
      { h: 'PROD', i: 'MID', units: 200 },
      { h: 'MID', i: 'DEEP', units: 50 },
    ],
    treeNodes: [
      { id: 'P::PRODUCT', pid: null, level: 0, kind: 'product' },
      { id: 'PROD', pid: 'P::PRODUCT', level: 1, kind: 'apex' },
      { id: 'MID', pid: 'PROD', level: 2, kind: 'vehicle' },
      { id: 'DEEP', pid: 'MID', level: 3, kind: 'vehicle' },
    ],
    breaks: [],
  };
}

describe('shockCascade — arithmetic on a known chain', () => {
  const sim = chainFixture();
  const index = buildCascadeIndex(sim);

  it('moves the shocked fund price by the value change over units', () => {
    // DEEP: 100 over 50 units = 2.00. Shock to 150 => 3.00, a +1.00 price move.
    const r = shockCascade(index, 'DEEP', 150, 50, sim.apex);
    expect(r.priceBefore).toBe(2);
    expect(r.priceAfter).toBe(3);
    expect(r.priceDelta['DEEP']).toBe(1);
    expect(r.valueDelta['DEEP']).toBe(50);
  });

  it('books the child price move into the parent through units held', () => {
    // MID holds 50 units of DEEP, so a +1.00 price move is +50 of value at MID.
    const r = shockCascade(index, 'DEEP', 150, 50, sim.apex);
    expect(r.valueDelta['MID']).toBe(50);
    // MID has 200 units, so its own price moves 50/200 = +0.25.
    expect(r.priceDelta['MID']).toBe(0.25);
    // PROD holds 200 units of MID => +0.25 x 200 = +50.
    expect(r.valueDelta['PROD']).toBe(50);
    expect(r.productValueDelta).toBe(50);
  });

  it('conserves: each parent value change equals the sum booked into it by its children', () => {
    const r = shockCascade(index, 'DEEP', 175, 50, sim.apex);
    for (const parent of Object.keys(r.valueDelta)) {
      if (parent === r.shocked) continue;
      const booked = r.bookings.filter((b) => b.parent === parent).reduce((s, b) => s + b.pnl, 0);
      expect(booked).toBeCloseTo(r.valueDelta[parent]!, 9);
    }
  });

  it('orders strictly children before parents', () => {
    const r = shockCascade(index, 'DEEP', 150, 50, sim.apex);
    expect(r.layer['DEEP']).toBe(0);
    expect(r.layer['MID']).toBe(1);
    expect(r.layer['PROD']).toBe(2);
    expect(r.maxLayer).toBe(2);
  });

  it('reaches only what is above the shocked fund', () => {
    const r = shockCascade(index, 'MID', 500, 200, sim.apex);
    expect([...r.affected].sort()).toEqual(['MID', 'PROD']);
    expect(r.affected.has('DEEP')).toBe(false);
  });

  it('treats a units-only change as a repricing, holding value constant', () => {
    // Same value, half the units => price doubles.
    const r = shockCascade(index, 'DEEP', 100, 25, sim.apex);
    expect(r.valueDelta['DEEP']).toBe(0);
    expect(r.priceDelta['DEEP']).toBe(2);
    // MID still holds 50 units at +2.00 each.
    expect(r.valueDelta['MID']).toBe(100);
  });

  it('is a no-op when nothing changes', () => {
    const r = shockCascade(index, 'DEEP', 100, 50, sim.apex);
    expect(r.productValueDelta).toBe(0);
    for (const v of Object.values(r.valueDelta)) expect(v).toBe(0);
  });

  it('yields a zero price move rather than Infinity when units go to zero', () => {
    const r = shockCascade(index, 'DEEP', 100, 0, sim.apex);
    expect(r.priceAfter).toBe(0);
    expect(Number.isFinite(r.priceDelta['MID']!)).toBe(true);
  });
});

describe('shockCascade — cycles', () => {
  it('terminates and values every node once when two funds hold each other', () => {
    const sim = chainFixture();
    sim.edges.push({ h: 'DEEP', i: 'MID', units: 10 });
    const index = buildCascadeIndex(sim);
    const r = shockCascade(index, 'DEEP', 150, 50, sim.apex);
    expect(r.cyclic.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.productValueDelta)).toBe(true);
    for (const v of Object.values(r.valueDelta)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('shockCascade — the shipped book', () => {
  const index = buildCascadeIndex(simulator);

  it('propagates from every fund without producing a non-finite figure', () => {
    let shocked = 0;
    for (const code of Object.keys(simulator.funds)) {
      const fund = simulator.funds[code]!;
      const r = shockCascade(index, code, (fund.nav ?? 0) * 1.01, fund.gq, simulator.apex);
      expect(Number.isFinite(r.productValueDelta), code).toBe(true);
      shocked++;
    }
    expect(shocked).toBe(SHIPPED.fundCount);
  });

  it('conserves value at every parent, for every single-fund shock in the book', () => {
    for (const code of Object.keys(simulator.funds)) {
      const fund = simulator.funds[code]!;
      const r = shockCascade(index, code, (fund.nav ?? 0) + 1_000_000, fund.gq, simulator.apex);
      for (const parent of Object.keys(r.valueDelta)) {
        if (parent === code) continue;
        const booked = r.bookings.filter((b) => b.parent === parent).reduce((s, b) => s + b.pnl, 0);
        expect(booked, `${code} -> ${parent}`).toBeCloseTo(r.valueDelta[parent]!, 6);
      }
    }
  });

  it('moves product NAV only when the shock reaches a top-level feeder', () => {
    const isolated = Object.keys(simulator.funds).find((code) => {
      const r = shockCascade(index, code, (simulator.funds[code]!.nav ?? 0) + 1000, simulator.funds[code]!.gq, simulator.apex);
      return ![...r.affected].some((a) => simulator.apex.includes(a));
    });
    if (isolated) {
      const r = shockCascade(index, isolated, (simulator.funds[isolated]!.nav ?? 0) + 1000, simulator.funds[isolated]!.gq, simulator.apex);
      expect(r.productValueDelta).toBe(0);
    } else {
      // Every fund in this book reaches an apex, which is itself worth asserting.
      expect(Object.keys(simulator.funds).length).toBe(SHIPPED.fundCount);
    }
  });
});

describe('buildRepriceRun', () => {
  const weightOf = (code: string): number =>
    repricing.funds.find((f) => f.code === code)?.pnlLevel ?? 0;
  const run = buildRepriceRun(simulator, weightOf);

  it('sweeps deepest level first, up to the product', () => {
    expect(run.levels).toEqual([...run.levels].sort((a, b) => b - a));
    expect(run.levels[0]).toBeGreaterThan(run.levels[run.levels.length - 1]!);
  });

  it('excludes the product node from the staged levels', () => {
    const staged = Object.values(run.byLevel).flat();
    expect(staged).not.toContain(simulator.productNodeId);
  });

  it('stages every non-product tree node exactly once', () => {
    const staged = Object.values(run.byLevel).flat();
    const expected = simulator.treeNodes.filter((n) => n.kind !== 'product').length;
    expect(staged).toHaveLength(expected);
    expect(new Set(staged).size).toBe(expected);
  });

  it('lights every co-owner of a node, not just its spanning-tree parent', () => {
    const multi = simulator.treeNodes.find(
      (n) => n.kind !== 'product' && (run.parentsOf[n.id]?.length ?? 0) > 1
    );
    if (multi) {
      expect(run.parentsOf[multi.id]!.length).toBeGreaterThan(1);
      const edges = Object.values(run.edgesByLevel).flat().filter((e) => e.from === multi.id);
      expect(edges).toHaveLength(run.parentsOf[multi.id]!.length);
    } else {
      expect(simulator.edges.length).toBeGreaterThan(0);
    }
  });

  it('reaches a cumulative fraction of exactly 1 at the shallowest level', () => {
    const last = run.levels[run.levels.length - 1]!;
    expect(run.cumulativeFraction[last]).toBeCloseTo(1, 12);
  });

  it('increases the cumulative fraction monotonically', () => {
    let previous = 0;
    for (const level of run.levels) {
      const f = run.cumulativeFraction[level]!;
      expect(f).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = f;
    }
  });

  it('falls back to even steps when no level carries any repricing weight', () => {
    const flat = buildRepriceRun(simulator, () => 0);
    const last = flat.levels[flat.levels.length - 1]!;
    expect(flat.cumulativeFraction[last]).toBeCloseTo(1, 12);
  });
});

describe('pendingShock', () => {
  const fund = { gmv: 500, gq: 100, nav: 400 };

  it('is null without a fund', () => {
    expect(pendingShock(undefined, {}, { mv: null, qty: null, nav: null })).toBeNull();
  });

  it('reports no change when nothing was edited', () => {
    const p = pendingShock(fund, {}, { mv: null, qty: null, nav: null })!;
    expect(p.changed).toBe(false);
    expect(p.field).toBeNull();
    expect(p.value).toBe(400);
  });

  it('takes NAV directly when NAV was edited', () => {
    const p = pendingShock(fund, { nav: true }, { mv: null, qty: null, nav: 450 })!;
    expect(p.field).toBe('NAV');
    expect(p.value).toBe(450);
    expect(p.changed).toBe(true);
  });

  it('applies a market-value edit as a delta onto NAV', () => {
    // MV 500 -> 600 is +100, applied to NAV 400 => 500.
    const p = pendingShock(fund, { mv: true }, { mv: 600, qty: null, nav: null })!;
    expect(p.field).toBe('MV');
    expect(p.value).toBe(500);
  });

  it('holds value and moves only units when quantity was edited', () => {
    const p = pendingShock(fund, { qty: true }, { mv: null, qty: 200, nav: null })!;
    expect(p.field).toBe('Qty');
    expect(p.value).toBe(400);
    expect(p.units).toBe(200);
    expect(p.priceBefore).toBe(4);
    expect(p.priceAfter).toBe(2);
  });

  it('ignores a sub-cent nudge rather than reporting a change', () => {
    const p = pendingShock(fund, { nav: true }, { mv: null, qty: null, nav: 400.4 })!;
    expect(p.changed).toBe(false);
  });
});
