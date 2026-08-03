/**
 * The drawer: how one fund's published price is derived, what repricing it produced, which of its
 * holdings produced it, and how it gets from its repriced value to its NAV.
 *
 * Three equations first, because "NAV ÷ units" is the whole rule and a controller checking a price
 * should see the numerator and the denominator, not just the quotient.
 * Ported from `renderDetail` (original line 1373).
 */
import { flagForFund, TRUNCATE } from '../../../domain/exceptions.js';
import {
  bpsOf,
  formatCount,
  formatPercent,
  formatPrice,
  formatUsd,
  formatUsdParens,
} from '../../../domain/money.js';
import type { PricingView, RepricingFixture, RepricingFund } from '../../../domain/types.js';
import { el, replace, activate, trapFocus } from '../../primitives/dom.js';
import { parity } from '../../parity.js';
import { pricingRoleLabel } from './price-table.js';

const DETAIL_DASH = '—';

/**
 * The original truncated names at 40 characters here and 24 in the holdings table, with no
 * ellipsis. Both are pinned in the frozen baseline, so the truncation stays and the full name is
 * carried in a `title` instead of being lost.
 */
const DETAIL_NAME_MAX = 40;
const DETAIL_HOLDING_NAME_MAX = 24;

function pricingSection(title: string, body: HTMLElement, note?: string): HTMLElement {
  return el('div', { class: 'section' }, [
    el('h3', { text: title }),
    body,
    note ? el('p', { class: 'note', text: note }) : null,
  ]);
}

function pricingPair(label: string, value: string, tone = ''): HTMLElement {
  return el('div', { class: 'kv-row' }, [
    el('dt', { text: label }),
    el('dd', { class: tone, text: value }),
  ]);
}

/** The three prices, laid out as equations rather than as three unexplained numbers. */
function pricingEquations(fund: RepricingFund): HTMLElement {
  const row = (label: string, middle: string, result: string, publish = false): HTMLElement =>
    el('div', { class: `equation-row${publish ? ' publish' : ''}` }, [
      el('span', { class: 'equation-label', text: label }),
      el('span', { class: 'equation-middle', text: middle }),
      el('span', { class: 'equation-result', text: result }),
    ]);

  const block = el('div', {
    class: 'equation',
    ...parity(`pricing.detail.${fund.code}.price_equations`),
  });
  // The single spaces are load-bearing: the frozen baseline reads this block as one run of text,
  // and the original's markup put whitespace between the rows.
  block.append(
    row(
      'Price to publish · NAV ÷ units',
      `${fund.nav != null ? formatUsd(fund.nav) : DETAIL_DASH} ÷ ${formatCount(fund.gq)}`,
      formatPrice(fund.navPx),
      true
    ),
    ' ',
    row('Repriced unit price (bottom-up)', 'Repriced value ÷ units', formatPrice(fund.revPx)),
    ' ',
    row('Current mark (position marks)', 'Look-through value ÷ units', formatPrice(fund.curPx))
  );
  return block;
}

function pricingLevelBlock(fund: RepricingFund, view: PricingView): HTMLElement {
  const after = view === 'after';
  const bps = bpsOf(fund.pnlLevel, fund.nav);
  const levelPnl = after
    ? '✓ reconciled · $0'
    : formatUsdParens(fund.pnlLevel) + (bps == null ? '' : ` · ${bps.toFixed(1)} bps`);

  const block = el('dl', {
    class: 'kv',
    ...parity(`pricing.detail.${fund.code}.level_pnl_block`),
  });
  block.append(
    pricingPair(
      after
        ? 'Look-through value at repriced marks · at repriced price'
        : 'Look-through value · current marks',
      formatUsd(after ? fund.rev : fund.ltv)
    ),
    ' ',
    pricingPair('Repriced value · bottom-up from NAV', formatUsd(fund.rev)),
    ' ',
    pricingPair(
      'Level gain or loss',
      levelPnl,
      after ? 'reconciled' : fund.pnlLevel < 0 ? 'neg' : 'pos'
    ),
    ' ',
    pricingPair('Direct securities (not repriced)', formatUsd(fund.secMV))
  );
  return block;
}

function pricingHoldingsTable(
  fund: RepricingFund,
  view: PricingView,
  onSelect: (code: string) => void
): HTMLElement {
  const after = view === 'after';
  const shown = fund.holdings
    .slice()
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, TRUNCATE.perHolding);

  const table = el('table', {
    class: 'mini',
    ...parity(`pricing.detail.${fund.code}.per_holding`),
  });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'l', scope: 'col', text: 'Holding' }),
        el('th', { scope: 'col', text: 'Own %' }),
        el('th', { scope: 'col', text: 'Cur px' }),
        el('th', { scope: 'col', text: 'Rev px' }),
        el('th', { scope: 'col', text: 'P&L' }),
      ]),
    ])
  );
  const body = el('tbody');
  for (const holding of shown) {
    const row = el('tr', { 'data-c': holding.i });
    row.append(
      el('td', { class: 'l', text: holding.i }, [
        el('div', {
          class: 'issuer',
          title: holding.name,
          // `sum_assertion` is where the frozen baseline put the LARGEST HOLDING'S NAME, not the
          // Σ line below: the original used one class, `.hn`, for both, and the map's selector took
          // the first match. The key is frozen, so the string it names stays where it was measured.
          ...parity(holding === shown[0] ? `pricing.detail.${fund.code}.sum_assertion` : null),
          text: (holding.name || '').slice(0, DETAIL_HOLDING_NAME_MAX),
        }),
      ]),
      el('td', { text: formatPercent(holding.ownpct) }),
      el('td', { class: 'mono', text: formatPrice(after ? holding.revPx : holding.curPx) }),
      el('td', { class: 'mono', text: formatPrice(holding.revPx) }),
      after
        ? el('td', { class: 'reconciled', text: '$0' })
        : el('td', { class: holding.pnl < 0 ? 'neg' : 'pos', text: formatUsdParens(holding.pnl) })
    );
    activate(row, () => onSelect(holding.i), {
      role: 'button',
      label: `Open the pricing derivation for ${holding.name || holding.i}`,
    });
    body.append(row);
  }
  if (fund.holdings.length > TRUNCATE.perHolding) {
    body.append(
      el('tr', {}, [
        el('td', {
          class: 'l muted',
          colspan: '5',
          text: `+ ${fund.holdings.length - TRUNCATE.perHolding} more holdings, smallest gain or loss first`,
        }),
      ])
    );
  }
  table.append(body);
  return table;
}

function pricingHoldersTable(fund: RepricingFund): HTMLElement {
  const table = el('table', { class: 'mini' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'l', scope: 'col', text: 'Holder' }),
        el('th', { scope: 'col', text: 'Direct share' }),
        el('th', { scope: 'col', text: 'Units held' }),
      ]),
    ])
  );
  const body = el('tbody');
  for (const holder of fund.holders.slice(0, TRUNCATE.whoHolds)) {
    body.append(
      el('tr', {}, [
        el('td', { class: 'l', text: holder.h }),
        el('td', { text: formatPercent(holder.ownpct) }),
        el('td', { text: formatCount(holder.units) }),
      ])
    );
  }
  table.append(body);
  return table;
}

function pricingCopyButton(fund: RepricingFund): HTMLElement | null {
  if (fund.navPx == null) return null;
  const price = fund.navPx.toFixed(6);
  const label = `⎘ Copy publish price ${price}`;
  const button = el('button', {
    type: 'button',
    class: 'btn',
    ...parity(`pricing.detail.${fund.code}.publish_px_copy`),
    text: label,
  });
  button.addEventListener('click', () => {
    void navigator.clipboard?.writeText(price);
    button.textContent = `✓ Copied ${price}`;
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  });
  return button;
}

/**
 * Render the drawer. Returns the focus-trap release, so the caller frees it on close or before the
 * next render rather than stacking traps (R6d).
 */
export function renderFundDetail(
  host: HTMLElement,
  options: {
    fund: RepricingFund;
    repricing: RepricingFixture;
    view: PricingView;
    asof: string;
    onClose: () => void;
    onSelect: (code: string) => void;
  }
): () => void {
  const { fund, repricing, view, asof, onClose, onSelect } = options;
  const flag = flagForFund(fund, view);
  const role = pricingRoleLabel(fund, repricing);
  const nonPosition = fund.nav != null ? fund.nav - fund.rev : null;

  const close = el('button', {
    type: 'button',
    class: 'drawer-close',
    'aria-label': 'Close the pricing derivation',
    text: '×',
  });
  close.addEventListener('click', onClose);

  const header = el('header', { class: 'drawer-head' }, [
    el('div', {}, [
      el('span', {
        class: 'drawer-symbol',
        ...parity(`pricing.detail.${fund.code}.symbol`),
        text: fund.sym || fund.code,
      }),
      el('span', {
        class: `badge badge-${flag === 'ok' ? 'ok' : flag === 'bad' ? 'bad' : 'warn'}`,
        text: flag === 'nonav' ? 'No NAV reported' : flag === 'ok' ? 'Within tolerance' : 'exception',
      }),
      role ? el('span', { class: 'badge badge-ok', text: role }) : null,
    ]),
    el('div', {
      class: 'drawer-sub',
      title: fund.name,
      ...parity(`pricing.detail.${fund.code}.subtitle`),
      text: `${fund.code} · ${(fund.name || '').slice(0, DETAIL_NAME_MAX)} · level ${fund.level}`,
    }),
    close,
  ]);

  const body = el('div', { class: 'drawer-body' });
  const copy = pricingCopyButton(fund);
  body.append(
    pricingSection(
      'Unit price to publish',
      pricingEquations(fund),
      'The published price is the fund’s own NAV divided by its units outstanding, firm-wide, at 6 decimal places.'
    )
  );
  if (copy) body.append(copy);

  body.append(
    pricingSection('Repricing gain or loss at this level (repriced − look-through)', pricingLevelBlock(fund, view))
  );

  if (fund.holdings.length) {
    const sum = fund.holdings.reduce((s, h) => s + h.pnl, 0);
    const assertion = el('p', {
      class: 'note',
      text:
        `Σ per-holding gain or loss = ${view === 'after' ? '$0 · reconciled' : formatUsdParens(sum)}` +
        ' = the level gain or loss (direct securities reprice to 0).',
    });
    const holdings = el('div', {}, [pricingHoldingsTable(fund, view, onSelect), assertion]);
    body.append(
      pricingSection('Per-holding gain or loss · held qty × (repriced price − current mark)', holdings)
    );
  }

  const reconciliation = el('dl', { class: 'kv' }, [
    pricingPair('Repriced value', formatUsd(fund.rev)),
    pricingPair(
      '+ Non-position difference (NAV − repriced)',
      nonPosition == null ? DETAIL_DASH : formatUsdParens(nonPosition),
      (nonPosition ?? 0) < 0 ? 'neg' : 'pos'
    ),
    pricingPair('= NAV', fund.nav != null ? formatUsd(fund.nav) : DETAIL_DASH),
  ]);
  body.append(
    pricingSection('Reconciliation to NAV', reconciliation),
    el('p', {
      class: 'note',
      ...parity(`pricing.detail.${fund.code}.nonposition_note`),
      text:
        'Non-position = assets/liabilities in NAV not captured in the positions report' +
        ' (cash, fees, receivables).',
    })
  );

  if (fund.holders.length) {
    body.append(
      pricingSection(
        `Who holds ${fund.sym || fund.code} · ${fund.nHolders} holder${fund.nHolders === 1 ? '' : 's'} firm-wide`,
        pricingHoldersTable(fund),
        fund.holders.length > TRUNCATE.whoHolds
          ? `Showing the largest ${TRUNCATE.whoHolds} of ${fund.nHolders}.`
          : undefined
      )
    );
  }

  body.append(
    el('p', { class: 'drawer-asof', text: `All money in USD, prices at 6 dp, as of ${asof}.` })
  );

  replace(host, header, body);
  return trapFocus(host, onClose);
}
