/**
 * Excel exports, through the vendored SheetJS build.
 *
 * `vendor/xlsx.full.min.js` is loaded on demand from disk — never from a CDN, which is what lets the
 * app work with the network off. The original loaded it eagerly from cdnjs and failed with an
 * `alert()` when that failed; here a load failure surfaces as a real error the caller can show.
 */
import type { RepricingFixture } from '../domain/types.js';
import { buildWaterfall } from '../domain/reconciliation.js';
import type { PricingView } from '../domain/types.js';

/** The slice of the SheetJS surface this module uses, typed narrowly rather than as `any`. */
interface SheetCell {
  z?: string;
}
interface WorkSheet {
  [cell: string]: SheetCell | unknown;
  '!cols'?: { wch: number }[];
  '!freeze'?: { xSplit: number; ySplit: number };
}
interface XlsxApi {
  utils: {
    book_new(): unknown;
    aoa_to_sheet(rows: unknown[][]): WorkSheet;
    book_append_sheet(book: unknown, sheet: WorkSheet, name: string): void;
  };
  writeFile(book: unknown, filename: string): void;
}

const CURRENCY = '$#,##0';
const PRICE = '0.000000';
const BPS = '0.0';

let loading: Promise<XlsxApi> | null = null;

/** Load the vendored library once, on first export. */
export function loadSpreadsheetLibrary(): Promise<XlsxApi> {
  const existing = (globalThis as { XLSX?: XlsxApi }).XLSX;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise<XlsxApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/xlsx.full.min.js';
    script.addEventListener('load', () => {
      const api = (globalThis as { XLSX?: XlsxApi }).XLSX;
      if (api) resolve(api);
      else reject(new Error('vendor/xlsx.full.min.js loaded but exposed no XLSX global.'));
    });
    script.addEventListener('error', () =>
      reject(new Error('Could not load vendor/xlsx.full.min.js — confirm the vendor folder shipped.'))
    );
    document.head.append(script);
  });
  return loading;
}

function setFormat(sheet: WorkSheet, ref: string, format: string): void {
  const cell = sheet[ref] as SheetCell | undefined;
  if (cell) cell.z = format;
}

/** Shared cover sheet: the reconciliation, stated as the additive chain plus its tie check. */
function summaryRows(repricing: RepricingFixture, view: PricingView, asof: string): unknown[][] {
  const w = buildWaterfall(repricing, view);
  return [
    ['TRACE-Pro — NAV pricing and look-through'],
    ['Apollo · figures in USD'],
    [],
    ['Product', repricing.product],
    ['Code', repricing.productCode],
    ['As of', asof],
    ['Pricing basis', view === 'after' ? 'Repriced' : 'Current marks'],
    [],
    ['The additive reconciliation', 'USD', 'bps'],
    ['Look-through value', w.start, ''],
    ['+ Pricing difference', w.deltaPricing, repricing.N ? (w.deltaPricing / repricing.N) * 1e4 : ''],
    ['= Repriced value', w.revised, ''],
    ['+ Non-position difference', w.deltaNonPosition, repricing.N ? (w.deltaNonPosition / repricing.N) * 1e4 : ''],
    ['= NAV', w.nav, ''],
    [],
    ['Tie check: the two differences', w.tie, ''],
    ['must equal NAV minus look-through value', w.target, ''],
    ['residual', w.residual, ''],
  ];
}

function appendSummary(xlsx: XlsxApi, book: unknown, repricing: RepricingFixture, view: PricingView, asof: string): void {
  const sheet = xlsx.utils.aoa_to_sheet(summaryRows(repricing, view, asof));
  sheet['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 10 }];
  for (const row of [10, 11, 12, 13, 14, 16, 17, 18]) {
    setFormat(sheet, 'B' + row, CURRENCY);
    setFormat(sheet, 'C' + row, BPS);
  }
  xlsx.utils.book_append_sheet(book, sheet, 'Summary');
}

/** Reconciliation workbook: the chain, plus one row per fund with both differences. */
export async function exportReconciliationWorkbook(
  repricing: RepricingFixture,
  view: PricingView,
  asof: string
): Promise<void> {
  const xlsx = await loadSpreadsheetLibrary();
  const book = xlsx.utils.book_new();
  appendSummary(xlsx, book, repricing, view, asof);

  const header = [
    'Fund', 'Code', 'VPM symbol', 'Level', 'NAV', 'Look-through value', 'Repriced value',
    'Pricing difference', 'Pricing bps', 'Non-position difference', 'Non-position bps', 'Exception',
  ];
  const funds = repricing.funds.slice().sort((a, b) => (b.nav ?? b.rev) - (a.nav ?? a.rev));
  const body = funds.map((f) => {
    const exception =
      f.hasNav === 0 && f.gq
        ? 'No NAV reported'
        : f.nav && Math.abs(f.dNonPos ?? 0) >= 250_000 && Math.abs(((f.dNonPos ?? 0) / f.nav) * 1e4) >= 50
          ? 'Material non-position difference'
          : f.nav && Math.abs(f.dPricing) >= 250_000 && Math.abs((f.dPricing / f.nav) * 1e4) >= 50
            ? 'Material pricing difference'
            : '';
    return [
      f.name ?? f.code, f.code, f.sym, f.level, f.nav, f.ltv, f.rev, f.dPricing,
      f.nav ? (f.dPricing / f.nav) * 1e4 : null,
      f.dNonPos, f.nav && f.dNonPos != null ? (f.dNonPos / f.nav) * 1e4 : null, exception,
    ];
  });
  const sheet = xlsx.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = [
    { wch: 38 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 18 }, { wch: 20 },
    { wch: 20 }, { wch: 18 }, { wch: 11 }, { wch: 22 }, { wch: 13 }, { wch: 28 },
  ];
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  for (let i = 0; i < body.length; i++) {
    const row = i + 2;
    for (const col of ['E', 'F', 'G', 'H', 'J']) setFormat(sheet, col + row, CURRENCY);
    for (const col of ['I', 'K']) setFormat(sheet, col + row, BPS);
  }
  xlsx.utils.book_append_sheet(book, sheet, 'Reconciliation');
  xlsx.writeFile(book, `TRACE-Pro_Reconciliation_${repricing.productCode}_${asof}.xlsx`);
}

/** Pricing workbook: the chain, plus every fund's three prices and its repricing gain or loss. */
export async function exportPricingWorkbook(
  repricing: RepricingFixture,
  view: PricingView,
  asof: string
): Promise<void> {
  const xlsx = await loadSpreadsheetLibrary();
  const book = xlsx.utils.book_new();
  appendSummary(xlsx, book, repricing, view, asof);

  const header = [
    'Fund', 'Code', 'VPM symbol', 'Level', 'Units outstanding', 'NAV', 'Current mark',
    'Repriced unit price', 'Price to publish', 'Look-through value', 'Repriced value',
    'Repricing gain or loss', 'Gain or loss bps',
  ];
  const funds = repricing.funds.slice().sort((a, b) => (b.nav ?? b.rev) - (a.nav ?? a.rev));
  const body = funds.map((f) => [
    f.name ?? f.code, f.code, f.sym, f.level, f.gq, f.nav, f.curPx, f.revPx, f.navPx,
    f.ltv, f.rev, f.pnlLevel, f.nav ? (f.pnlLevel / f.nav) * 1e4 : null,
  ]);
  const sheet = xlsx.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = [
    { wch: 38 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 20 }, { wch: 18 },
    { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 12 },
  ];
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  for (let i = 0; i < body.length; i++) {
    const row = i + 2;
    setFormat(sheet, 'E' + row, '#,##0');
    for (const col of ['F', 'J', 'K', 'L']) setFormat(sheet, col + row, CURRENCY);
    for (const col of ['G', 'H', 'I']) setFormat(sheet, col + row, PRICE);
    setFormat(sheet, 'M' + row, BPS);
  }
  xlsx.utils.book_append_sheet(book, sheet, 'Pricing');
  xlsx.writeFile(book, `TRACE-Pro_Pricing_${repricing.productCode}_${asof}.xlsx`);
}
