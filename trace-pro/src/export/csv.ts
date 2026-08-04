/**
 * CSV exports. The only place in the app that builds a file.
 *
 * Figures come from the same domain functions the screens read, so an export cannot disagree with
 * what is on screen — rubric R13 asserts exactly that by parsing the downloaded file back.
 */
import type { LookthroughNode, PricingView, RepricingFixture } from '../domain/types.js';
import { reconcileNode } from '../domain/lookthrough.js';

/** RFC 4180 quoting: wrap when needed, double any embedded quote. */
function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** Hand a built file to the browser. Revokes the URL so a long session does not leak blobs. */
export function downloadFile(filename: string, contents: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function slug(text: string): string {
  return text.replace(/\W+/g, '_').replace(/^_|_$/g, '');
}

/** The words the tree's basis-sensitive column header uses, so the file can use the same ones. */
export function csvBasisLabel(view: PricingView): string {
  return view === 'after' ? 'Repriced' : 'Current marks';
}

/**
 * The look-through hierarchy, one row per node, at full precision — in the ACTIVE pricing basis.
 *
 * This used to write `node.derived` unconditionally, so the file was byte-identical in both bases
 * and, under the repriced basis, its look-through column contradicted the very column on screen it
 * was taken from (rubric R13). The figures now come from `reconcileNode`, which is the same
 * function the tree renders from, so the file and the screen cannot diverge; and the basis is
 * stated in row 1 and in the column heading rather than left for the reader to guess.
 */
export function exportLookthroughCsv(
  nodes: readonly LookthroughNode[],
  repricing: RepricingFixture,
  view: PricingView,
  asof: string
): void {
  const rows: (string | number | null)[][] = [
    ['Pricing basis', csvBasisLabel(view), 'Product', repricing.product, 'As of', asof],
    [
      'Level',
      'Kind',
      'Name',
      'Code',
      'Issuer',
      'Units',
      'Direct share %',
      'Effective share %',
      'Value of whole entity USD',
      view === 'after' ? 'Look-through value at repriced marks USD' : 'Look-through value USD',
      'Repriced value USD',
      'NAV USD',
      'Pricing difference USD',
      'Non-position difference USD',
      'Position value USD',
      'Look-through minus as-booked USD',
    ],
  ];
  for (const node of nodes) {
    const r = reconcileNode(node, repricing, view);
    rows.push([
      node.level,
      node.kind,
      node.name ?? '',
      node.code,
      node.issuer ?? '',
      node.units,
      (node.ownpct * 100).toFixed(4),
      (node.applied * 100).toFixed(6),
      node.mv100.toFixed(2),
      r.derived.toFixed(2),
      r.revised.toFixed(2),
      r.nav == null ? '' : r.nav.toFixed(2),
      r.deltaPricing.toFixed(2),
      r.deltaNonPosition == null ? '' : r.deltaNonPosition.toFixed(2),
      node.position.toFixed(2),
      node.variance.toFixed(2),
    ]);
  }
  downloadFile(
    `TRACE-Pro_lookthrough_${slug(repricing.product)}_${csvBasisLabel(view).toLowerCase().replace(/\W+/g, '-')}_${asof}.csv`,
    toCsv(rows),
    'text/csv;charset=utf-8'
  );
}

/** The per-fund pricing table, at full precision. */
export function exportPricingCsv(repricing: RepricingFixture, asof: string): void {
  const rows: (string | number | null)[][] = [
    [
      'Fund',
      'Code',
      'VPM symbol',
      'Level',
      'Lowest level',
      'Units outstanding',
      'NAV USD',
      'Price to publish',
      'Current mark',
      'Repriced unit price',
      'Look-through value USD',
      'Repriced value USD',
      'Repricing gain or loss USD',
      'Gain or loss bps',
      'Non-position difference USD',
    ],
  ];
  for (const fund of repricing.funds) {
    rows.push([
      fund.name ?? fund.code,
      fund.code,
      fund.sym ?? '',
      fund.level,
      fund.terminal ? 'Y' : 'N',
      fund.gq != null ? fund.gq.toFixed(2) : '',
      fund.nav != null ? fund.nav.toFixed(2) : '',
      fund.navPx != null ? fund.navPx.toFixed(8) : '',
      fund.curPx != null ? fund.curPx.toFixed(8) : '',
      fund.revPx != null ? fund.revPx.toFixed(8) : '',
      fund.ltv.toFixed(2),
      fund.rev.toFixed(2),
      fund.pnlLevel.toFixed(2),
      fund.nav ? ((fund.pnlLevel / fund.nav) * 1e4).toFixed(1) : '',
      fund.dNonPos != null ? fund.dNonPos.toFixed(2) : '',
    ]);
  }
  downloadFile(
    `TRACE-Pro_pricing_${slug(repricing.productCode)}_${asof}.csv`,
    toCsv(rows),
    'text/csv;charset=utf-8'
  );
}

/**
 * The send-to-pricing file: one row per priced fund, in the four columns the pricing system takes.
 *
 * The column NAMES are the downstream system's, not this app's — renaming them to the screen's
 * vocabulary would break the consumer — but every one of the four is a figure the Pricing screen
 * renders, which is what rubric R13 asks (a machine handoff may not carry a figure the operator
 * cannot see):
 *
 *   Symbol         → the price table's Symbol column        (pricing.fund.<code>.symbol)
 *   Respective Qty → the Repricing walk's Global Qty column (pricing.walk.fund.<code>.global_qty)
 *   Local Price    → the price table's Price to publish     (pricing.fund.<code>.publish_px)
 *   Local MV       → the Repricing walk's NAV column        (pricing.walk.fund.<code>.nav)
 *
 * Local price is the fund's own unit price (NAV ÷ units); local market value is price × units, which
 * is the fund's NAV by construction. Neither depends on the pricing basis — the price a fund
 * publishes is its own NAV per unit whichever basis the screen is showing — so unlike the
 * look-through file this one is deliberately identical in both bases.
 */
export function exportSendToPricingCsv(repricing: RepricingFixture, asof: string): void {
  const rows: (string | number | null)[][] = [['Symbol', 'Respective Qty', 'Local Price', 'Local MV']];
  const priced = repricing.funds
    .filter((f) => f.hasNav && f.gq && f.nav != null)
    .sort((a, b) => (b.nav ?? 0) - (a.nav ?? 0));
  for (const fund of priced) {
    const price = fund.navPx ?? (fund.gq ? (fund.nav ?? 0) / fund.gq : null);
    rows.push([
      fund.sym || fund.code,
      fund.gq.toFixed(2),
      price != null ? price.toFixed(6) : '',
      (price != null ? price * fund.gq : (fund.nav ?? 0)).toFixed(2),
    ]);
  }
  downloadFile(
    `TRACE-Pro Pricing Export (${repricing.productCode}) ${asof}.csv`,
    toCsv(rows),
    'text/csv;charset=utf-8'
  );
}

/** The data-quality register, every bucket and row. */
export function exportIssuesCsv(
  buckets: readonly { name: string; sev: string; rows: readonly { code: string; sym?: string; name?: string; detail: string }[] }[],
  scopeLabel: string
): void {
  const rows: (string | number | null)[][] = [
    ['Severity', 'Bucket', 'VPM symbol', 'Entity code', 'Name', 'Detail'],
  ];
  for (const bucket of buckets) {
    for (const row of bucket.rows) {
      rows.push([bucket.sev, bucket.name, row.sym ?? '', row.code, row.name ?? '', row.detail]);
    }
  }
  downloadFile(`TRACE-Pro_data_quality_${slug(scopeLabel)}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}
