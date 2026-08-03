/**
 * Ownership: who holds whom, and what each ultimate parent's effective share is.
 *
 * The effective-share solve is a fixed point rather than a tree walk, because the firm's structure
 * contains cross-holdings and cycles (the universe fixture reports 2 circular mappings and 43
 * self-mappings). A naive recursive walk would either double-count or not terminate. Ported from
 * the original's `solveU` (line 1149) and `effOwners` (1155).
 *
 * Pure: no DOM, no state.
 */
import type { UniverseFixture } from './types.js';

/** Quantity held, by holder, of one entity. */
export type HolderQty = [holder: string, units: number];

export interface SecurityIndexEntry {
  name: string;
  issuer: string;
  totalQty: number;
  holders: HolderQty[];
}

/** The graph the ownership screens read. `secIndex` is present only after a position upload. */
export interface OwnershipGraph {
  /** entity -> its immediate holders and their units. */
  owners: Map<string, HolderQty[]>;
  /** entity -> units outstanding firm-wide. */
  globalUnits: Map<string, number>;
  /** entities held by nobody: the tops of the ownership chains. */
  ultimates: Set<string>;
  names: Record<string, string>;
  symByInv: Record<string, string>;
  secIndex: Map<string, SecurityIndexEntry> | null;
}

/** Build the graph from `universe.json` (was `buildRevFromUNI`). */
export function graphFromUniverse(universe: UniverseFixture): OwnershipGraph {
  const owners = new Map<string, HolderQty[]>();
  for (const [h, i, u] of universe.edges) {
    if (h === i) continue; // a self-mapping holds nothing; the Issue Log reports these separately
    const list = owners.get(i);
    if (list) list.push([h, +u]);
    else owners.set(i, [[h, +u]]);
  }
  const globalUnits = new Map<string, number>();
  for (const [k, v] of Object.entries(universe.gu)) globalUnits.set(k, +v);
  return {
    owners,
    globalUnits,
    ultimates: new Set(universe.ultimates),
    names: universe.names,
    symByInv: universe.symByInv,
    secIndex: null,
  };
}

/** Is this code a security rather than a fund/SPV? */
export function isSecurity(g: OwnershipGraph, code: string): boolean {
  return !!g.secIndex && g.secIndex.has(code) && !g.globalUnits.has(code);
}

/** Units outstanding of an entity, or total quantity of a security. */
export function totalQuantity(g: OwnershipGraph, code: string): number {
  if (isSecurity(g, code)) return g.secIndex!.get(code)!.totalQty;
  return g.globalUnits.get(code) ?? 0;
}

/** Immediate holders of an entity, largest first is NOT guaranteed — callers sort. */
export function immediateHolders(g: OwnershipGraph, code: string): HolderQty[] {
  if (isSecurity(g, code)) return g.secIndex!.get(code)!.holders.map(([f, q]) => [f, q] as HolderQty);
  return g.owners.get(code) ?? [];
}

export function displayName(g: OwnershipGraph, code: string): string {
  return g.names[code] ?? g.secIndex?.get(code)?.name ?? code;
}

export function vpmSymbol(g: OwnershipGraph, code: string): string {
  return g.symByInv[code] ?? code;
}

/** One holder's direct share of the entity below it: units held ÷ units outstanding. */
export function directShare(unitsHeld: number, unitsOutstanding: number): number {
  return unitsOutstanding ? unitsHeld / unitsOutstanding : 0;
}

const MAX_ITERATIONS = 120;
const CONVERGED = 1e-12;

/**
 * Effective share of every non-ultimate entity, attributed up to its ultimate parents.
 *
 * Jacobi iteration to a fixed point: each pass recomputes an entity's parent weights from its
 * holders' current weights, so value flowing round a cycle converges instead of recursing forever.
 * Ultimates anchor the system at weight 1 on themselves. Was `solveU`.
 *
 * @returns entity code -> (ultimate parent -> share). Shares sum to 1 per entity.
 */
export function solveEffectiveShares(g: OwnershipGraph): Map<string, Map<string, number>> {
  const shares = new Map<string, Map<string, number>>();
  const nodes = [...g.globalUnits.keys()].filter((n) => !g.ultimates.has(n));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let maxDelta = 0;
    for (const node of nodes) {
      const outstanding = g.globalUnits.get(node) ?? 0;
      const acc = new Map<string, number>();
      if (outstanding > 0) {
        for (const [holder, units] of g.owners.get(node) ?? []) {
          const fraction = units / outstanding;
          const holderShares = g.ultimates.has(holder)
            ? new Map([[holder, 1]])
            : (shares.get(holder) ?? new Map<string, number>());
          for (const [parent, weight] of holderShares) {
            acc.set(parent, (acc.get(parent) ?? 0) + fraction * weight);
          }
        }
      }
      const previous = shares.get(node) ?? new Map<string, number>();
      let delta = 0;
      for (const key of new Set([...acc.keys(), ...previous.keys()])) {
        delta += Math.abs((acc.get(key) ?? 0) - (previous.get(key) ?? 0));
      }
      if (delta > maxDelta) maxDelta = delta;
      shares.set(node, acc);
    }
    if (maxDelta < CONVERGED) break;
  }
  return shares;
}

/**
 * Ultimate owners of one entity and their effective shares. Was `effOwners`.
 * Sums to 1 when the graph is complete, which the Ownership screen asserts on screen.
 */
export function effectiveOwners(
  g: OwnershipGraph,
  shares: Map<string, Map<string, number>>,
  code: string
): Map<string, number> {
  const result = new Map<string, number>();
  const outstanding = totalQuantity(g, code);
  if (outstanding <= 0) return result;
  for (const [holder, units] of immediateHolders(g, code)) {
    const fraction = units / outstanding;
    const holderShares = g.ultimates.has(holder)
      ? new Map([[holder, 1]])
      : (shares.get(holder) ?? new Map([[holder, 1]]));
    for (const [parent, weight] of holderShares) {
      result.set(parent, (result.get(parent) ?? 0) + fraction * weight);
    }
  }
  return result;
}

export interface OwnerRow {
  id: string;
  depth: number;
  holder: string;
  parent: string;
  units: number;
  /** Direct share of the row below. */
  direct: number;
  /** Effective share of the searched position. */
  cumulative: number;
  chain: { code: string; direct: number }[];
  expandable: boolean;
  cyclic: boolean;
}

export interface SubtotalRow {
  subtotal: true;
  depth: number;
  code: string;
  total: number;
  cumulative: number;
}

export type OwnershipRow = OwnerRow | SubtotalRow;

export function isSubtotal(r: OwnershipRow): r is SubtotalRow {
  return 'subtotal' in r;
}

/**
 * Rows of the upward ownership tree for one position. Was `buildRevRows` / its nested `walk`,
 * renamed `walkOwnersUpward` to resolve the collision with the look-through walk.
 *
 * `onPath` carries the ancestors of the current branch so a cycle is marked and not re-entered.
 */
export function walkOwnersUpward(
  g: OwnershipGraph,
  root: string,
  expanded: ReadonlySet<string>
): OwnershipRow[] {
  const rows: OwnershipRow[] = [];

  const recurse = (
    code: string,
    depth: number,
    cumulative: number,
    onPath: ReadonlySet<string>,
    chain: { code: string; direct: number }[]
  ): void => {
    const kids = immediateHolders(g, code)
      .slice()
      .sort((a, b) => b[1] - a[1]);
    const parentTotal = totalQuantity(g, code);
    for (const [holder, units] of kids) {
      const direct = parentTotal ? units / parentTotal : 0;
      const cum = cumulative * direct;
      const id = `${depth}|${code}|${holder}`;
      const owned = (g.owners.get(holder) ?? []).length > 0;
      const cyclic = onPath.has(holder);
      const nextChain = chain.concat([{ code: holder, direct }]);
      rows.push({
        id,
        depth,
        holder,
        parent: code,
        units,
        direct,
        cumulative: cum,
        chain: nextChain,
        expandable: owned && !cyclic,
        cyclic,
      });
      if (expanded.has(id) && owned && !cyclic) {
        const nextPath = new Set(onPath);
        nextPath.add(holder);
        recurse(holder, depth + 1, cum, nextPath, nextChain);
      }
    }
    rows.push({ subtotal: true, depth, code, total: parentTotal, cumulative });
  };

  recurse(root, 0, 1, new Set([root]), []);
  return rows;
}
