/**
 * The publish table: one row per fund in scope, with the three unit prices side by side and the
 * value they produce. This is the deliverable — the price that leaves the building — so the
 * publish column is visually separated and every row is one keystroke from its full derivation.
 *
 * Ported from `RECCOLS` / `recRows` / `renderTable` (original lines 1345-1372). The materiality
 * bands behind the bps chip come from `src/domain/exceptions.ts`; there is no threshold here.
 */
import { flagForFund, WARN_BPS, BAD_BPS } from '../../../domain/exceptions.js';
import { bpsOf, formatPrice, formatUsd, formatUsdParens } from '../../../domain/money.js';
import type { PricingView, RepricingFixture, RepricingFund } from '../../../domain/types.js';
import { el, replace, activate, loadingState, emptyState, errorState } from '../../primitives/dom.js';
import { parity } from '../../parity.js';

const PRICING_DASH = '—';

/* ------------------------------------------- the states both pricing tables can render (R4) */

/**
 * `src/data/load.ts` publishes the count of outstanding fixture fetches as `data-fetching` on
 * `<html>`. While one is in flight a price on this screen can still be superseded, and a price that
 * is about to change is the one figure a controller must not read, so both pricing panels hold a
 * loading state until the fetch settles. It is the same signal the verification harness waits on
 * (`scripts/lib/browser.mjs` `settle`), so a snapshot is never taken while this state is up.
 * Defined here and imported by the walk, so the rule has one definition (R9).
 */
export function pricingFixturesInFlight(): boolean {
  return document.documentElement.hasAttribute('data-fetching');
}

/** Re-run `render` as soon as the last outstanding fixture fetch settles. */
export function pricingAfterFixtures(host: HTMLElement, render: () => void): void {
  const observer = new MutationObserver(() => {
    if (pricingFixturesInFlight()) return;
    observer.disconnect();
    if (host.isConnected) render();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-fetching'] });
  // The attribute can be dropped between the check above and the observer attaching.
  if (!pricingFixturesInFlight()) {
    observer.disconnect();
    render();
  }
}

/**
 * What is wrong with the fund rows both pricing panels need, in plain language — or null when they
 * are sound. A row whose value is not a number would otherwise print as `$NaN`, which is exactly
 * the silent failure R14 exists to stop.
 */
export function pricingDataProblem(repricing: RepricingFixture | null | undefined): string | null {
  if (!repricing || !Array.isArray(repricing.funds)) {
    return 'the repricing model arrived without its list of funds';
  }
  if (!repricing.funds.length) return 'the repricing model arrived with no fund rows at all';
  const broken = repricing.funds.filter(
    (f) => typeof f?.code !== 'string' || !f.code || !Number.isFinite(f.ltv) || !Number.isFinite(f.rev)
  ).length;
  if (broken) {
    return `${broken} of ${repricing.funds.length} fund rows carry no usable value to price from`;
  }
  return null;
}

/** The shared error panel: what failed, what it does not affect, and what to do next. */
export function pricingErrorPanel(host: HTMLElement, panel: string, problem: string): void {
  replace(
    host,
    errorState(
      `The ${panel} could not be built.`,
      `This product’s repricing data arrived incomplete: ${problem}. No price on this panel can be` +
        ' trusted until that is fixed, so none is shown; the funds themselves are still there.' +
        ' Reload to fetch the data again, or open Data sources to see which file is at fault.',
      { label: 'Reload this product’s data', onAct: () => location.reload() }
    )
  );
}

/** Column order is the original's; the words are the rename table's (§3.1). */
export const PRICE_COLUMNS = [
  { key: 'code', label: 'Fund', align: 'l' },
  { key: 'sym', label: 'Symbol', align: 'l' },
  { key: 'navPx', label: 'Price to publish', align: 'r' },
  { key: 'curPx', label: 'Current mark', after: 'Repriced mark', align: 'r' },
  { key: 'revPx', label: 'Repriced unit price', align: 'r' },
  { key: 'ltv', label: 'Look-through value', after: 'Look-through value at repriced marks', align: 'r' },
  { key: 'rev', label: 'Repriced value', align: 'r' },
  { key: 'pnlLevel', label: 'Repricing gain or loss', after: 'Repricing gain or loss (reconciled)', align: 'r' },
  { key: 'bps', label: 'bps', align: 'r' },
] as const;

/** apex / terminal, in words (§3.1). Mid-level funds carry neither, exactly as the original. */
export function pricingRoleLabel(fund: RepricingFund, repricing: RepricingFixture): string {
  if (repricing.apex.includes(fund.code)) return 'Top-level feeder';
  return fund.terminal ? 'Lowest level' : '';
}

/** The bps chip: the level gain or loss over the fund's own NAV, at 0dp, as the original rendered it. */
export function pricingBpsChip(fund: RepricingFund, view: PricingView): string {
  if (view === 'after') return '0';
  const bps = bpsOf(fund.pnlLevel, fund.nav);
  return bps == null ? PRICING_DASH : bps.toFixed(0);
}

export function pricingFilterFunds(
  funds: readonly RepricingFund[],
  filter: string
): RepricingFund[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return funds.slice();
  return funds.filter((f) => `${f.code} ${f.sym} ${f.name}`.toLowerCase().includes(needle));
}

function pricingSortValue(fund: RepricingFund, column: string): number | string | null {
  switch (column) {
    case 'code':
      return fund.code;
    case 'sym':
      return fund.sym;
    case 'navPx':
      return fund.navPx;
    case 'curPx':
      return fund.curPx;
    case 'revPx':
      return fund.revPx;
    case 'ltv':
      return fund.ltv;
    case 'rev':
      return fund.rev;
    case 'pnlLevel':
      return fund.pnlLevel;
    case 'dNonPos':
      return fund.dNonPos;
    case 'bps':
      return bpsOf(fund.pnlLevel, fund.nav);
    default:
      return fund.nav;
  }
}

/**
 * Sort as the original did: money and bps columns sort by magnitude (a big loss is as interesting
 * as a big gain), text columns lexically, and a missing figure sorts to the bottom rather than
 * pretending to be zero.
 */
export function pricingSortRows(
  funds: readonly RepricingFund[],
  sort: { column: string; direction: 1 | -1 }
): RepricingFund[] {
  const rows = funds.slice();
  const d = sort.direction;
  const magnitude = sort.column === 'pnlLevel' || sort.column === 'dNonPos' || sort.column === 'bps';
  rows.sort((a, b) => {
    const va = pricingSortValue(a, sort.column);
    const vb = pricingSortValue(b, sort.column);
    if (typeof va === 'string' || typeof vb === 'string') {
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return sa < sb ? -d : sa > sb ? d : 0;
    }
    const na = va == null ? -Infinity : magnitude ? Math.abs(va) : va;
    const nb = vb == null ? -Infinity : magnitude ? Math.abs(vb) : vb;
    return (na - nb) * d;
  });
  return rows;
}

export interface PriceTableCallbacks {
  onSort(column: string): void;
  onSelect(code: string): void;
  onClearFilter(): void;
}

/** The keys the after-basis view answers to; a null means the baseline does not pin that cell. */
function pricingCellKey(code: string, slot: string, view: PricingView): string | null {
  if (view !== 'after') return `pricing.fund.${code}.${slot}`;
  const after: Record<string, string> = {
    current_px: 'applied_px',
    derived_mv: 'repriced_mv',
    revised_mv: 'revised_mv',
    repricing_pnl: 'pnl',
  };
  const mapped = after[slot];
  return mapped ? `pricing.after.fund.${code}.${mapped}` : null;
}

function pricingHeaderRow(
  view: PricingView,
  sort: { column: string; direction: 1 | -1 },
  onSort: (column: string) => void
): HTMLElement {
  const head = el('tr', { ...parity('pricing.table.column_headers') });
  for (const column of PRICE_COLUMNS) {
    const active = sort.column === column.key;
    const label = view === 'after' && 'after' in column ? column.after : column.label;
    const th = el('th', {
      class: [column.align === 'l' ? 'l' : 'r', column.key === 'navPx' ? 'pub-col' : '']
        .filter(Boolean)
        .join(' '),
      scope: 'col',
      'data-col': column.key,
      'aria-sort': active ? (sort.direction < 0 ? 'descending' : 'ascending') : 'none',
      text: label + (active ? (sort.direction < 0 ? ' ▾' : ' ▴') : ''),
    });
    activate(th, () => onSort(column.key), {
      role: 'columnheader',
      label: active
        ? `${label}, sorted ${sort.direction < 0 ? 'largest first' : 'smallest first'}. Reverse the order.`
        : `Sort by ${label}`,
    });
    head.append(th);
  }
  return head;
}

function pricingFundCell(
  fund: RepricingFund,
  repricing: RepricingFixture,
  view: PricingView
): HTMLElement {
  const flag = flagForFund(fund, view);
  const role = pricingRoleLabel(fund, repricing);
  return el('td', { class: 'l' }, [
    el('span', {
      class: `severity-dot ${flag === 'ok' ? '' : flag}`.trim(),
      'aria-hidden': 'true',
      title: flag === 'nonav' ? 'No NAV reported' : flag === 'ok' ? 'Within tolerance' : 'Exception',
    }),
    el('span', {
      class: 'row-name',
      ...parity(pricingCellKey(fund.code, 'name', view)),
      text: fund.name || fund.code,
    }),
    el('span', { class: 'code', text: fund.code }),
    // Always present, even when a mid-level fund is neither: the baseline pins the empty string.
    el('span', {
      class: role ? 'tag tag-apex' : '',
      ...parity(pricingCellKey(fund.code, 'role', view)),
      text: role,
    }),
  ]);
}

function pricingRow(
  fund: RepricingFund,
  repricing: RepricingFixture,
  view: PricingView,
  selectedCode: string | null,
  onSelect: (code: string) => void
): HTMLElement {
  const after = view === 'after';
  const flag = flagForFund(fund, view);
  const bps = pricingBpsChip(fund, view);
  const magnitude = Math.abs(Number(bps) || 0);
  const key = (slot: string): Record<string, string> => parity(pricingCellKey(fund.code, slot, view));

  const row = el('tr', {
    class: [
      'row',
      fund.code === selectedCode ? 'selected' : '',
      flag === 'warn' || flag === 'bad' ? `flagged ${flag}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    'data-c': fund.code,
  });
  const mark = after ? fund.revPx : fund.curPx;
  row.append(
    pricingFundCell(fund, repricing, view),
    el('td', { class: 'l mono', ...key('symbol'), text: fund.sym || PRICING_DASH }),
    el('td', { class: 'r mono pub-col', ...key('publish_px'), text: formatPrice(fund.navPx) }),
    el('td', { class: 'r mono', ...key('current_px'), text: formatPrice(mark) }),
    el('td', { class: 'r mono', ...key('revised_px'), text: formatPrice(fund.revPx) }),
    el('td', { class: 'r', ...key('derived_mv'), text: formatUsd(after ? fund.rev : fund.ltv) }),
    el('td', { class: 'r strong', ...key('revised_mv'), text: formatUsd(fund.rev) }),
    after
      ? el('td', { class: 'r reconciled', ...key('repricing_pnl'), text: '$0' })
      : el('td', {
          class: `r ${fund.pnlLevel < 0 ? 'neg' : 'pos'}`,
          ...key('repricing_pnl'),
          text: formatUsdParens(fund.pnlLevel),
        }),
    el('td', { class: 'r' }, [
      el('span', {
        class: `bps-chip ${magnitude < WARN_BPS ? '' : magnitude < BAD_BPS ? 'warn' : 'bad'}`.trim(),
        ...key('pnl_bps'),
        text: bps,
      }),
    ])
  );

  activate(row, () => onSelect(fund.code), {
    role: 'button',
    label: `Open the pricing derivation for ${fund.name || fund.code}`,
  });
  return row;
}

export function renderPriceTable(
  host: HTMLElement,
  options: {
    repricing: RepricingFixture;
    view: PricingView;
    sort: { column: string; direction: 1 | -1 };
    filter: string;
    selectedCode: string | null;
    asof: string;
  },
  callbacks: PriceTableCallbacks
): void {
  const { repricing, view, sort, filter, selectedCode, asof } = options;

  if (pricingFixturesInFlight()) {
    replace(host, loadingState('the prices to publish'));
    pricingAfterFixtures(host, () => renderPriceTable(host, options, callbacks));
    return;
  }
  const problem = pricingDataProblem(repricing);
  if (problem) {
    pricingErrorPanel(host, 'table of prices to publish', problem);
    return;
  }

  const rows = pricingSortRows(pricingFilterFunds(repricing.funds, filter), sort);

  if (!rows.length) {
    replace(
      host,
      emptyState(`No fund matches “${filter.trim()}”. All ${repricing.funds.length} funds are still here.`, {
        label: 'Clear the filter',
        onAct: callbacks.onClearFilter,
      })
    );
    return;
  }

  const body = el('tbody');
  for (const fund of rows) {
    body.append(pricingRow(fund, repricing, view, selectedCode, callbacks.onSelect));
  }

  // `id="rectable"` is a harness anchor: the frozen rfxRow step selects
  // `#rectable tbody tr[data-c="CODE"]`, and the rows already publish data-c.
  const table = el('table', {
    id: 'rectable',
    class: 'tbl',
    'aria-label': `Unit prices and repricing for ${repricing.product}, as of ${asof}`,
  });
  table.append(
    el('caption', {
      class: 'note',
      text:
        `Money in USD, unit prices at 6 decimal places, bps = the fund's repricing gain or loss ÷ its own` +
        ` NAV × 10,000. ${rows.length} of ${repricing.funds.length} funds shown, as of ${asof}.`,
    }),
    el('thead', {}, [pricingHeaderRow(view, sort, callbacks.onSort)]),
    body
  );
  replace(host, table);
}
