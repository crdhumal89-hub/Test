/**
 * Bottom-up NAV repricing.
 *
 * The rule the whole Pricing screen rests on: the deepest (terminal) fund's unit price is
 * NAV ÷ units outstanding. A holder's revised value is Σ (units held × child's revised unit price)
 * plus its own directly-held securities. Repeat upward to the product.
 *
 * Ported from `recomputeR` (line 975), `reviseApplyNav` (981) and `reviseModel` (992). Pure.
 */
import type { RepricingFixture, RepricingFund } from './types.js';
import type { PositionIndex } from './lookthrough.js';
import { lookThroughValue, ownershipShare } from './lookthrough.js';
import { TRUNCATE } from './exceptions.js';

/** The structure the recompute walks: children with the share held, plus direct securities. */
export interface RepricingStructure {
  children: Map<string, { code: string; share: number }[]>;
  securitiesValue: Map<string, number>;
  scope: Set<string>;
  apex: string[];
}

/**
 * Rebuild the structure from the look-through tree, so a NAV-only refresh can reprice without a
 * position report. Was `buildBaseStruct`.
 */
export function structureFromTree(nodes: readonly { kind: string; code: string; holder: string; ownpct: number; isLeaf: 0 | 1; mv100: number }[]): RepricingStructure {
  const children = new Map<string, { code: string; share: number }[]>();
  const securitiesValue = new Map<string, number>();
  const scope = new Set<string>();
  const apex: string[] = [];
  const seen = new Set<string>();

  for (const n of nodes) {
    if (n.kind === 'apex') {
      if (!seen.has(n.code)) {
        apex.push(n.code);
        seen.add(n.code);
      }
      scope.add(n.code);
    } else if (n.kind === 'vehicle') {
      scope.add(n.code);
      const list = children.get(n.holder);
      if (!list) children.set(n.holder, [{ code: n.code, share: n.ownpct }]);
      else if (!list.some((c) => c.code === n.code)) list.push({ code: n.code, share: n.ownpct });
    } else if (n.isLeaf) {
      securitiesValue.set(n.holder, (securitiesValue.get(n.holder) ?? 0) + (n.mv100 ?? 0));
    }
  }
  return { children, securitiesValue, scope, apex: apex.sort() };
}

/**
 * Revised value of every fund in scope, bottom-up. Was `recomputeR`.
 *
 * A fund with no children prices from its own NAV (or its securities if it reports none). A fund
 * with children is worth its own securities plus each child's revised value × the share held.
 * `onStack` returns zero for a re-entered fund, which is how cross-holdings terminate.
 */
export function recomputeRepricedValues(
  structure: RepricingStructure,
  navByFund: Readonly<Record<string, number>>
): Map<string, number> {
  const revised = new Map<string, number>();

  const recurse = (fund: string, onStack: Set<string>): number => {
    const cached = revised.get(fund);
    if (cached !== undefined) return cached;
    if (onStack.has(fund)) return 0;
    onStack.add(fund);
    const kids = structure.children.get(fund) ?? [];
    let value: number;
    if (!kids.length) {
      const nav = navByFund[fund];
      value = nav != null ? nav : (structure.securitiesValue.get(fund) ?? 0);
    } else {
      value = structure.securitiesValue.get(fund) ?? 0;
      for (const child of kids) value += child.share * recurse(child.code, onStack);
    }
    onStack.delete(fund);
    revised.set(fund, value);
    return value;
  };

  for (const fund of structure.scope) recurse(fund, new Set());
  return revised;
}

/** The product-level figures of a repricing. */
export interface RepricingTotals {
  N: number;
  D: number;
  R: number;
  dPricing: number;
  dNonPos: number;
  tie: number;
}

export function totalsFor(
  apex: readonly string[],
  derivedByFund: Readonly<Record<string, number>> | Map<string, number>,
  revisedByFund: Map<string, number>,
  navByFund: Readonly<Record<string, number>>
): RepricingTotals {
  const derivedOf = (code: string): number =>
    derivedByFund instanceof Map ? (derivedByFund.get(code) ?? 0) : (derivedByFund[code] ?? 0);
  const D = apex.reduce((s, a) => s + derivedOf(a), 0);
  const R = apex.reduce((s, a) => s + (revisedByFund.get(a) ?? 0), 0);
  const N = apex.reduce((s, a) => s + (navByFund[a] ?? 0), 0);
  return { N, D, R, dPricing: R - D, dNonPos: N - R, tie: R - D + (N - R) };
}

/**
 * Apply a new NAV map to an unchanged structure. Was `reviseApplyNav`.
 * Returns a new fixture rather than mutating, so a failed upload cannot corrupt what is on screen.
 */
export function applyNavOnly(
  base: RepricingFixture,
  structure: RepricingStructure,
  navByFund: Readonly<Record<string, number>>
): RepricingFixture {
  const revised = recomputeRepricedValues(structure, navByFund);
  const next: RepricingFixture = JSON.parse(JSON.stringify(base)) as RepricingFixture;

  next.navByFund = {};
  for (const code of Object.keys(base.gqByFund)) {
    const nav = navByFund[code];
    if (nav != null) next.navByFund[code] = nav;
  }
  next.revByFund = {};
  for (const code of structure.scope) next.revByFund[code] = revised.get(code) ?? 0;

  const totals = totalsFor(next.apex, base.ltvByFund, revised, navByFund);
  next.N = totals.N;
  next.R = totals.R;
  next.dPricing = next.R - next.D;
  next.dNonPos = next.N - next.R;
  next.tie = next.dPricing + next.dNonPos;

  for (const f of next.funds) {
    const r = revised.get(f.code) ?? 0;
    const nav = navByFund[f.code];
    f.rev = r;
    f.nav = nav != null ? nav : null;
    f.hasNav = f.nav != null ? 1 : 0;
    f.revPx = f.gq ? r / f.gq : null;
    f.navPx = f.nav != null && f.gq ? f.nav / f.gq : null;
    f.dPricing = r - f.ltv;
    f.pnlLevel = r - f.ltv;
    f.dNonPos = f.nav != null ? f.nav - r : null;
    for (const h of f.holdings) {
      const ri = revised.get(h.i) ?? 0;
      const hn = navByFund[h.i];
      h.rev = ri;
      h.nav = hn != null ? hn : null;
      h.revPx = h.gq ? ri / h.gq : null;
      h.pnl = h.ownpct * (ri - h.ltv);
    }
  }
  return next;
}

/**
 * Full recompute from an uploaded position report. Was `reviseModel`.
 *
 * Builds structure, ownership shares and derived values from the position index, reprices
 * bottom-up against the NAV map, and emits a complete repricing fixture for the product.
 */
export function repriceFromPositions(
  index: PositionIndex,
  navByFund: Readonly<Record<string, number>>,
  product: string,
  asof: string
): RepricingFixture {
  const children = new Map<string, { code: string; share: number }[]>();
  const holdersOf = new Map<string, [string, number][]>();
  const securitiesValue = new Map<string, number>();

  for (const [key, units] of index.edgeUnits) {
    const split = key.indexOf('|');
    const holder = key.slice(0, split);
    const investee = key.slice(split + 1);
    if (holder === investee) continue;
    const outstanding = index.globalUnits.get(investee) ?? 0;
    const list = children.get(holder);
    const entry = { code: investee, share: outstanding ? units / outstanding : 0 };
    if (!list) children.set(holder, [entry]);
    else if (!list.some((c) => c.code === investee)) list.push(entry);
    const hl = holdersOf.get(investee);
    if (hl) hl.push([holder, units]);
    else holdersOf.set(investee, [[holder, units]]);
  }
  for (const [fund, leaves] of index.leavesByFund) {
    securitiesValue.set(fund, leaves.reduce((s, l) => s + l.mv, 0));
  }

  const held = index.entHolders.get(product) ?? new Set<string>();
  const investees = index.entInvestees.get(product) ?? new Set<string>();
  const apex = [...held].filter((x) => x && !investees.has(x)).sort();

  const scope = new Set(apex);
  const stack = [...apex];
  while (stack.length) {
    const fund = stack.pop()!;
    for (const child of children.get(fund) ?? []) {
      if (!scope.has(child.code)) {
        scope.add(child.code);
        stack.push(child.code);
      }
    }
  }

  const structure: RepricingStructure = { children, securitiesValue, scope, apex };
  const revised = recomputeRepricedValues(structure, navByFund);
  const memo = new Map<string, number>();
  const derivedOf = (code: string): number => lookThroughValue(index, code, memo, new Set());

  const level = new Map<string, number>();
  for (const a of apex) level.set(a, 1);
  const queue = [...apex];
  while (queue.length) {
    const fund = queue.shift()!;
    const kids = [...new Set((children.get(fund) ?? []).map((c) => c.code))].sort();
    for (const code of kids) {
      if (!level.has(code)) {
        level.set(code, (level.get(fund) ?? 1) + 1);
        queue.push(code);
      }
    }
  }
  const maxlevel = Math.max(1, ...[...level.values()]);

  const navByFundOut: Record<string, number> = {};
  const revByFund: Record<string, number> = {};
  const ltvByFund: Record<string, number> = {};
  const gqByFund: Record<string, number> = {};
  for (const code of scope) {
    revByFund[code] = revised.get(code) ?? 0;
    ltvByFund[code] = derivedOf(code);
    gqByFund[code] = index.globalUnits.get(code) ?? 0;
    const nav = navByFund[code];
    if (nav != null) navByFundOut[code] = nav;
  }

  const totals = totalsFor(apex, ltvByFund, revised, navByFund);

  const funds: RepricingFund[] = [...scope]
    .sort((a, b) => (level.get(b) ?? 99) - (level.get(a) ?? 99))
    .map((code) => {
      const nav = navByFund[code] ?? null;
      const gq = index.globalUnits.get(code) ?? 0;
      const derived = derivedOf(code);
      const rev = revised.get(code) ?? 0;
      const holdings = [...new Set((children.get(code) ?? []).map((c) => c.code))].sort().map((i) => {
        const gqi = index.globalUnits.get(i) ?? 0;
        const share = ownershipShare(index, code, i);
        const di = derivedOf(i);
        const ri = revised.get(i) ?? 0;
        return {
          i,
          name: index.fundName.get(i) ?? i,
          sym: index.symByInv.get(i) ?? i,
          units: index.edgeUnits.get(`${code}|${i}`) ?? 0,
          ownpct: share,
          gq: gqi,
          ltv: di,
          rev: ri,
          nav: navByFund[i] ?? null,
          curPx: gqi ? di / gqi : null,
          revPx: gqi ? ri / gqi : null,
          pnl: share * (ri - di),
        };
      });
      const holders = (holdersOf.get(code) ?? [])
        .map(([h, units]) => ({ h, units, ownpct: gq ? units / gq : 0 }))
        .sort((a, b) => b.units - a.units)
        .slice(0, TRUNCATE.simHolders);
      return {
        code,
        name: index.fundName.get(code) ?? code,
        sym: index.symByInv.get(code) ?? code,
        level: level.get(code) ?? maxlevel + 1,
        terminal: (children.get(code) ?? []).length ? 0 : 1,
        hasNav: nav != null ? 1 : 0,
        nav,
        gq,
        secMV: securitiesValue.get(code) ?? 0,
        ltv: derived,
        rev,
        curPx: gq ? derived / gq : null,
        revPx: gq ? rev / gq : null,
        navPx: nav != null && gq ? nav / gq : null,
        pnlLevel: rev - derived,
        dPricing: rev - derived,
        dNonPos: nav != null ? nav - rev : null,
        nHolders: (holdersOf.get(code) ?? []).length,
        holdings,
        holders,
      } satisfies RepricingFund;
    });

  const breaks = detectBreaks(index, scope, holdersOf, navByFund, apex);

  return {
    product,
    productCode: (product || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() || 'PRODUCT',
    asof,
    breaks,
    ...totals,
    navByFund: navByFundOut,
    revByFund,
    ltvByFund,
    gqByFund,
    apex,
    funds,
    nFunds: scope.size,
    maxlevel,
  };
}

/** Structural data faults the repricing can detect on the way through. */
function detectBreaks(
  index: PositionIndex,
  scope: ReadonlySet<string>,
  holdersOf: Map<string, [string, number][]>,
  navByFund: Readonly<Record<string, number>>,
  apex: readonly string[]
): { type: string; code: string; detail: string }[] {
  const breaks: { type: string; code: string; detail: string }[] = [];
  const referenced = new Set<string>();
  for (const key of index.edgeUnits.keys()) referenced.add(key.slice(0, key.indexOf('|')));
  for (const fund of index.leavesByFund.keys()) referenced.add(fund);

  for (const fund of scope) {
    const heldUnits = (holdersOf.get(fund) ?? []).reduce((s, [, u]) => s + u, 0);
    const outstanding = index.globalUnits.get(fund) ?? 0;
    const nav = navByFund[fund];
    if (outstanding && heldUnits > outstanding * 1.0001) {
      breaks.push({ type: 'own>100%', code: fund, detail: 'held units exceed global units' });
    }
    if (!referenced.has(fund) && !apex.includes(fund)) {
      breaks.push({ type: 'dangling SPV', code: fund, detail: 'referenced as SPV but no positions' });
    }
    if (nav == null && outstanding) {
      breaks.push({ type: 'no NAV', code: fund, detail: 'held but no ENDING_NAV' });
    }
    if (nav != null && outstanding && nav / outstanding <= 0) {
      breaks.push({ type: 'bad price', code: fund, detail: 'NAV/units non-positive' });
    }
  }
  return breaks;
}
