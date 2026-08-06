/**
 * Reading an uploaded NAV report.
 *
 * Port of the original's `parseNavReport` / `pickEndNavIdx` / `isTrueEndNavH` (1427-1492), which the
 * spec singles out as the one piece of the legacy upload path whose robustness is worth keeping
 * (§6 Q3): it is the code that stops `PREV_DAY_ENDING_NAV` masquerading as this period's NAV, and
 * that recognises a Position Report dropped in the NAV slot by mistake instead of silently reading
 * nothing.
 *
 * It answers with a discriminated result and never throws, because the caller has to be able to tell
 * "not a NAV report" (an error state naming the columns it wanted) from "a NAV report with no rows"
 * (an empty state) from "applied" — rubric R4's three states for the upload slots.
 */
import { csvRows, isBlankFigure, normaliseCode, normaliseHeader, parseFigure } from './cells.js';

export type NavReportResult =
  | { kind: 'applied'; navByFund: Record<string, number>; codes: string[]; layout: 'pivot' | 'feed' }
  | { kind: 'empty'; layout: 'pivot' | 'feed' }
  | { kind: 'position-report' }
  | { kind: 'no-nav-column' }
  | { kind: 'no-layout' }
  /** Two rows give one fund two different net asset values, so neither can be trusted. */
  | { kind: 'duplicate-fund'; code: string; first: number; second: number; row: number }
  /** The ENDING_NAV cell of a fund row holds text, so the column is not what it claims to be. */
  | { kind: 'non-numeric-nav'; code: string; cell: string; row: number };

/** How far into the file a header row may hide. The original's window, unchanged. */
const NAV_HEADER_WINDOW = 8;

/** Qualifiers that make an `…ENDING_NAV…` header something other than this period's NAV. */
const NAV_NOT_THIS_PERIOD = [
  'prevday',
  'previous',
  'prev',
  'beginning',
  'begin',
  'priorday',
  'prior',
  'opening',
  'open',
  'start',
];

/** Exactly `ENDING_NAV` always wins; otherwise the first header that carries it unqualified. */
function navIsThisPeriod(header: string): boolean {
  if (header === 'endingnav') return true;
  if (!header.includes('endingnav')) return false;
  return !NAV_NOT_THIS_PERIOD.some((bad) => header.includes(bad));
}

function navColumnIndex(headers: readonly string[]): number {
  const exact = headers.indexOf('endingnav');
  if (exact >= 0) return exact;
  return headers.findIndex(navIsThisPeriod);
}

/** The header row and the shape it implies, or null when no row in the window looks like one. */
function navLocateHeader(
  rows: readonly string[][]
): { at: number; headers: string[]; fundIndex: number; navIndex: number; isPosition: boolean } | null {
  const limit = Math.min(rows.length, NAV_HEADER_WINDOW);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const headers = row.map(normaliseHeader);
    const hasProduct = headers.includes('product');
    const fundIndex = headers.findIndex((h) => h === 'fundcode' || h === 'fund');
    const navIndex = navColumnIndex(headers);
    const hasQuantity = headers.some((h) => h.includes('quantityvpm'));
    const hasMarketValue = headers.includes('mvusd');
    const isPosition = hasQuantity && hasMarketValue && navIndex < 0;
    if ((hasProduct && fundIndex >= 0) || navIndex >= 0 || isPosition) {
      return { at: i, headers, fundIndex, navIndex, isPosition };
    }
  }
  return null;
}

/**
 * Fund code → this period's NAV, from either layout the original accepted:
 *   pivot — `PRODUCT`, `FUND_CODE`, `ENDING_NAV` (or `Sum of ENDING_NAV`);
 *   feed  — a fund-code column plus a true per-fund ending-NAV column, `PRODUCT` optional.
 *
 * A code that REPEATS with the same figure is still tolerated, which is what the original's
 * first-value-wins rule was protecting: a pivot's subtotal of a one-fund group restates that fund's
 * own NAV, and reading it twice cannot change an answer. A code that repeats with a DIFFERENT figure
 * is refused by name. First-value-wins silently resolved that case too, and the value it picked was
 * whichever row the export happened to write first — so a fund with two share-class rows published a
 * price off one class instead of their sum, with nothing on screen to say so.
 *
 * A fund row whose ENDING_NAV cell holds TEXT is refused by name for the same reason: skipping it
 * quietly drops that fund's NAV out of Σ apex NAV and out of every price derived from it.
 */
export function readNavReport(rows: readonly string[][]): NavReportResult {
  const header = navLocateHeader(rows);
  if (!header) return { kind: 'no-layout' };
  if (header.isPosition) return { kind: 'position-report' };
  // A header row that names funds but no ending-NAV column is a NAV report shape with the one column
  // this app needs missing — a different sentence from "this is not a NAV report at all".
  if (header.navIndex < 0) return { kind: 'no-nav-column' };
  if (header.fundIndex < 0) return { kind: 'no-layout' };

  const layout: 'pivot' | 'feed' = header.headers.includes('product') ? 'pivot' : 'feed';
  const navByFund: Record<string, number> = {};
  const codes: string[] = [];
  const widest = Math.max(header.fundIndex, header.navIndex);
  for (let i = header.at + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length <= widest) continue;
    const code = normaliseCode(row[header.fundIndex]);
    if (!code || normaliseHeader(code) === 'fundcode') continue;
    const raw = row[header.navIndex];
    const value = parseFigure(raw);
    if (value == null) {
      if (isBlankFigure(raw)) continue;
      return { kind: 'non-numeric-nav', code, cell: String(raw ?? '').trim(), row: i + 1 };
    }
    const seen = navByFund[code];
    if (seen !== undefined) {
      if (seen === value) continue;
      return { kind: 'duplicate-fund', code, first: seen, second: value, row: i + 1 };
    }
    navByFund[code] = value;
    codes.push(code);
  }
  if (!codes.length) return { kind: 'empty', layout };
  return { kind: 'applied', navByFund, codes, layout };
}

/** Read a NAV report straight from file text. */
export function readNavReportText(text: string): NavReportResult {
  return readNavReport(csvRows(text));
}

/**
 * Join an uploaded map onto the codes the loaded model actually knows, matching on the hardened
 * form so a whitespace-dirty or lower-case feed code still lands on the model's own spelling. Was
 * `applyRawFeedToREC`'s canonicalisation step. Returns the joined map and the codes that missed.
 */
export function navJoinToModel(
  uploaded: Readonly<Record<string, number>>,
  known: readonly string[]
): { navByFund: Record<string, number>; matched: string[]; unmatched: string[] } {
  const canonical = new Map<string, string>();
  for (const code of known) canonical.set(normaliseCode(code), code);
  const navByFund: Record<string, number> = {};
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const [code, value] of Object.entries(uploaded)) {
    const target = canonical.get(normaliseCode(code));
    if (target == null) {
      unmatched.push(code);
      continue;
    }
    navByFund[target] = value;
    matched.push(target);
  }
  return { navByFund, matched, unmatched };
}
