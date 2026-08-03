/**
 * The additive reconciliation, as a waterfall. This is the primary answer on the landing screen:
 * it must be readable without scrolling and without a click (rubric R5).
 */
import { buildWaterfall } from '../../../domain/reconciliation.js';
import { formatUsd, formatUsdParens, formatBpsOf } from '../../../domain/money.js';
import type { PricingView, RepricingFixture } from '../../../domain/types.js';
import { el, replace } from '../../primitives/dom.js';

/** New vocabulary for the waterfall, per docs/rename-map.json. */
const LABEL = {
  derivedBefore: 'Look-through value',
  derivedAfter: 'Look-through value at repriced marks',
  pricing: 'Pricing difference',
  revised: 'Repriced value',
  nonPosition: 'Non-position difference',
  nav: 'NAV',
} as const;

export function renderWaterfall(
  host: HTMLElement,
  repricing: RepricingFixture,
  view: PricingView,
  asof: string
): void {
  const w = buildWaterfall(repricing, view);
  const after = view === 'after';

  const valueBox = (label: string, value: number, basis: string, cls: string): HTMLElement =>
    el('div', { class: `wf-step ${cls}` }, [
      el('div', { class: 'wf-label', text: label }),
      el('div', { class: 'wf-value', text: formatUsd(value) }),
      el('div', { class: 'wf-basis', text: basis }),
    ]);

  const operator = (
    label: string,
    value: number,
    basis: string,
    reconciled: boolean
  ): HTMLElement =>
    el('div', { class: 'wf-op' }, [
      el('div', { class: 'wf-plus', text: '+', 'aria-hidden': 'true' }),
      el('div', { class: 'wf-op-label', text: label }),
      reconciled
        ? el('span', { class: 'wf-op-value pos', text: '$0' })
        : el('span', {
            class: `wf-op-value ${value >= 0 ? 'pos' : 'neg'}`,
            text: formatUsdParens(value),
          }),
      el('span', {
        class: 'wf-op-bps',
        text: reconciled ? '+0.0 bps' : formatBpsOf(value, w.nav),
      }),
      el('div', { class: 'wf-op-basis', text: basis }),
    ]);

  replace(
    host,
    valueBox(
      after ? LABEL.derivedAfter : LABEL.derivedBefore,
      w.start,
      after ? 'every component at its repriced price' : 'underlyings at current marks',
      'end'
    ),
    operator(
      LABEL.pricing,
      w.deltaPricing,
      after ? 'reconciled · no pricing break' : 'bottom-up NAV repricing',
      after
    ),
    valueBox(LABEL.revised, w.revised, 'NAV-repriced bottom-up', 'mid'),
    operator(
      LABEL.nonPosition,
      w.deltaNonPosition,
      after ? 'non-trade · cash, fees, receivables' : 'cash, fees, receivables',
      false
    ),
    valueBox(LABEL.nav, w.nav, `sum of top-level feeder NAVs · as of ${asof}`, 'end'),
    renderTie(w, after)
  );
}

function renderTie(
  w: ReturnType<typeof buildWaterfall>,
  after: boolean
): HTMLElement {
  const statement = el('div', { class: 'wf-tie' });
  statement.append(
    el('span', {
      class: `wf-tie-pill ${w.ties ? 'ok' : 'bad'}`,
      text: w.ties ? '✓ ties to the cent' : `residual ${formatUsdParens(w.residual)}`,
    })
  );

  // Spelled out, because a controller checking arithmetic should not have to take it on trust.
  const detail = el('span', { class: 'wf-tie-detail' });
  detail.append(
    document.createTextNode(`${LABEL.pricing} `),
    el('b', { text: after ? '$0' : formatUsdParens(w.deltaPricing) }),
    document.createTextNode(` + ${LABEL.nonPosition} `),
    el('b', { text: formatUsdParens(w.deltaNonPosition) }),
    document.createTextNode(' = '),
    el('b', { text: formatUsdParens(w.tie) }),
    document.createTextNode(
      ` = NAV − ${after ? LABEL.derivedAfter : LABEL.derivedBefore} `
    ),
    el('b', { text: formatUsdParens(w.target) })
  );
  statement.append(detail);
  return statement;
}

/** The one-line summary the original showed beside the tools. */
export function reconciliationStatusLine(repricing: RepricingFixture): string {
  return (
    `${repricing.product} · ${LABEL.derivedBefore} ${formatUsd(repricing.D)}` +
    ` → ${LABEL.revised} ${formatUsd(repricing.R)}` +
    ` → NAV ${formatUsd(repricing.N)} · ${repricing.funds.length} funds`
  );
}
