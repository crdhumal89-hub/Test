/**
 * Shapes of the runtime fixtures and of the models derived from them.
 *
 * Names follow docs/redesign-spec.md §3.2. The fixture field names are the ORIGINAL's and are
 * deliberately unchanged — they are the on-disk contract with `data/`, and renaming them would
 * mean rewriting the fixtures, which are data of record.
 */

/** A fund or SPV as it appears in `repricing.json` (was `REVBASE.funds[]`). */
export interface RepricingFund {
  code: string;
  name: string;
  sym: string;
  level: number;
  terminal: 0 | 1;
  hasNav: 0 | 1;
  nav: number | null;
  gq: number;
  secMV: number;
  /** Derived look-through value at current marks. The original calls this `ltv`. */
  ltv: number;
  /** Bottom-up NAV-repriced value. */
  rev: number;
  curPx: number | null;
  revPx: number | null;
  navPx: number | null;
  pnlLevel: number;
  dPricing: number;
  dNonPos: number | null;
  nHolders: number;
  holdings: RepricingHolding[];
  holders: RepricingHolder[];
}

export interface RepricingHolding {
  i: string;
  name: string;
  sym: string;
  units: number;
  ownpct: number;
  gq: number;
  ltv: number;
  rev: number;
  nav: number | null;
  curPx: number | null;
  revPx: number | null;
  pnl: number;
}

export interface RepricingHolder {
  h: string;
  units: number;
  ownpct: number;
}

export interface DataBreak {
  type: string;
  code: string;
  detail: string;
}

/** `repricing.json` — was `REVBASE`. The authoritative reconciliation. */
export interface RepricingFixture {
  product: string;
  productCode: string;
  asof: string;
  breaks: DataBreak[];
  /** NAV: Σ apex ENDING_NAV. */
  N: number;
  /** Derived look-through value at current marks. */
  D: number;
  /** Revised (bottom-up NAV-repriced) value. */
  R: number;
  dPricing: number;
  dNonPos: number;
  tie: number;
  navByFund: Record<string, number>;
  revByFund: Record<string, number>;
  ltvByFund: Record<string, number>;
  gqByFund: Record<string, number>;
  apex: string[];
  funds: RepricingFund[];
  nFunds: number;
  maxlevel: number;
}

export type NodeKind = 'product' | 'apex' | 'vehicle' | 'leaf';

/** A node of the look-through tree, from `lookthrough.json` (was `EMB.nodes[]`). */
export interface LookthroughNode {
  id: number;
  path: string;
  level: number;
  isLeaf: 0 | 1;
  kind: NodeKind;
  holder: string;
  code: string;
  name: string;
  issuer: string;
  units: number;
  ownpct: number;
  /** The product's effective share of this entity. The original calls this `applied`. */
  applied: number;
  /** Value of 100% of the entity. */
  mv100: number;
  /** applied × mv100 — the product-attributed look-through value. */
  derived: number;
  carried: number;
  position: number;
  variance: number;
}

/** `lookthrough.json` — was `EMB`. */
export interface LookthroughFixture {
  product: string;
  asof: string;
  /** Fund-entity NAV stamp. Differs from RepricingFixture.N by the DUNK feeder; see spec §1.8.1. */
  prodNAV: number;
  grand: number;
  resid: number;
  bps: number;
  dcN: number;
  apexPos: number;
  grandVar: number;
  recon: unknown[];
  nodes: LookthroughNode[];
}

export interface IssueRow {
  code: string;
  sym?: string;
  name?: string;
  detail: string;
}

export interface IssueBucket {
  name: string;
  sev: 'High' | 'Medium' | 'Low';
  count: number;
  expl: string;
  rows: IssueRow[];
}

/** `universe.json` — was `UNI`. The firm-wide ownership graph. */
export interface UniverseFixture {
  edges: [string, string, number][];
  entReach: Record<string, string[]>;
  entities: { e: string; n: number }[];
  gu: Record<string, number>;
  names: Record<string, string>;
  symByInv: Record<string, string>;
  ultimates: string[];
  search: { c: string; s: string; n: string; inv?: number }[];
  issues: IssueBucket[];
  counts: Record<string, number>;
}

export interface SimFund {
  code: string;
  name: string;
  sym: string;
  kind: string;
  level: number;
  gq: number;
  nav: number | null;
  price: number | null;
  gmv: number;
  eff: number;
  ltv: number | null;
  holders: { h: string; units: number; ownpct: number }[];
  holdings: { i: string; units: number; ownpct: number; gq: number; nav: number | null; name: string; sym: string }[];
  leaves: { sec: string; name?: string; qty: number; mv: number }[];
  nLeaves: number;
  parent: string | null;
  hasNav: boolean;
  gqZero: boolean;
}

/** `simulator.json` — was `SIM`. */
export interface SimulatorFixture {
  product: string;
  productCode: string;
  productNodeId: string;
  asof: string;
  productNAV: number;
  apex: string[];
  nFunds: number;
  maxlevel: number;
  funds: Record<string, SimFund>;
  edges: { h: string; i: string; units: number; ownpct?: number }[];
  treeNodes: { id: string; pid: string | null; level: number; kind: string }[];
  breaks: { code: string; type: string; detail: string; sev?: string; name?: string }[];
}

/** `legacy-pricing.json` — was `PRICING`. Supplies thresholds and the derived-value map only. */
export interface LegacyPricingFixture {
  product: string;
  asof: string;
  recon: {
    product: string;
    asof: string;
    warnBps: number;
    badBps: number;
    apex: string[];
    ltvByCode: Record<string, number>;
    sumAllFundNAV: number;
    nFunds: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** Which pricing basis the UI is presenting. */
export type PricingView = 'before' | 'after';

export interface FixtureBundle {
  lookthrough: LookthroughFixture;
  universe: UniverseFixture;
  repricing: RepricingFixture;
  simulator: SimulatorFixture;
  legacyPricing: LegacyPricingFixture;
}
