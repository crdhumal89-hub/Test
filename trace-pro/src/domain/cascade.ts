/**
 * Shock propagation and the staged bottom-up reprice.
 *
 * `shockCascade` answers: if this fund's value or unit count changes, what happens to every holder
 * above it, and to product NAV? It is a single topological pass — children strictly before parents
 * — so each level is computed exactly once and the arithmetic is reproducible.
 *
 * Ported from `simCascade` (line 1582) and `simFRBuild` (1890). Pure: no DOM, no d3, no timers.
 */
import type { SimulatorFixture } from './types.js';

export interface CascadeIndex {
  funds: SimulatorFixture['funds'];
  /** investee -> its holders. */
  holdersOf: Record<string, { h: string; units: number }[]>;
  /** holder -> what it holds. */
  holdingsOf: Record<string, { i: string; units: number }[]>;
  /** "holder|investee" -> units on that edge. */
  edgeUnits: Record<string, number>;
  apex: Set<string>;
}

/** Was `simBuildIdx`. */
export function buildCascadeIndex(sim: SimulatorFixture): CascadeIndex {
  const holdersOf: Record<string, { h: string; units: number }[]> = {};
  const holdingsOf: Record<string, { i: string; units: number }[]> = {};
  const edgeUnits: Record<string, number> = {};
  for (const e of sim.edges) {
    (holdersOf[e.i] ??= []).push({ h: e.h, units: e.units });
    (holdingsOf[e.h] ??= []).push({ i: e.i, units: e.units });
    edgeUnits[`${e.h}|${e.i}`] = e.units;
  }
  return { funds: sim.funds, holdersOf, holdingsOf, edgeUnits, apex: new Set(sim.apex) };
}

/** One parent-child value transfer produced by a shock. */
export interface Booking {
  parent: string;
  child: string;
  pnl: number;
  units: number;
  ownpct: number;
  childPriceDelta: number;
}

export interface CascadeResult {
  shocked: string;
  valueBefore: number;
  valueAfter: number;
  unitsBefore: number;
  unitsAfter: number;
  priceBefore: number;
  priceAfter: number;
  priceDelta: Record<string, number>;
  valueDelta: Record<string, number>;
  pnl: Record<string, number>;
  bookings: Booking[];
  affected: Set<string>;
  productValueDelta: number;
  cyclic: string[];
  layer: Record<string, number>;
  maxLayer: number;
  maxAbs: number;
}

/**
 * Propagate a shock to one fund upward through every holder.
 *
 * The shocked fund's unit price moves from value/units to newValue/newUnits. Every holder revalues
 * only through units held × the child's price change — a holder's own securities do not reprice —
 * which is why Σ bookings into a parent equals that parent's value change exactly.
 */
export function shockCascade(
  index: CascadeIndex,
  shocked: string,
  newValue: number,
  newUnits: number,
  apex: readonly string[]
): CascadeResult {
  const fund = index.funds[shocked];
  const unitsBefore = fund?.gq ?? 0;
  const valueBefore = fund?.nav ?? 0;
  const priceBefore = unitsBefore ? valueBefore / unitsBefore : 0;
  const priceAfter = newUnits ? newValue / newUnits : 0;

  // Everything reachable upward from the shocked node.
  const affected = new Set<string>([shocked]);
  const stack = [shocked];
  while (stack.length) {
    const child = stack.pop()!;
    for (const holder of index.holdersOf[child] ?? []) {
      if (!affected.has(holder.h)) {
        affected.add(holder.h);
        stack.push(holder.h);
      }
    }
  }

  // Restrict the graph to the affected set, then order children before parents.
  const affectedChildren: Record<string, string[]> = {};
  for (const holder of affected) {
    affectedChildren[holder] = (index.holdingsOf[holder] ?? [])
      .filter((o) => affected.has(o.i))
      .map((o) => o.i);
  }
  const outstandingChildren: Record<string, number> = {};
  const parentsOf: Record<string, string[]> = {};
  for (const holder of affected) outstandingChildren[holder] = affectedChildren[holder]!.length;
  for (const holder of affected) {
    for (const child of affectedChildren[holder]!) (parentsOf[child] ??= []).push(holder);
  }

  const order: string[] = [];
  const done = new Set<string>();
  const ready = [...affected].filter((n) => outstandingChildren[n] === 0);
  while (ready.length) {
    const n = ready.shift()!;
    order.push(n);
    done.add(n);
    for (const parent of parentsOf[n] ?? []) {
      outstandingChildren[parent]!--;
      if (outstandingChildren[parent] === 0) ready.push(parent);
    }
  }
  // A cycle leaves nodes unordered; append them so they are still valued once.
  const cyclic = [...affected].filter((n) => !done.has(n));
  order.push(...cyclic);

  const priceDelta: Record<string, number> = {};
  const valueDelta: Record<string, number> = {};
  const pnl: Record<string, number> = {};
  const bookings: Booking[] = [];
  const layer: Record<string, number> = { [shocked]: 0 };

  for (const holder of order) {
    if (holder === shocked) {
      priceDelta[shocked] = priceAfter - priceBefore;
      valueDelta[shocked] = newValue - valueBefore;
      continue;
    }
    let delta = 0;
    let deepest = 0;
    for (const child of affectedChildren[holder]!) {
      const units = index.edgeUnits[`${holder}|${child}`] ?? 0;
      const childDelta = priceDelta[child] ?? 0;
      const booked = units * childDelta;
      delta += booked;
      deepest = Math.max(deepest, (layer[child] ?? 0) + 1);
      const childFund = index.funds[child];
      bookings.push({
        parent: holder,
        child,
        pnl: booked,
        units,
        ownpct: childFund?.gq ? units / childFund.gq : 0,
        childPriceDelta: childDelta,
      });
    }
    valueDelta[holder] = delta;
    pnl[holder] = delta;
    const holderUnits = index.funds[holder]?.gq ?? 0;
    priceDelta[holder] = holderUnits ? delta / holderUnits : 0;
    layer[holder] = deepest;
  }

  const productValueDelta = apex.reduce((s, a) => s + (valueDelta[a] ?? 0), 0);
  const layers = Object.values(layer);
  return {
    shocked,
    valueBefore,
    valueAfter: newValue,
    unitsBefore,
    unitsAfter: newUnits,
    priceBefore,
    priceAfter,
    priceDelta,
    valueDelta,
    pnl,
    bookings,
    affected,
    productValueDelta,
    cyclic,
    layer,
    maxLayer: layers.length ? Math.max(0, ...layers) : 0,
    maxAbs: Math.max(1, Math.abs(productValueDelta), ...Object.values(valueDelta).map(Math.abs)),
  };
}

/** One stage of the whole-book reprice: every fund at a given depth. */
export interface RepriceRun {
  productNodeId: string;
  byLevel: Record<number, string[]>;
  parentsOf: Record<string, string[]>;
  /** Deepest level first. */
  levels: number[];
  /** Fraction of total repricing activity completed after each level. */
  cumulativeFraction: Record<number, number>;
  edgesByLevel: Record<number, { from: string; to: string }[]>;
}

/**
 * Plan the staged reprice: deepest level first, up to the product. Was `simFRBuild`.
 *
 * `parentsOf` indexes EVERY holder of a node from the edge list, not just its spanning-tree
 * parent, so a co-owned fund lights all of its owners rather than one arbitrary path.
 *
 * `weightOf` supplies each node's repricing magnitude so the progress reveal tracks activity
 * rather than node count; the caller passes the revised-vs-derived P&L per fund.
 */
export function buildRepriceRun(
  sim: SimulatorFixture,
  weightOf: (code: string) => number
): RepriceRun {
  const productNodeId = sim.productNodeId;
  const byLevel: Record<number, string[]> = {};
  const parentsOf: Record<string, string[]> = {};
  const holdersOf: Record<string, string[]> = {};
  for (const e of sim.edges) (holdersOf[e.i] ??= []).push(e.h);

  for (const node of sim.treeNodes) {
    if (node.kind === 'product') continue;
    const level = node.level ?? 0;
    (byLevel[level] ??= []).push(node.id);
    const holders = [...new Set(holdersOf[node.id] ?? [])];
    parentsOf[node.id] = holders.length ? holders : [node.pid ?? productNodeId];
  }

  const levels = Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => b - a);

  const weightByLevel: Record<number, number> = {};
  let total = 0;
  for (const level of levels) {
    const w = (byLevel[level] ?? []).reduce((s, id) => s + Math.abs(weightOf(id)), 0);
    weightByLevel[level] = w;
    total += w;
  }
  const cumulativeFraction: Record<number, number> = {};
  let running = 0;
  levels.forEach((level, i) => {
    running += weightByLevel[level] ?? 0;
    cumulativeFraction[level] = total > 0 ? running / total : (i + 1) / levels.length;
  });

  const edgesByLevel: Record<number, { from: string; to: string }[]> = {};
  for (const level of levels) {
    const edges: { from: string; to: string }[] = [];
    for (const id of byLevel[level] ?? []) {
      for (const parent of parentsOf[id] ?? []) if (parent) edges.push({ from: id, to: parent });
    }
    edgesByLevel[level] = edges;
  }

  return { productNodeId, byLevel, parentsOf, levels, cumulativeFraction, edgesByLevel };
}

/** What a pending shock in the inspector amounts to. Was `simPending`. */
export interface PendingShock {
  marketValueBase: number;
  unitsBase: number;
  navBase: number;
  value: number;
  units: number;
  field: 'NAV' | 'MV' | 'Qty' | null;
  priceBefore: number;
  priceAfter: number;
  changed: boolean;
}

export function pendingShock(
  fund: { gmv: number; gq: number; nav: number | null } | undefined,
  edited: { nav?: boolean; mv?: boolean; qty?: boolean },
  input: { mv: number | null; qty: number | null; nav: number | null }
): PendingShock | null {
  if (!fund) return null;
  const marketValueBase = fund.gmv || 0;
  const unitsBase = fund.gq || 0;
  const navBase = fund.nav ?? 0;
  const mv = input.mv ?? marketValueBase;
  const units = input.qty ?? unitsBase;
  const nav = input.nav ?? navBase;

  let value: number;
  let field: PendingShock['field'];
  if (edited.nav) {
    value = nav;
    field = 'NAV';
  } else if (edited.mv) {
    value = navBase + (mv - marketValueBase);
    field = 'MV';
  } else if (edited.qty) {
    value = navBase;
    field = 'Qty';
  } else {
    value = navBase;
    field = null;
  }

  return {
    marketValueBase,
    unitsBase,
    navBase,
    value,
    units,
    field,
    priceBefore: unitsBase ? navBase / unitsBase : 0,
    priceAfter: units ? value / units : 0,
    changed: Math.abs(value - navBase) > 0.5 || Math.abs(units - unitsBase) > 0.5,
  };
}
