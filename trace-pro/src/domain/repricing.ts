/**
 * Bottom-up NAV repricing.
 *
 * The rule the whole Pricing screen rests on: the deepest (terminal) fund's unit price is
 * NAV ÷ units outstanding. A holder's revised value is Σ (units held × child's revised unit price)
 * plus its own directly-held securities. Repeat upward to the product.
 *
 * Ported from `recomputeR` (line 975) and `reviseApplyNav` (981). `reviseModel` (992) is the other
 * half and lives in `repricing-positions.ts`, which derives a structure from an uploaded report
 * instead of repricing one that already exists. Pure.
 */
import type { RepricingFixture } from './types.js';

/** The structure the recompute walks: children with the share held, plus direct securities. */
export interface RepricingStructure {
  children: Map<string, { code: string; share: number }[]>;
  securitiesValue: Map<string, number>;
  scope: Set<string>;
  apex: string[];
}

/** The fields of a look-through node this rebuild reads. `path` is what carries parentage. */
interface TreeShapeNode {
  id: number;
  path: string;
  kind: string;
  code: string;
  ownpct: number;
  isLeaf: 0 | 1;
  mv100: number;
}

/** The id of a node's parent, read out of its own path. Null for the root. */
function parentIdInPath(path: string): number | null {
  const trail = path.split('/').filter(Boolean).map(Number);
  trail.pop();
  return trail.length ? (trail[trail.length - 1] ?? null) : null;
}

/**
 * Rebuild the structure from the look-through tree, so a NAV-only refresh can reprice without a
 * position report. Was `buildBaseStruct`.
 *
 * PARENTAGE COMES FROM `path`, NOT FROM `holder`. `LookthroughNode` declares `holder`, and a tree
 * built by `lookthroughFromPositions` sets it — but the shipped `lookthrough.json` does not carry the
 * field at all (its 149 nodes have 16 keys, none of them `holder`), and that file is the only tree
 * this function is ever called with. Keying on `holder` therefore filed all 42 vehicle nodes and all
 * 103 leaves under `undefined`, so every fund came out childless: `recomputeRepricedValues` priced
 * each one at its own NAV instead of bottom-up. Measured against the shipped fixture, the NAV-report
 * upload returned R = $2,062,198,835.86 for a book whose revised value is $2,060,610,338.29 — the
 * whole $1,588,497.57 of delta-non-position collapsed to zero, and CRIMAP, which reports no NAV, was
 * valued at $0 instead of $1,190,008,859.58. `path` is present on every node of both trees and is the
 * tree's own statement of who holds whom, so it is the one source of truth used here.
 *
 * SECURITIES ARE COUNTED ONCE PER FUND. A fund held on two chains appears in the tree once per chain,
 * carrying its whole leaf list each time; adding every leaf node's `mv100` double-counted the direct
 * securities of the 17 repeated holders. They are summed PER APPEARANCE and then the largest sum is
 * taken, which is exact: the walk emits either the whole of a fund's leaf list or — where a cycle cut
 * the branch short — none of it, so the appearances that carry leaves all carry the same ones, and
 * taking a maximum cannot pick the empty one.
 */
export function structureFromTree(nodes: readonly TreeShapeNode[]): RepricingStructure {
  const children = new Map<string, { code: string; share: number }[]>();
  const securitiesValue = new Map<string, number>();
  const scope = new Set<string>();
  const apex: string[] = [];
  const seen = new Set<string>();

  const codeById = new Map<number, string>();
  for (const n of nodes) codeById.set(n.id, n.code);
  const codeOfNode = (id: number | null): string => (id == null ? '' : (codeById.get(id) ?? ''));
  /** Σ of the leaf values hanging off ONE appearance of a holder, by that appearance's node id. */
  const leavesByAppearance = new Map<number, number>();

  for (const n of nodes) {
    if (n.kind === 'apex') {
      if (!seen.has(n.code)) {
        apex.push(n.code);
        seen.add(n.code);
      }
      scope.add(n.code);
    } else if (n.kind === 'vehicle') {
      scope.add(n.code);
      const holder = codeOfNode(parentIdInPath(n.path));
      const list = children.get(holder);
      if (!list) children.set(holder, [{ code: n.code, share: n.ownpct }]);
      else if (!list.some((c) => c.code === n.code)) list.push({ code: n.code, share: n.ownpct });
    } else if (n.isLeaf) {
      const holder = parentIdInPath(n.path);
      if (holder == null) continue;
      leavesByAppearance.set(holder, (leavesByAppearance.get(holder) ?? 0) + (n.mv100 ?? 0));
    }
  }
  for (const [appearance, value] of leavesByAppearance) {
    const holder = codeOfNode(appearance);
    const held = securitiesValue.get(holder);
    if (held == null || value > held) securitiesValue.set(holder, value);
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
