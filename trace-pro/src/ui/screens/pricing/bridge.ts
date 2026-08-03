/**
 * The valuation bridge: product NAV on one side, look-through value on the other, the gap between
 * them, and one bar per top-level feeder showing which feeder the gap belongs to.
 *
 * The bars are driven off the SAME map as the waterfall (Σ apex ENDING_NAV vs the derived values),
 * so they sum exactly to the headline gap. `bridgeCloses()` in the domain is the assertion of that
 * property; this module only draws it. Ported from `renderBridge` (original line 1332).
 */
import { buildBridge } from '../../../domain/reconciliation.js';
import { formatUsd, formatUsdParens, formatBpsCompact } from '../../../domain/money.js';
import type { PricingView, RepricingFixture } from '../../../domain/types.js';
import { el, replace, activate } from '../../primitives/dom.js';
import { parity } from '../../parity.js';

/** Labels are renamed per §3.1; the `basis` lines beneath them are frozen parity strings. */
export const PRICING_BRIDGE_LABEL = {
  nav: 'Product NAV · USD',
  derivedBefore: 'Look-through value · USD',
  derivedAfter: 'Repriced look-through value · USD',
} as const;

/** `a` / `b` is unexplained in the original. The caption defines it; this is the same words again. */
export function pricingScenarioTitle(scenario: 'a' | 'b'): string {
  return scenario === 'b' ? 'NAV above look-through value' : 'NAV at or below look-through value';
}

function pricingBridgeCaption(after: boolean): HTMLElement {
  const caption = el('p', {
    class: 'bridge-caption',
    ...parity('pricing.bridge.driver_caption'),
  });
  if (after) {
    caption.append(
      'Per-driver residual = apex NAV − its revised MV = the non-position (cash / fees) component' +
        ' — pricing is reconciled, so this is the only remaining gap (non-trade). Bars sum to the' +
        ' headline residual — click to inspect'
    );
    return caption;
  }
  caption.append(
    'Per-driver gap = top-level feeder NAV − its look-through value — the bars sum to the headline' +
      ' gap (bar scaled to the largest leg; ',
    el('b', { class: 'neg', text: 'red' }),
    ' = NAV above look-through / scenario b, ',
    el('b', { class: 'pos', text: 'green' }),
    ' = below / scenario a) — click to inspect'
  );
  return caption;
}

export function renderPricingBridge(
  host: HTMLElement,
  options: {
    repricing: RepricingFixture;
    view: PricingView;
    selectedCode: string | null;
    onSelect: (code: string) => void;
  }
): void {
  const { repricing, view, selectedCode, onSelect } = options;
  const after = view === 'after';
  const bridge = buildBridge(repricing, view);

  const navEnd = el('div', { class: 'bridge-end' }, [
    el('div', { class: 'bridge-end-label', text: PRICING_BRIDGE_LABEL.nav }),
    el('div', {
      class: 'bridge-end-value',
      ...parity('pricing.bridge.product_nav'),
      text: formatUsd(bridge.productNav),
    }),
    el('div', { class: 'bridge-end-basis', ...parity('pricing.bridge.product_nav_basis') }, [
      "sum of top-level feeder NAVs — the product's own NAV, ",
      el('b', { text: 'not' }),
      ` the sum of all ${bridge.fundCount} funds (${formatUsd(bridge.sumAllFundNav)})`,
    ]),
  ]);

  const arrow = el('div', { class: 'bridge-arrow' }, [
    after ? 'reconciles to' : 'looks through to',
    el('span', {
      class: 'bridge-gap',
      ...parity('pricing.bridge.gap_usd'),
      text: formatUsdParens(bridge.gap),
    }),
    el('span', {
      class: `bridge-bps ${bridge.gap < 0 ? 'neg' : 'pos'}`,
      ...parity('pricing.bridge.gap_bps'),
      text: `${formatBpsCompact(bridge.gapBps)} ${after ? 'non-position' : 'gap'}`,
    }),
  ]);

  const derivedEnd = el('div', { class: 'bridge-end' }, [
    el('div', {
      class: 'bridge-end-label',
      text: after ? PRICING_BRIDGE_LABEL.derivedAfter : PRICING_BRIDGE_LABEL.derivedBefore,
    }),
    el('div', {
      class: 'bridge-end-value',
      ...parity('pricing.bridge.derived_mv'),
      text: formatUsd(bridge.derived),
    }),
    el('div', {
      class: 'bridge-end-basis',
      ...parity('pricing.bridge.derived_mv_basis'),
      text: after
        ? 'underlyings NAV-repriced · pricing reconciled'
        : 'ultimate underlyings rolled up through ownership',
    }),
  ]);

  const rows = bridge.drivers.map((driver) => {
    const width = Math.min(100, (Math.abs(driver.gap) / bridge.maxAbsGap) * 100);
    const row = el('div', {
      class: `bridge-row${driver.code === selectedCode ? ' on' : ''}`,
      'data-c': driver.code,
      title: `${driver.name} · ${driver.code}`,
    });
    row.append(
      el('div', { class: 'bridge-code', text: driver.code }, [
        el('span', {
          class: 'bridge-scenario',
          title: pricingScenarioTitle(driver.scenario),
          ...parity(`pricing.bridge.driver.${driver.code}.scenario`),
          text: driver.scenario,
        }),
      ]),
      el('div', { class: 'bridge-track' }, [
        el('div', {
          class: `bridge-bar ${driver.gap < 0 ? 'neg' : 'pos'}`,
          style: `width:${width.toFixed(2)}%`,
        }),
      ]),
      el(
        'div',
        {
          class: `bridge-amount ${driver.gap < 0 ? 'neg' : 'pos'}`,
          ...parity(`pricing.bridge.driver.${driver.code}.gap_usd`),
        },
        [
          formatUsdParens(driver.gap),
          el('span', {
            class: 'bridge-bps',
            ...parity(`pricing.bridge.driver.${driver.code}.gap_bps`),
            text: formatBpsCompact(driver.bps),
          }),
        ]
      )
    );
    activate(row, () => onSelect(driver.code), {
      role: 'button',
      label: `Inspect ${driver.name}, gap ${formatUsdParens(driver.gap)}`,
    });
    return row;
  });

  replace(
    host,
    el('div', { class: 'bridge-ends' }, [navEnd, arrow, derivedEnd]),
    pricingBridgeCaption(after),
    ...rows
  );
}
