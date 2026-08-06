/**
 * Turning the shipped fixtures back into the two files the uploaders read.
 *
 * This is the write half of the round-trip proof in `ingest-roundtrip.spec.ts`. It exists because
 * `parity-map.json` is frozen and carries no upload entries, so the parity gate never looks at a
 * figure that came from an uploaded file: the ingest and recompute code has no net. The fixtures in
 * `data/apollo-sports-capital/2026-06-30/` ARE parity-verified, so serialising them back out into the
 * exact shapes the parsers accept, reading them in again and comparing gives the upload path an
 * oracle without touching a frozen file.
 *
 * The column names below are not guesses. They are the header spellings that `positionColumns` in
 * `src/domain/ingest/position-report.ts` and `navColumnIndex` in `src/domain/ingest/nav-report.ts`
 * actually match, after `normaliseHeader` reduces a header to letters and digits.
 *
 * Every figure is written with `String(n)`, never `toFixed`, because a position report carries unit
 * quantities to four decimal places (250527694.491, 117634387.1926) and `toFixed(2)` would round them
 * away. JavaScript's number-to-string is the shortest form that parses back to the same double, so
 * serialisation itself is exact and any difference the round trip shows is arithmetic, not encoding.
 */
import type { LookthroughFixture, LookthroughNode, RepricingFixture } from '../../src/domain/types.js';

/** The header of a Position Report, in the spellings `positionColumns` matches. */
export const POSITION_HEADER = [
  'Fund Entity',
  'Fund',
  'Fund Code',
  'SPV Fund Code',
  'Security Code',
  'Security',
  'Issuer',
  'Quantity VPM',
  'MV USD',
  'NAV End USD',
] as const;

/** The header of a NAV Report in the pivot layout `readNavReport` calls `pivot`. */
export const NAV_PIVOT_HEADER = ['PRODUCT', 'FUND_CODE', 'ENDING_NAV'] as const;

/**
 * Where the units of a fund that this product does not hold in full come from. The shipped
 * `gqByFund` is units OUTSTANDING — summed over every holder in the firm, not just this product's —
 * so a report containing only this product's rows would understate it and every ownership share
 * derived from it. CRIMAP is the case that matters: the product holds 516,810,280.38 of
 * 1,044,276,360.3 units, and the apex feeders ASCHON and SPORTHLD are held entirely by investors
 * outside the product. Those units are written as rows under a DIFFERENT fund entity, which is what
 * the original firm-wide report looked like.
 *
 * Each such holder gets its own row, taken from the fixture's own `holders` list, so the rebuilt
 * report reproduces who holds what and in what share rather than only the total. Where that list is
 * truncated — it is capped at `TRUNCATE.simHolders` = 14, and SPORTHLD really has 23 holders — the
 * units the fixture does not name are written as one balancing row under `EXTERNAL_HOLDER`. That is
 * the one place this reconstruction cannot be faithful, and it is the fixture that is lossy, not the
 * upload path; `ingest-roundtrip.spec.ts` asserts the exact size of the resulting difference.
 */
export const EXTERNAL_ENTITY = 'Apollo Credit Strategies';
export const EXTERNAL_HOLDER = 'EXTFEED';

const CENT = 0.005;

function cell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows of cells to the text of a comma-separated file, quoted the way `splitCsvLine` reads. */
export function csvText(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

/** The id of a node's parent, out of its own path — the tree's own statement of who holds whom. */
function parentIdOf(node: Pick<LookthroughNode, 'path'>): number | null {
  const trail = node.path.split('/').filter(Boolean).map(Number);
  trail.pop();
  return trail.length ? (trail[trail.length - 1] ?? null) : null;
}

interface Names {
  name: (code: string) => string;
  sym: (code: string) => string;
}

function namesOf(repricing: RepricingFixture, lookthrough: LookthroughFixture): Names {
  const name = new Map<string, string>();
  const sym = new Map<string, string>();
  for (const node of lookthrough.nodes) if (!node.isLeaf) name.set(node.code, node.name);
  for (const fund of repricing.funds) sym.set(fund.code, fund.sym);
  return {
    name: (code) => name.get(code) ?? code,
    sym: (code) => sym.get(code) ?? code,
  };
}

/**
 * The shipped look-through tree and repricing, written back out as Position Report rows.
 *
 * A fund held on two chains appears in the tree once per chain, carrying its whole subtree each
 * time, so both edges and direct securities are emitted once: an ownership edge on the first
 * appearance of a (holder, investee) pair, and a fund's securities from the leaves hanging off its
 * first appearance only. Every appearance carries the same list, so which one is chosen cannot
 * matter — and writing them all would inflate the file's market values.
 */
export function positionReportRows(
  lookthrough: LookthroughFixture,
  repricing: RepricingFixture
): (string | number)[][] {
  const { name, sym } = namesOf(repricing, lookthrough);
  const codeById = new Map<number, string>();
  const firstAppearance = new Map<string, number>();
  for (const node of lookthrough.nodes) {
    codeById.set(node.id, node.code);
    if (!node.isLeaf && !firstAppearance.has(node.code)) firstAppearance.set(node.code, node.id);
  }
  const holderOf = (node: LookthroughNode): string => {
    const parent = parentIdOf(node);
    return parent == null ? '' : (codeById.get(parent) ?? '');
  };

  const rows: (string | number)[][] = [[...POSITION_HEADER]];
  const entity = lookthrough.product;
  const nav = lookthrough.prodNAV;
  const emittedEdge = new Set<string>();
  const insideUnits = new Map<string, number>();
  const insideHolders = new Map<string, Set<string>>();

  for (const node of lookthrough.nodes) {
    const holder = holderOf(node);
    if (node.kind === 'vehicle') {
      const key = `${holder}|${node.code}`;
      if (emittedEdge.has(key)) continue;
      emittedEdge.add(key);
      insideUnits.set(node.code, (insideUnits.get(node.code) ?? 0) + node.units);
      const held = insideHolders.get(node.code) ?? new Set<string>();
      held.add(holder);
      insideHolders.set(node.code, held);
      rows.push([
        entity, name(holder), holder, node.code, sym(node.code), name(node.code), '',
        node.units, node.carried, nav,
      ]);
    } else if (node.isLeaf) {
      if (firstAppearance.get(holder) !== parentIdOf(node)) continue;
      rows.push([
        entity, name(holder), holder, '', node.code, node.name, node.issuer,
        node.units, node.mv100, nav,
      ]);
    }
  }

  /* The rest of each fund's units outstanding, held outside this product. */
  for (const fund of repricing.funds) {
    const external = fund.holders.filter((h) => !(insideHolders.get(fund.code) ?? new Set()).has(h.h));
    let accounted = insideUnits.get(fund.code) ?? 0;
    for (const holder of external) {
      accounted += holder.units;
      rows.push([
        EXTERNAL_ENTITY, holder.h, holder.h, fund.code, sym(fund.code), name(fund.code), '',
        holder.units, 0, '',
      ]);
    }
    const residual = fund.gq - accounted;
    if (residual <= CENT) continue;
    rows.push([
      EXTERNAL_ENTITY, EXTERNAL_HOLDER, EXTERNAL_HOLDER, fund.code, sym(fund.code), name(fund.code), '',
      residual, 0, '',
    ]);
  }
  return rows;
}

/** The same report as the text of a `.csv`, which is what the drawer splits when the file is text. */
export function positionReportCsv(lookthrough: LookthroughFixture, repricing: RepricingFixture): string {
  return csvText(positionReportRows(lookthrough, repricing));
}

/** A NAV report in the pivot layout: one row per fund, this period's ENDING_NAV. */
export function navPivotRows(
  product: string,
  navByFund: Readonly<Record<string, number>>
): (string | number)[][] {
  const rows: (string | number)[][] = [[...NAV_PIVOT_HEADER]];
  for (const [code, nav] of Object.entries(navByFund)) rows.push([product, code, nav]);
  return rows;
}

export function navPivotCsv(product: string, navByFund: Readonly<Record<string, number>>): string {
  return csvText(navPivotRows(product, navByFund));
}
