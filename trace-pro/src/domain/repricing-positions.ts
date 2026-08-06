/**
 * Full recompute from an uploaded Position Report.
 *
 * Split out of `repricing.ts`, which holds the recompute itself: this module is the one that turns a
 * position INDEX into a complete repricing fixture, and it is reached only from the upload path. The
 * two halves are separated because they answer to different inputs — `repricing.ts` reprices a
 * structure that already exists, this file derives the structure first — and because together they
 * ran past the 400-line limit.
 *
 * Ported from `reviseModel` (original line 992). Pure: no DOM, no state.
 */
import type { RepricingFixture, RepricingFund } from './types.js';
import type { PositionIndex } from './lookthrough.js';
import { lookThroughValue, ownershipShare } from './lookthrough.js';
import { recomputeRepricedValues, totalsFor } from './repricing.js';
import type { RepricingStructure } from './repricing.js';
import { TRUNCATE } from './exceptions.js';

/** The product's reporting code as a fallback, when the caller cannot supply the real one. */
function productCodeFrom(product: string): string {
  return (product || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() || 'PRODUCT';
}

/**
 * Full recompute from an uploaded position report. Was `reviseModel`.
 *
 * Builds structure, ownership shares and derived values from the position index, reprices
 * bottom-up against the NAV map, and emits a complete repricing fixture for the product.
 *
 * `productCode` is passed in because a position report cannot carry it: the file names the fund
 * ENTITY ("Apollo Sports Capital") and nothing else, so deriving the code from that name yields
 * APOLLOSPOR where the product's own code is SPORT — and that code is rendered, on the Pricing
 * screen's active-product line and at the head of the repricing walk. The caller knows it from the
 * data manifest, so it is threaded through rather than invented; the derived slug remains as a
 * fallback for a caller that genuinely has no code.
 */
export function repriceFromPositions(
  index: PositionIndex,
  navByFund: Readonly<Record<string, number>>,
  product: string,
  asof: string,
  productCode?: string
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

  /*
   * Deepest first, then by code. The code is the tiebreak because level alone leaves the order of a
   * level to `scope`'s insertion order, which is the order a depth-first stack happened to pop the
   * funds in — so the walk and any unsorted table drew one order from the shipped extract and a
   * different one from an uploaded report describing the identical book.
   */
  const funds: RepricingFund[] = [...scope]
    .sort((a, b) => (level.get(b) ?? 99) - (level.get(a) ?? 99) || (a < b ? -1 : a > b ? 1 : 0))
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
    productCode: productCode || productCodeFrom(product),
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
