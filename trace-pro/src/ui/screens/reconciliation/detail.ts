/**
 * The breakdown for one row of the hierarchy: how its NAV, look-through value and repriced value
 * relate, what it is booked at, its publish price, any exception in plain English, and who holds it.
 */
import { reconcileNode } from '../../../domain/lookthrough.js';
import { evaluateEntity, TRUNCATE } from '../../../domain/exceptions.js';
import {
  formatUsd,
  formatUsdParens,
  formatPercent,
  formatCount,
  formatPrice,
} from '../../../domain/money.js';
import type { LookthroughNode, PricingView, RepricingFixture } from '../../../domain/types.js';
import { el, replace, trapFocus } from '../../primitives/dom.js';
import { parity } from '../../parity.js';

const KIND_TEXT: Record<LookthroughNode['kind'], string> = {
  product: 'Product',
  apex: 'Top-level feeder',
  vehicle: 'SPV / fund',
  leaf: 'Security',
};

export function renderNodeDetail(
  host: HTMLElement,
  options: {
    node: LookthroughNode;
    repricing: RepricingFixture;
    view: PricingView;
    asof: string;
    symbolOf: (code: string) => string;
    onClose: () => void;
  }
): void {
  const { node, repricing, view, asof, symbolOf, onClose } = options;
  const r = reconcileNode(node, repricing, view);
  const after = view === 'after';

  const units = repricing.gqByFund[node.code] ?? null;
  const wholeNav = repricing.navByFund[node.code] ?? null;
  const publishPrice = units && wholeNav != null ? wholeNav / units : null;

  const verdict = evaluateEntity({
    nav: wholeNav,
    revised: repricing.revByFund[node.code] ?? null,
    derived: repricing.ltvByFund[node.code] ?? null,
    globalUnits: units,
    view,
    describe: (usd, bps) => ({
      nonPosition:
        `NAV is ${formatUsdParens(usd)} (${bps.toFixed(0)} bps) away from the bottom-up repriced ` +
        'value — assets or liabilities inside NAV, such as cash, fees or receivables, that are not ' +
        'held as positions.',
      pricing:
        `Repricing the underlyings from their own NAVs moves value by ${formatUsdParens(usd)} ` +
        `(${bps.toFixed(0)} bps) against today's position marks.`,
    }),
  });

  const close = el('button', {
    type: 'button',
    class: 'drawer-close',
    'aria-label': 'Close the breakdown',
    text: '×',
  });
  close.addEventListener('click', onClose);

  const key = (suffix: string): Record<string, string> =>
    parity(`reconciliation.detail.${node.code}.${suffix}`);

  const header = el('header', { class: 'drawer-head' }, [
    el('div', {}, [
      el('span', { class: 'drawer-symbol', ...key('symbol'), text: symbolOf(node.code) }),
      verdict.severity
        ? el('span', { class: `badge badge-${verdict.severity}`, ...key('status_badge'), text: 'exception' })
        : el('span', { class: 'badge badge-ok', ...key('status_badge'), text: 'within tolerance' }),
    ]),
    el('div', {
      class: 'drawer-sub',
      ...key('subtitle'),
      text: `${node.code} · ${node.name} · ${KIND_TEXT[node.kind]}`,
    }),
    close,
  ]);

  const body = el('div', { class: 'drawer-body' });

  body.append(
    section('Reconciliation, attributed to this product', key('figures'), [
      pair('NAV', r.nav == null ? '—' : formatUsd(r.nav)),
      pair(
        after ? 'Look-through value · at repriced marks' : 'Look-through value · current marks',
        formatUsd(r.derived)
      ),
      pair('Repriced value · bottom-up from NAV', formatUsd(r.revised)),
      pair(
        'Pricing difference (repriced − look-through)',
        after
          ? '✓ reconciled · $0'
          : formatUsdParens(r.deltaPricing) +
              (r.pricingBps == null ? '' : ` · ${r.pricingBps.toFixed(1)} bps`)
      ),
      pair(
        'Non-position difference (NAV − repriced)',
        r.deltaNonPosition == null
          ? '—'
          : formatUsdParens(r.deltaNonPosition) +
              (r.nonPositionBps == null ? '' : ` · ${r.nonPositionBps.toFixed(1)} bps`)
      ),
    ])
  );

  if (node.kind !== 'product') {
    body.append(
      section('As booked in the position report', {}, [
        pair('Position value attributed to this product', formatUsd(node.position)),
        pair('Book value of the stake', node.carried ? formatUsd(node.carried) : '—'),
        ...(node.kind === 'vehicle'
          ? [pair('Direct share of the level below', formatPercent(node.ownpct))]
          : []),
        pair('Effective share held by this product', formatPercent(node.applied)),
      ])
    );
  }

  if (publishPrice != null) {
    body.append(
      section('Price to publish', {}, [
        pair('NAV ÷ units outstanding', formatPrice(publishPrice), 'mono', key('publish_price')),
        pair('Units outstanding, firm-wide', formatCount(units)),
      ])
    );
  }

  for (const message of verdict.messages) {
    body.append(
      el('div', { class: `callout callout-${verdict.severity ?? 'warn'}` }, [
        el('div', { class: 'callout-title', text: message.title }),
        el('p', { text: message.detail }),
      ])
    );
  }

  const fund = repricing.funds.find((f) => f.code === node.code);
  if (fund?.holders.length) {
    const table = el('table', { class: 'mini', ...key('held_by') });
    table.append(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { class: 'l', scope: 'col', text: 'Holder' }),
          el('th', { scope: 'col', text: 'Direct share' }),
          el('th', { scope: 'col', text: 'Units held' }),
        ]),
      ])
    );
    const tbody = el('tbody');
    for (const holder of fund.holders.slice(0, TRUNCATE.heldBy)) {
      tbody.append(
        el('tr', {}, [
          el('td', { class: 'l', text: holder.h }),
          el('td', { text: formatPercent(holder.ownpct) }),
          el('td', { text: formatCount(holder.units) }),
        ])
      );
    }
    table.append(tbody);
    body.append(
      el('div', { class: 'section' }, [
        el('h3', {
          text: `Held by · ${fund.nHolders} holder${fund.nHolders === 1 ? '' : 's'} firm-wide`,
        }),
        table,
        fund.holders.length > TRUNCATE.heldBy
          ? el('p', {
              class: 'note',
              text: `Showing the largest ${TRUNCATE.heldBy} of ${fund.nHolders}.`,
            })
          : null,
      ])
    );
  }

  body.append(el('p', { class: 'drawer-asof', text: `All figures in USD, as of ${asof}.` }));

  replace(host, header, body);
  const release = trapFocus(host, onClose);
  host.addEventListener(
    'trace-drawer-closed',
    () => {
      release();
    },
    { once: true }
  );
}

function section(title: string, attrs: Record<string, string>, rows: HTMLElement[]): HTMLElement {
  return el('div', { class: 'section' }, [
    el('h3', { text: title }),
    el('dl', { class: 'kv', ...attrs }, rows),
  ]);
}

function pair(
  label: string,
  value: string,
  className = '',
  attrs: Record<string, string> = {}
): HTMLElement {
  return el('div', { class: 'kv-row' }, [
    el('dt', { text: label }),
    el('dd', { class: className, ...attrs, text: value }),
  ]);
}
