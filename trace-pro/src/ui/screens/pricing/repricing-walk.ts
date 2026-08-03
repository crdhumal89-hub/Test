/**
 * The repricing walk: the same 26 funds, but arranged as an audit trail — price before, price
 * after, and what the change was worth — with a PRODUCT total row that ties to the score strip.
 *
 * Deepest level first by default, because that is the order the repricing itself runs in.
 * Ported from `WALKCOLS` / `walkRows` / `renderWalk` (original line 1789+).
 */
import { bpsOf, formatBpsSigned, formatCount, formatPrice, formatPriceDelta, formatUsd, formatUsdParens } from '../../../domain/money.js';
import type { RepricingFixture, RepricingFund } from '../../../domain/types.js';
import { el, replace, activate, emptyState } from '../../primitives/dom.js';
import { parity } from '../../parity.js';
import { pricingFilterFunds } from './price-table.js';

const WALK_DASH = '—';

/**
 * Column words are the original's, verbatim: none of them appears in the rename table, and the
 * frozen baseline pins this header row including its sort marker.
 */
export const WALK_COLUMNS = [
  { key: 'level', label: 'Level', align: 'l' },
  { key: 'name', label: 'Fund', align: 'l' },
  { key: 'sym', label: 'Symbol', align: 'l' },
  { key: 'gq', label: 'Global Qty', align: 'r' },
  { key: 'nav', label: 'NAV', align: 'r' },
  { key: 'curPx', label: 'Price before', align: 'r' },
  { key: 'ltv', label: 'Value before', align: 'r' },
  { key: 'revPx', label: 'Price after', align: 'r' },
  { key: 'rev', label: 'Value after', align: 'r' },
  { key: 'dpx', label: 'Δ Price', align: 'r' },
  { key: 'pnlLevel', label: 'Δ Value (P&L)', align: 'r' },
  { key: 'bps', label: 'Δ bps', align: 'r' },
] as const;

/** The change in unit price, or null when either side has no price to compare. */
export function pricingPriceDelta(fund: RepricingFund): number | null {
  return fund.revPx != null && fund.curPx != null ? fund.revPx - fund.curPx : null;
}

function pricingWalkSortValue(fund: RepricingFund, column: string): number | string | null {
  switch (column) {
    case 'name':
      return fund.name;
    case 'sym':
      return fund.sym;
    case 'gq':
      return fund.gq;
    case 'nav':
      return fund.nav;
    case 'curPx':
      return fund.curPx;
    case 'ltv':
      return fund.ltv;
    case 'revPx':
      return fund.revPx;
    case 'rev':
      return fund.rev;
    case 'dpx':
      return (fund.revPx ?? 0) - (fund.curPx ?? 0);
    case 'pnlLevel':
      return fund.pnlLevel;
    case 'bps':
      return bpsOf(fund.pnlLevel, fund.nav) ?? 0;
    default:
      return fund.level;
  }
}

export function pricingWalkSortRows(
  funds: readonly RepricingFund[],
  sort: { column: string; direction: 1 | -1 }
): RepricingFund[] {
  const rows = funds.slice();
  const d = sort.direction;
  rows.sort((a, b) => {
    const va = pricingWalkSortValue(a, sort.column);
    const vb = pricingWalkSortValue(b, sort.column);
    if (typeof va === 'string' || typeof vb === 'string') {
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      return sa < sb ? -d : sa > sb ? d : 0;
    }
    const na = va == null ? -Infinity : va;
    const nb = vb == null ? -Infinity : vb;
    return (na - nb) * d;
  });
  return rows;
}

export interface WalkCallbacks {
  onSort(column: string): void;
  onSelect(code: string): void;
  onClearFilter(): void;
}

function pricingWalkHeader(
  sort: { column: string; direction: 1 | -1 },
  onSort: (column: string) => void
): HTMLElement {
  const head = el('tr', { ...parity('pricing.walk.column_headers') });
  for (const column of WALK_COLUMNS) {
    const active = sort.column === column.key;
    const th = el('th', {
      class: column.align === 'l' ? 'l' : 'r',
      scope: 'col',
      'data-col': column.key,
      'aria-sort': active ? (sort.direction < 0 ? 'descending' : 'ascending') : 'none',
      text: column.label + (active ? (sort.direction < 0 ? ' ▾' : ' ▴') : ''),
    });
    activate(th, () => onSort(column.key), {
      role: 'columnheader',
      label: active
        ? `${column.label}, sorted ${sort.direction < 0 ? 'largest first' : 'smallest first'}. Reverse the order.`
        : `Sort by ${column.label}`,
    });
    head.append(th);
  }
  return head;
}

function pricingWalkRow(
  fund: RepricingFund,
  selectedCode: string | null,
  onSelect: (code: string) => void
): HTMLElement {
  const delta = pricingPriceDelta(fund);
  const bps = bpsOf(fund.pnlLevel, fund.nav);
  const key = (slot: string): Record<string, string> => parity(`pricing.walk.fund.${fund.code}.${slot}`);

  const row = el('tr', {
    class: `row${fund.code === selectedCode ? ' selected' : ''}`,
    'data-c': fund.code,
    title: fund.name || fund.code,
  });
  row.append(
    el('td', { class: 'l', ...key('level') }, [
      el('span', { class: 'level-pill', text: `L${fund.level}` }),
    ]),
    el('td', { class: 'l' }, [
      el('span', { class: 'row-name', text: fund.name || fund.code }),
      el('span', { class: 'code', text: fund.code }),
    ]),
    el('td', { class: 'l mono', text: fund.sym || WALK_DASH }),
    el('td', { class: 'r mono', ...key('global_qty'), text: fund.gq ? formatCount(fund.gq) : WALK_DASH }),
    el('td', { class: 'r', ...key('nav'), text: fund.nav != null ? formatUsd(fund.nav) : WALK_DASH }),
    el('td', { class: 'r mono', ...key('price_before'), text: formatPrice(fund.curPx) }),
    el('td', { class: 'r', ...key('value_before'), text: formatUsd(fund.ltv) }),
    el('td', { class: 'r mono', ...key('price_after'), text: formatPrice(fund.revPx) }),
    el('td', { class: 'r strong', ...key('value_after'), text: formatUsd(fund.rev) }),
    el('td', {
      class: 'r mono',
      ...key('delta_price'),
      text: formatPriceDelta(delta) ?? WALK_DASH,
    }),
    el('td', {
      class: `r ${fund.pnlLevel < 0 ? 'neg' : 'pos'}`,
      ...key('delta_value'),
      text: formatUsdParens(fund.pnlLevel),
    }),
    el('td', {
      class: `r mono ${(bps ?? 0) < 0 ? 'neg' : 'pos'}`,
      ...key('delta_bps'),
      text: bps == null ? WALK_DASH : formatBpsSigned(bps),
    })
  );

  activate(row, () => onSelect(fund.code), {
    role: 'button',
    label: `Open the pricing derivation for ${fund.name || fund.code}`,
  });
  return row;
}

function pricingWalkTotal(repricing: RepricingFixture): HTMLElement {
  const bps = bpsOf(repricing.dPricing, repricing.N);
  const row = el('tr', { class: 'row totals' });
  row.append(
    el('td', {
      class: 'l',
      colspan: '3',
      ...parity('pricing.walk.total.label'),
      text: `PRODUCT · ${repricing.productCode} (sum of top-level feeders)`,
    }),
    el('td', {}),
    el('td', { class: 'r', ...parity('pricing.walk.total.nav'), text: formatUsd(repricing.N) }),
    el('td', {}),
    el('td', {
      class: 'r',
      ...parity('pricing.walk.total.value_before'),
      text: formatUsd(repricing.D),
    }),
    el('td', {}),
    el('td', {
      class: 'r strong',
      ...parity('pricing.walk.total.value_after'),
      text: formatUsd(repricing.R),
    }),
    el('td', {}),
    el('td', {
      class: `r ${repricing.dPricing < 0 ? 'neg' : 'pos'}`,
      ...parity('pricing.walk.total.delta_value'),
      text: formatUsdParens(repricing.dPricing),
    }),
    el('td', {
      class: `r mono ${repricing.dPricing < 0 ? 'neg' : 'pos'}`,
      ...parity('pricing.walk.total.delta_bps'),
      text: bps == null ? WALK_DASH : formatBpsSigned(bps),
    })
  );
  return row;
}

export function renderRepricingWalk(
  host: HTMLElement,
  options: {
    repricing: RepricingFixture;
    sort: { column: string; direction: 1 | -1 };
    filter: string;
    selectedCode: string | null;
    asof: string;
  },
  callbacks: WalkCallbacks
): void {
  const { repricing, sort, filter, selectedCode, asof } = options;
  const rows = pricingWalkSortRows(pricingFilterFunds(repricing.funds, filter), sort);

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
  for (const fund of rows) body.append(pricingWalkRow(fund, selectedCode, callbacks.onSelect));
  body.append(pricingWalkTotal(repricing));

  const table = el('table', {
    class: 'tbl',
    'aria-label': `Repricing walk for ${repricing.product}, as of ${asof}`,
  });
  table.append(
    el('caption', {
      class: 'note',
      text:
        'Money and NAV in USD, prices and Δ Price at 6 decimal places, units as counts,' +
        ` Δ bps = Δ Value ÷ the fund's own NAV × 10,000. Level 1 is a top-level feeder;` +
        ` the deepest level prices from NAV ÷ units. As of ${asof}.`,
    }),
    el('thead', {}, [pricingWalkHeader(sort, callbacks.onSort)]),
    body
  );
  replace(host, table);
}
