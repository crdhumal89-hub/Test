/**
 * The look-through walk and the three values it keeps distinct. If `derived` and `revised` ever
 * blur together the pricing difference silently becomes zero, which reads as "reconciled" — the
 * most dangerous wrong answer this tool can give.
 */
import { describe, it, expect } from 'vitest';
import {
  revisedValueOf,
  navValueOf,
  liveValueOf,
  reconcileNode,
  ancestorIds,
  isVisible,
  hasChildren,
  defaultExpansion,
  allNodeIds,
  visibleNodes,
  expansionRevealing,
  lookThroughValue,
  ownershipShare,
  treeTotals,
  fundEntityNav,
  type PositionIndex,
} from '../../src/domain/lookthrough.js';
import type { LookthroughNode } from '../../src/domain/types.js';
import { formatUsd } from '../../src/domain/money.js';
import { loadFixtures, SHIPPED } from './fixtures.js';

const { lookthrough, repricing } = loadFixtures();
const nodes = lookthrough.nodes;

describe('the shipped tree', () => {
  it('has the node count the original renders when fully expanded', () => {
    expect(nodes).toHaveLength(SHIPPED.treeNodeCount);
  });

  it('sums leaf derived values to the product look-through value', () => {
    const totals = treeTotals(nodes);
    expect(totals.derived).toBeCloseTo(lookthrough.grand, 6);
    expect(totals.derived).toBeCloseTo(SHIPPED.derived, 2);
  });

  it('carries exactly one product node and three top-level feeders', () => {
    expect(nodes.filter((n) => n.kind === 'product')).toHaveLength(1);
    const apex = nodes.filter((n) => n.kind === 'apex').map((n) => n.code);
    expect(apex.sort()).toEqual([...SHIPPED.apex].sort());
  });

  it('keeps the fund-entity NAV distinct from the sum-of-feeders NAV, differing by the DUNK feeder', () => {
    expect(fundEntityNav(lookthrough)).toBe(SHIPPED.fundEntityNav);
    expect(repricing.N).toBe(SHIPPED.nav);
    expect(repricing.N - fundEntityNav(lookthrough)).toBeCloseTo(SHIPPED.dunkNav, 2);
    expect(repricing.navByFund['DUNK']).toBe(SHIPPED.dunkNav);
  });
});

describe('node value attribution', () => {
  const product = nodes.find((n) => n.kind === 'product')!;
  const vehicle = nodes.find((n) => n.kind === 'vehicle' && repricing.revByFund[n.code] != null)!;
  const leaf = nodes.find((n) => n.isLeaf)!;

  it('gives the product the reconciliation totals, not an attributed figure', () => {
    expect(revisedValueOf(product, repricing)).toBe(repricing.R);
    expect(navValueOf(product, repricing)).toBe(repricing.N);
  });

  it('attributes a vehicle by the product effective share', () => {
    const whole = repricing.revByFund[vehicle.code]!;
    expect(revisedValueOf(vehicle, repricing)).toBeCloseTo(vehicle.applied * whole, 6);
  });

  it('leaves a security at its derived value and reports no NAV for it', () => {
    expect(revisedValueOf(leaf, repricing)).toBe(leaf.derived);
    expect(navValueOf(leaf, repricing)).toBeNull();
  });

  it('falls back to derived when a fund reports no revised value', () => {
    const orphan: LookthroughNode = { ...vehicle, code: '__NOT_A_FUND__' };
    expect(revisedValueOf(orphan, repricing)).toBe(orphan.derived);
    expect(navValueOf(orphan, repricing)).toBeNull();
  });

  it('switches the live value with the pricing view, and only for the live value', () => {
    expect(liveValueOf(vehicle, repricing, 'before')).toBe(vehicle.derived);
    expect(liveValueOf(vehicle, repricing, 'after')).toBe(revisedValueOf(vehicle, repricing));
    expect(revisedValueOf(vehicle, repricing)).toBe(revisedValueOf(vehicle, repricing));
  });
});

describe('reconcileNode', () => {
  const product = nodes.find((n) => n.kind === 'product')!;

  it('reproduces the product waterfall in the Before view', () => {
    const r = reconcileNode(product, repricing, 'before');
    expect(r.revised).toBe(repricing.R);
    expect(r.nav).toBe(repricing.N);
    expect(r.deltaPricing).toBeCloseTo(repricing.dPricing, 6);
    expect(r.deltaNonPosition).toBeCloseTo(repricing.dNonPos, 6);
  });

  /**
   * The product NODE's own derived value (lookthrough.json `grand`, 2060224441.4003026) and the
   * repricing fixture's `D` (2060224441.400303) are not bit-equal: the two were summed in
   * different orders, so they differ by about 4e-7. Both round to $2,060,224,441, which is why the
   * original shows them side by side — the tree's product row against the TOTALS row — with no
   * visible discrepancy. Pinned so a future change cannot widen it into something that shows.
   */
  it('agrees with the repricing total to well within a cent, despite summing in a different order', () => {
    const r = reconcileNode(product, repricing, 'before');
    expect(r.derived).toBe(lookthrough.grand);
    expect(r.derived).not.toBe(repricing.D);
    expect(Math.abs(r.derived - repricing.D)).toBeLessThan(1e-6);
    expect(formatUsd(r.derived)).toBe(formatUsd(repricing.D));
  });

  it('closes the pricing difference in the After view', () => {
    const r = reconcileNode(product, repricing, 'after');
    expect(r.derived).toBe(repricing.R);
    expect(r.deltaPricing).toBe(0);
    expect(r.deltaNonPosition).toBeCloseTo(repricing.dNonPos, 6);
  });

  it('reports bps against NAV, and null when there is no NAV to divide by', () => {
    const r = reconcileNode(product, repricing, 'before');
    expect(r.pricingBps).toBeCloseTo((repricing.dPricing / repricing.N) * 1e4, 6);
    const leaf = nodes.find((n) => n.isLeaf)!;
    expect(reconcileNode(leaf, repricing, 'before').pricingBps).toBeNull();
  });

  it('makes the two differences sum to NAV minus the starting value, for every node with a NAV', () => {
    let checked = 0;
    for (const n of nodes) {
      const r = reconcileNode(n, repricing, 'before');
      if (r.nav == null) continue;
      expect(r.deltaPricing + r.deltaNonPosition!).toBeCloseTo(r.nav - r.derived, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('tree shape and expansion', () => {
  it('reads ancestors out of a path, excluding the node itself', () => {
    expect(ancestorIds('0/3/17/')).toEqual([0, 3]);
    expect(ancestorIds('0/')).toEqual([]);
  });

  it('opens the product and its feeders by default, and nothing deeper', () => {
    const expanded = defaultExpansion(nodes);
    const levels = nodes.filter((n) => expanded.has(n.id)).map((n) => n.level);
    expect(Math.max(...levels)).toBe(1);
    // Which yields the 9 rows the original renders on load.
    expect(visibleNodes(nodes, expanded)).toHaveLength(9);
  });

  it('shows every node once fully expanded', () => {
    expect(visibleNodes(nodes, allNodeIds(nodes))).toHaveLength(SHIPPED.treeNodeCount);
  });

  it('hides a node whose ancestor is collapsed', () => {
    const deep = nodes.find((n) => n.level >= 3)!;
    expect(isVisible(deep, defaultExpansion(nodes))).toBe(false);
    expect(isVisible(deep, allNodeIds(nodes))).toBe(true);
  });

  it('reports children only for the immediate next level', () => {
    const product = nodes.find((n) => n.kind === 'product')!;
    const leaf = nodes.find((n) => n.isLeaf)!;
    expect(hasChildren(product, nodes)).toBe(true);
    expect(hasChildren(leaf, nodes)).toBe(false);
  });

  it('expands just enough to reveal a fund the user jumped to', () => {
    const target = nodes.find((n) => n.level >= 3 && n.code)!;
    const { expanded, node } = expansionRevealing(nodes, target.code, defaultExpansion(nodes));
    expect(node).not.toBeNull();
    expect(isVisible(node!, expanded)).toBe(true);
  });

  it('returns no node for a code that is not in the tree', () => {
    const { node } = expansionRevealing(nodes, '__MISSING__', new Set());
    expect(node).toBeNull();
  });
});

/* ------------------------------------------------------------------ walk from positions */

/** A hand-built position index: PROD holds 50% of MID, which holds a $200 security. */
function indexOf(): PositionIndex {
  return {
    edgeUnits: new Map([['PROD|MID', 50]]),
    globalUnits: new Map([['MID', 100]]),
    carried: new Map(),
    childrenByHolder: new Map([['PROD', new Set(['MID'])]]),
    leavesByFund: new Map([['MID', [{ sec: 'S1', name: 'Sec 1', issuer: 'I', qty: 1, mv: 200 }]]]),
    fundName: new Map(),
    navByEntity: new Map(),
    symByInv: new Map(),
    secIndex: new Map(),
    entHolders: new Map(),
    entInvestees: new Map(),
  };
}

describe('lookThroughValue', () => {
  it('is a holder share times the child look-through value', () => {
    const index = indexOf();
    expect(ownershipShare(index, 'PROD', 'MID')).toBe(0.5);
    expect(lookThroughValue(index, 'MID', new Map(), new Set())).toBe(200);
    expect(lookThroughValue(index, 'PROD', new Map(), new Set())).toBe(100);
  });

  it('adds a fund own securities to its children value', () => {
    const index = indexOf();
    index.leavesByFund.set('PROD', [{ sec: 'S2', name: 'Sec 2', issuer: 'I', qty: 1, mv: 25 }]);
    expect(lookThroughValue(index, 'PROD', new Map(), new Set())).toBe(125);
  });

  it('values a re-entered fund at zero so a cycle terminates', () => {
    const index = indexOf();
    index.childrenByHolder.set('MID', new Set(['PROD']));
    index.edgeUnits.set('MID|PROD', 10);
    index.globalUnits.set('PROD', 100);
    const value = lookThroughValue(index, 'PROD', new Map(), new Set());
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(100);
  });

  it('is zero for a fund with nothing beneath it', () => {
    expect(lookThroughValue(indexOf(), 'UNKNOWN', new Map(), new Set())).toBe(0);
  });

  it('returns zero share when no units are outstanding, rather than dividing by zero', () => {
    const index = indexOf();
    index.globalUnits.set('MID', 0);
    expect(ownershipShare(index, 'PROD', 'MID')).toBe(0);
  });
});
