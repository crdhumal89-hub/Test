/**
 * Excel exports, through the vendored SheetJS build.
 *
 * `vendor/xlsx.full.min.js` is loaded on demand from disk — never from a CDN, which is what lets the
 * app work with the network off. The original loaded it eagerly from cdnjs and failed with an
 * `alert()` when that failed; here a load failure surfaces as a real error the caller can show.
 */
import type { PricingView, RepricingFixture, RepricingFund } from '../domain/types.js';
import { buildWaterfall } from '../domain/reconciliation.js';
import {
  EXCEPTION_TIPS,
  MATERIAL_BPS,
  MATERIAL_USD,
  evaluateEntity,
  groupExceptions,
  isMaterial,
} from '../domain/exceptions.js';

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
    // The first step changes meaning with the basis, so it must change words with it — the screen's
    // waterfall relabels this step "…at repriced marks" and the file has to say the same thing.
    [view === 'after' ? 'Look-through value at repriced marks' : 'Look-through value', w.start, ''],
    ['+ Pricing difference', w.deltaPricing, repricing.N ? (w.deltaPricing / repricing.N) * 1e4 : ''],
    ['= Repriced value', w.revised, ''],
    ['+ Non-position difference', w.deltaNonPosition, repricing.N ? (w.deltaNonPosition / repricing.N) * 1e4 : ''],
    ['= NAV', w.nav, ''],
    [],
    ['Tie check: the two differences', w.tie, ''],
    ['must equal NAV minus look-through value', w.target, ''],
    ['residual', w.residual, ''],
    [],
    // Stated, not restated: the numbers below are read from the single rule in domain/exceptions.ts
    // rather than typed here, which is what stops this file becoming a fourth copy of it (R9).
    ['Materiality rule', `|difference| ≥ $${MATERIAL_USD.toLocaleString('en-US')} and ≥ ${MATERIAL_BPS} bps`],
    ['Pricing difference is material', isMaterial(w.deltaPricing, w.nav) ? 'Yes' : 'No'],
    ['Non-position difference is material', isMaterial(w.deltaNonPosition, w.nav) ? 'Yes' : 'No'],
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

/**
 * The Exception column, in the SAME words the screen's chips use and from the SAME rule.
 *
 * This used to re-derive the whole dollar-and-bps materiality test inline, twice, and invent its
 * own wording ("Material non-position difference"), so the file that leaves the building carried a
 * third copy of the firm's tolerance and disagreed with the screen in words as well as provenance
 * (rubric R9). There is no threshold and no vocabulary here now: `groupExceptions` decides both,
 * and `EXCEPTION_TIPS` is keyed by the very titles it returns.
 */
function xlsExceptionsByFund(repricing: RepricingFixture, view: PricingView): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  // `groupExceptions` is the function the Reconciliation screen's chips are built from, so taking
  // the categories from it means the file cannot name a category the screen does not — including
  // the rename the repriced basis applies to the non-position category.
  for (const category of groupExceptions(repricing, view)) {
    for (const code of category.codes) {
      const list = byCode.get(code);
      if (list) list.push(category.title);
      else byCode.set(code, [category.title]);
    }
  }
  return byCode;
}

/** The plain-language gloss for each category, from the same table the screen's tooltips read. */
function xlsExceptionMeaning(titles: readonly string[]): string {
  return titles.map((t) => EXCEPTION_TIPS[t] ?? '').filter(Boolean).join('; ');
}

/** The severity the tree colours the fund's row with, so the file carries the same verdict. */
function xlsFundSeverity(fund: RepricingFund, view: PricingView): string {
  const verdict = evaluateEntity({
    nav: fund.nav,
    revised: fund.rev,
    derived: fund.ltv,
    globalUnits: fund.gq || null,
    view,
    // The workbook shows the category and its gloss, not the sentence, so no prose is needed here.
    describe: () => ({ nonPosition: '', pricing: '' }),
  });
  return verdict.severity ?? '';
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
    'What the exception means', 'Severity',
  ];
  const exceptions = xlsExceptionsByFund(repricing, view);
  const funds = repricing.funds.slice().sort((a, b) => (b.nav ?? b.rev) - (a.nav ?? a.rev));
  const body = funds.map((f) => {
    const titles = exceptions.get(f.code) ?? [];
    return [
      f.name ?? f.code, f.code, f.sym, f.level, f.nav, f.ltv, f.rev, f.dPricing,
      f.nav ? (f.dPricing / f.nav) * 1e4 : null,
      f.dNonPos, f.nav && f.dNonPos != null ? (f.dNonPos / f.nav) * 1e4 : null,
      titles.join('; '), xlsExceptionMeaning(titles), xlsFundSeverity(f, view),
    ];
  });
  const sheet = xlsx.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = [
    { wch: 38 }, { wch: 12 }, { wch: 14 }, { wch: 6 }, { wch: 18 }, { wch: 20 },
    { wch: 20 }, { wch: 18 }, { wch: 11 }, { wch: 22 }, { wch: 13 }, { wch: 28 }, { wch: 56 },
    { wch: 10 },
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
