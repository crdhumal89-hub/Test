/**
 * Look-through: what the product's holdings are worth when you value the underlyings and roll them
 * up through ownership.
 *
 * Three values per node, and the whole application hinges on keeping them distinct:
 *   derived  — the underlyings at TODAY'S marks, weighted by the product's effective share
 *   revised  — the same tree with every fund NAV-repriced bottom-up
 *   nav      — the fund's own reported NAV, weighted by the product's effective share
 *
 * Ported from `revMVof` / `navMVof` / `liveMVof` (lines 884-906) and `LTV` / `buildModel` /
 * `walk` (1058-1066). Pure: no DOM, no state.
 */
import type {
  LookthroughFixture,
  LookthroughNode,
  PricingView,
  RepricingFixture,
} from './types.js';

/** Product-attributed revised value of a node. Was `revMVof`. */
export function revisedValueOf(node: LookthroughNode, repricing: RepricingFixture): number {
  if (node.kind === 'product') return repricing.R;
  if (node.isLeaf) return node.derived;
  const r = repricing.revByFund[node.code];
  return r != null ? node.applied * r : node.derived;
}

/** Product-attributed NAV of a node, or null where the fund reports none. Was `navMVof`. */
export function navValueOf(node: LookthroughNode, repricing: RepricingFixture): number | null {
  if (node.kind === 'product') return repricing.N;
  if (node.isLeaf) return null;
  const v = repricing.navByFund[node.code];
  return v != null ? node.applied * v : null;
}

/** The value shown in the active pricing view. Was `liveMVof`. */
export function liveValueOf(
  node: LookthroughNode,
  repricing: RepricingFixture,
  view: PricingView
): number {
  return view === 'after' ? revisedValueOf(node, repricing) : node.derived;
}

/** The three figures a reconciliation row shows, plus their bps. */
export interface NodeReconciliation {
  derived: number;
  revised: number;
  nav: number | null;
  deltaPricing: number;
  deltaNonPosition: number | null;
  pricingBps: number | null;
  nonPositionBps: number | null;
}

export function reconcileNode(
  node: LookthroughNode,
  repricing: RepricingFixture,
  view: PricingView
): NodeReconciliation {
  const derived = liveValueOf(node, repricing, view);
  const revised = revisedValueOf(node, repricing);
  const nav = navValueOf(node, repricing);
  const deltaPricing = revised - derived;
  const deltaNonPosition = nav == null ? null : nav - revised;
  return {
    derived,
    revised,
    nav,
    deltaPricing,
    deltaNonPosition,
    pricingBps: nav ? (deltaPricing / nav) * 1e4 : null,
    nonPositionBps: nav && deltaNonPosition != null ? (deltaNonPosition / nav) * 1e4 : null,
  };
}

/* ------------------------------------------------------------------ tree shape */

/** Ancestor node ids encoded in a node's path. Was `anc`. */
export function ancestorIds(path: string): number[] {
  const ids = path.split('/').filter(Boolean).map(Number);
  ids.pop();
  return ids;
}

/** Is every ancestor of this node expanded? Was `vis`. */
export function isVisible(node: LookthroughNode, expanded: ReadonlySet<number>): boolean {
  return ancestorIds(node.path).every((id) => expanded.has(id));
}

/** Does this node have children? Was `hasKids`. */
export function hasChildren(node: LookthroughNode, all: readonly LookthroughNode[]): boolean {
  const depth = node.path.split('/').filter(Boolean).length;
  return all.some(
    (x) =>
      x.path.startsWith(node.path) &&
      x.id !== node.id &&
      x.path.split('/').filter(Boolean).length === depth + 1
  );
}

/** The default expansion: the product and its top-level feeders. Was `defExp`. */
export function defaultExpansion(nodes: readonly LookthroughNode[]): Set<number> {
  const out = new Set<number>();
  for (const n of nodes) if (n.level <= 1) out.add(n.id);
  return out;
}

/** Every node id, for Expand all. */
export function allNodeIds(nodes: readonly LookthroughNode[]): Set<number> {
  return new Set(nodes.map((n) => n.id));
}

/** The visible rows in tree order, given an expansion set. */
export function visibleNodes(
  nodes: readonly LookthroughNode[],
  expanded: ReadonlySet<number>
): LookthroughNode[] {
  return nodes.filter((n) => isVisible(n, expanded));
}

/** Expand every ancestor of a node so it becomes reachable. Was part of `scrollToFund`. */
export function expansionRevealing(
  nodes: readonly LookthroughNode[],
  code: string,
  current: ReadonlySet<number>
): { expanded: Set<number>; node: LookthroughNode | null } {
  const node = nodes.find((n) => n.code === code) ?? null;
  const expanded = new Set(current);
  if (node) for (const id of ancestorIds(node.path)) expanded.add(id);
  return { expanded, node };
}

/* ------------------------------------------------------------------ from a position report */

/** The maps a position report is indexed into. Was the return of `buildMaps`. */
export interface PositionIndex {
  edgeUnits: Map<string, number>;
  globalUnits: Map<string, number>;
  carried: Map<string, number>;
  childrenByHolder: Map<string, Set<string>>;
  leavesByFund: Map<string, { sec: string; name: string; issuer: string; qty: number; mv: number }[]>;
  fundName: Map<string, string>;
  navByEntity: Map<string, number>;
  symByInv: Map<string, string>;
  secIndex: Map<string, { name: string; issuer: string; totalQty: number; holders: [string, number][] }>;
  entHolders: Map<string, Set<string>>;
  entInvestees: Map<string, Set<string>>;
}

/** A holder's share of an investee. Was `ownpct`. */
export function ownershipShare(index: PositionIndex, holder: string, investee: string): number {
  const outstanding = index.globalUnits.get(investee) ?? 0;
  if (!outstanding) return 0;
  return (index.edgeUnits.get(`${holder}|${investee}`) ?? 0) / outstanding;
}

/**
 * Value of 100% of a fund by looking through it: its own securities plus each child's
 * look-through value weighted by the share held. Was `LTV` — renamed to resolve the
 * four-way collision documented in spec §3.2.
 *
 * `onStack` breaks cycles by valuing a re-entered fund at zero, which is the original's behaviour
 * and is why the universe's 2 circular mappings do not hang the walk.
 */
export function lookThroughValue(
  index: PositionIndex,
  fund: string,
  memo: Map<string, number>,
  onStack: Set<string>
): number {
  const cached = memo.get(fund);
  if (cached !== undefined) return cached;
  if (onStack.has(fund)) return 0;
  onStack.add(fund);
  let value = 0;
  for (const leaf of index.leavesByFund.get(fund) ?? []) value += leaf.mv;
  for (const child of index.childrenByHolder.get(fund) ?? []) {
    value += ownershipShare(index, fund, child) * lookThroughValue(index, child, memo, onStack);
  }
  onStack.delete(fund);
  memo.set(fund, value);
  return value;
}

/** Totals a look-through tree asserts about itself. */
export interface TreeTotals {
  derived: number;
  positionAttributed: number;
  variance: number;
}

/** Σ of leaf derived values is the product's look-through value. Was inline in `buildModel`. */
export function treeTotals(nodes: readonly LookthroughNode[]): TreeTotals {
  const derived = nodes.filter((n) => n.isLeaf).reduce((s, n) => s + n.derived, 0);
  const positionAttributed = nodes
    .filter((n) => n.kind === 'apex')
    .reduce((s, n) => s + n.position, 0);
  return { derived, positionAttributed, variance: derived - positionAttributed };
}

/** The fixture's own headline, kept separate from the repricing fixture's Σ-apex NAV. */
export function fundEntityNav(lookthrough: LookthroughFixture): number {
  return lookthrough.prodNAV;
}
