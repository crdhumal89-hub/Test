/**
 * The additive reconciliation, and the per-driver bridge.
 *
 *   look-through value (current marks)
 *   + pricing difference          (bottom-up NAV repricing)
 *   = repriced value
 *   + non-position difference     (cash, fees, receivables in NAV but not held as positions)
 *   = NAV
 *
 * The tie check exists because the two differences must sum to NAV − look-through value exactly;
 * anything left over is an arithmetic fault, not a business figure.
 *
 * Ported from `renderWaterfall` (line 1069) and `renderBridge` (1332), with the presentation
 * stripped out. Pure.
 */
import type { PricingView, RepricingFixture } from './types.js';

export interface WaterfallStep {
  /** 'start' | 'mid' | 'end' for the value boxes; 'op' for the + operators. */
  kind: 'value' | 'operator';
  label: string;
  basis: string;
  usd: number;
  bps: number | null;
  /** True when the pricing gap is reconciled away in the After view. */
  reconciled?: boolean;
}

export interface Waterfall {
  steps: WaterfallStep[];
  start: number;
  revised: number;
  nav: number;
  deltaPricing: number;
  deltaNonPosition: number;
  tie: number;
  target: number;
  residual: number;
  ties: boolean;
}

/**
 * Build the waterfall for the active view.
 *
 * In the After view the pricing difference is presented as reconciled to zero and the walk starts
 * from the repriced value — the same endpoint the staged reprice lands on — so a resting After
 * view and a completed reprice agree to the cent.
 */
export function buildWaterfall(repricing: RepricingFixture, view: PricingView): Waterfall {
  const after = view === 'after';
  const { D, R, N } = repricing;
  const start = after ? R : D;
  const deltaPricing = after ? 0 : R - D;
  const deltaNonPosition = N - R;
  const tie = deltaPricing + deltaNonPosition;
  const target = N - start;
  const residual = tie - target;
  const bps = (v: number): number | null => (N ? (v / N) * 1e4 : null);

  const steps: WaterfallStep[] = [
    {
      kind: 'value',
      label: after ? 'Repriced MV' : 'Derived MV',
      basis: after ? 'every component at its revised price' : 'look-through of underlyings · current marks',
      usd: start,
      bps: null,
    },
    {
      kind: 'operator',
      label: 'Δ Pricing',
      basis: after ? 'reconciled · no pricing break' : 'bottom-up NAV repricing',
      usd: deltaPricing,
      bps: after ? 0 : bps(deltaPricing),
      reconciled: after,
    },
    { kind: 'value', label: 'Revised MV', basis: 'NAV-repriced bottom-up', usd: R, bps: null },
    {
      kind: 'operator',
      label: 'Δ Non-position',
      basis: after ? 'non-trade · cash / fees' : 'cash / fees / receivables',
      usd: deltaNonPosition,
      bps: bps(deltaNonPosition),
    },
    { kind: 'value', label: 'NAV', basis: 'Σ apex ENDING_NAV · NAV report', usd: N, bps: null },
  ];

  return {
    steps,
    start,
    revised: R,
    nav: N,
    deltaPricing,
    deltaNonPosition,
    tie,
    target,
    residual,
    ties: Math.abs(residual) < 0.5,
  };
}

export interface BridgeDriver {
  code: string;
  name: string;
  nav: number;
  derived: number;
  gap: number;
  /** 'b' when NAV sits above the look-through value, 'a' when below. The original's shorthand. */
  scenario: 'a' | 'b';
  bps: number;
}

export interface Bridge {
  productNav: number;
  derived: number;
  gap: number;
  gapBps: number;
  /** Σ of every fund's NAV — deliberately NOT the product NAV; the screen says so out loud. */
  sumAllFundNav: number;
  fundCount: number;
  drivers: BridgeDriver[];
  maxAbsGap: number;
}

/**
 * Per-apex-driver bridge from NAV to look-through value.
 *
 * Driven off the SAME source as the waterfall (Σ apex ENDING_NAV vs the derived map) so the bars
 * sum EXACTLY to the headline gap and product NAV is one authoritative figure across screens.
 */
export function buildBridge(repricing: RepricingFixture, view: PricingView): Bridge {
  const after = view === 'after';
  const navByFund = repricing.navByFund;
  const valueByFund = after ? repricing.revByFund : repricing.ltvByFund;

  const drivers: BridgeDriver[] = repricing.apex
    .map((code) => {
      const nav = navByFund[code] ?? 0;
      const derived = valueByFund[code] ?? 0;
      const gap = nav - derived;
      const fund = repricing.funds.find((f) => f.code === code);
      return {
        code,
        name: fund?.name ?? code,
        nav,
        derived,
        gap,
        scenario: (gap > 0 ? 'b' : 'a') as 'a' | 'b',
        bps: nav ? (gap / nav) * 1e4 : 0,
      };
    })
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));

  const productNav = repricing.N;
  const derived = after ? repricing.R : repricing.D;
  const gap = productNav - derived;

  return {
    productNav,
    derived,
    gap,
    gapBps: productNav ? (gap / productNav) * 1e4 : 0,
    sumAllFundNav: repricing.funds.reduce((s, f) => s + (f.nav ?? 0), 0),
    fundCount: repricing.funds.length,
    drivers,
    maxAbsGap: Math.max(1, ...drivers.map((d) => Math.abs(d.gap))),
  };
}

/**
 * Does the bridge close? The per-driver gaps must sum to the headline gap, which is the property
 * that makes the bars trustworthy rather than decorative.
 */
export function bridgeCloses(bridge: Bridge, tolerance = 0.5): boolean {
  const sum = bridge.drivers.reduce((s, d) => s + d.gap, 0);
  return Math.abs(sum - bridge.gap) < tolerance;
}

/** The five rows of the staged-reprice ledger. */
export interface RepriceLedger {
  derivedBefore: number;
  repricingPnl: number;
  revised: number;
  nonPosition: number;
  productNav: number;
}

export function repriceLedger(repricing: RepricingFixture): RepriceLedger {
  return {
    derivedBefore: repricing.D,
    repricingPnl: repricing.dPricing,
    revised: repricing.R,
    nonPosition: repricing.dNonPos,
    productNav: repricing.N,
  };
}

/**
 * Progressive P&L as the staged reprice advances. `fraction` is the cumulative repricing activity
 * completed; the final call snaps to the exact pricing difference so the animation cannot end on a
 * rounded figure.
 */
export function repriceProgress(
  repricing: RepricingFixture,
  fraction: number,
  finished: boolean
): { pnl: number; lookthrough: number } {
  const pnl = finished ? repricing.dPricing : repricing.dPricing * (fraction || 0);
  return { pnl, lookthrough: repricing.D + pnl };
}
