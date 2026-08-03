/**
 * The additive reconciliation, as a waterfall. This is the primary answer on the landing screen:
 * it must be readable without scrolling and without a click (rubric R5).
 */
import { buildWaterfall } from '../../../domain/reconciliation.js';
import { formatUsd, formatUsdParens, formatBpsOf } from '../../../domain/money.js';
import type { PricingView, RepricingFixture } from '../../../domain/types.js';
import { el, replace } from '../../primitives/dom.js';
import { parity, reconciliationKey } from '../../parity.js';

/** New vocabulary for the waterfall, per docs/rename-map.json. */
const WATERFALL_LABEL = {
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
  const key = (slot: Parameters<typeof reconciliationKey>[0]): string | null =>
    reconciliationKey(slot, view);

  const start = el('div', { class: 'wf-step end' }, [
    el('div', {
      class: 'wf-label',
      ...parity(key('start_label')),
      text: after ? WATERFALL_LABEL.derivedAfter : WATERFALL_LABEL.derivedBefore,
    }),
    el('div', { class: 'wf-value', ...parity(key('start_value')), text: formatUsd(w.start) }),
    el('div', {
      class: 'wf-basis',
      ...parity(key('start_basis')),
      text: after ? 'every component at its repriced price' : 'underlyings at current marks',
    }),
  ]);

  const pricingOp = el('div', { class: 'wf-op' }, [
    el('div', { class: 'wf-plus', text: '+', 'aria-hidden': 'true' }),
    el('div', { class: 'wf-op-label', ...parity(key('pricing_label')), text: WATERFALL_LABEL.pricing }),
    after
      ? el('span', { class: 'wf-op-value pos', ...parity(key('pricing_value')), text: '$0' })
      : el('span', {
          class: `wf-op-value ${w.deltaPricing >= 0 ? 'pos' : 'neg'}`,
          ...parity(key('pricing_value')),
          text: formatUsdParens(w.deltaPricing),
        }),
    el('span', {
      class: 'wf-op-bps',
      ...parity(key('pricing_bps')),
      text: after ? '+0.0 bps' : formatBpsOf(w.deltaPricing, w.nav),
    }),
    el('div', {
      class: 'wf-op-basis',
      ...parity(key('pricing_basis')),
      text: after ? 'reconciled · no pricing break' : 'bottom-up NAV repricing',
    }),
  ]);

  const revised = el('div', { class: 'wf-step mid' }, [
    el('div', { class: 'wf-label', text: WATERFALL_LABEL.revised }),
    el('div', { class: 'wf-value', ...parity(key('revised_value')), text: formatUsd(w.revised) }),
    el('div', { class: 'wf-basis', ...parity(key('revised_basis')), text: 'NAV-repriced bottom-up' }),
  ]);

  const nonPositionOp = el('div', { class: 'wf-op' }, [
    el('div', { class: 'wf-plus', text: '+', 'aria-hidden': 'true' }),
    el('div', {
      class: 'wf-op-label',
      ...parity(key('nonposition_label')),
      text: WATERFALL_LABEL.nonPosition,
    }),
    el('span', {
      class: `wf-op-value ${w.deltaNonPosition >= 0 ? 'pos' : 'neg'}`,
      ...parity(key('nonposition_value')),
      text: formatUsdParens(w.deltaNonPosition),
    }),
    el('span', {
      class: 'wf-op-bps',
      ...parity(key('nonposition_bps')),
      text: formatBpsOf(w.deltaNonPosition, w.nav),
    }),
    el('div', {
      class: 'wf-op-basis',
      text: after ? 'non-trade · cash, fees, receivables' : 'cash, fees, receivables',
    }),
  ]);

  const nav = el('div', { class: 'wf-step end' }, [
    el('div', { class: 'wf-label', text: WATERFALL_LABEL.nav }),
    el('div', { class: 'wf-value', ...parity(key('nav_value')), text: formatUsd(w.nav) }),
    el('div', {
      class: 'wf-basis',
      ...parity(key('nav_basis')),
      text: `sum of top-level feeder NAVs · as of ${asof}`,
    }),
  ]);

  replace(host, start, pricingOp, revised, nonPositionOp, nav, renderTie(w, view));
}

function renderTie(w: ReturnType<typeof buildWaterfall>, view: PricingView): HTMLElement {
  const after = view === 'after';
  const statement = el('div', {
    class: 'wf-tie',
    ...parity(reconciliationKey('tie_statement', view)),
  });

  statement.append(
    el('span', {
      class: `wf-tie-pill ${w.ties ? 'ok' : 'bad'}`,
      ...parity(reconciliationKey('tie_status', view)),
      text: w.ties ? '✓ ties to the cent' : `residual ${formatUsdParens(w.residual)}`,
    })
  );

  // Spelled out, because a controller checking arithmetic should not have to take it on trust.
  const detail = el('span', { class: 'wf-tie-detail' });
  detail.append(
    document.createTextNode(`${WATERFALL_LABEL.pricing} `),
    el('b', { text: after ? '$0' : formatUsdParens(w.deltaPricing) }),
    document.createTextNode(` + ${WATERFALL_LABEL.nonPosition} `),
    el('b', { text: formatUsdParens(w.deltaNonPosition) }),
    document.createTextNode(' = '),
    el('b', { text: formatUsdParens(w.tie) }),
    document.createTextNode(
      ` = NAV − ${after ? WATERFALL_LABEL.derivedAfter : WATERFALL_LABEL.derivedBefore} `
    ),
    el('b', { text: formatUsdParens(w.target) })
  );
  statement.append(detail);
  return statement;
}

/** The one-line summary beside the tools. */
export function reconciliationStatusLine(repricing: RepricingFixture): string {
  return (
    `${repricing.product} · ${WATERFALL_LABEL.derivedBefore} ${formatUsd(repricing.D)}` +
    ` → ${WATERFALL_LABEL.revised} ${formatUsd(repricing.R)}` +
    ` → NAV ${formatUsd(repricing.N)} · ${repricing.funds.length} funds`
  );
}
