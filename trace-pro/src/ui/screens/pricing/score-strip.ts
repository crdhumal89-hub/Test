/**
 * The five-tile score strip, and the narrative banner that says out loud what bottom-up repricing
 * does. Same additive statement as the Reconciliation waterfall, compressed to one line of tiles,
 * because on this screen it is context for the publish prices rather than the answer itself.
 *
 * Ported from `renderScore` (original line 1316). Every figure comes from the domain; this module
 * only formats and lays out.
 */
import { countFlagged } from '../../../domain/exceptions.js';
import { formatUsd, formatUsdParens, formatBpsOf } from '../../../domain/money.js';
import type { PricingView, RepricingFixture, RepricingFund } from '../../../domain/types.js';
import { el, replace } from '../../primitives/dom.js';
import { parity } from '../../parity.js';

/** New vocabulary for the strip, per docs/redesign-spec.md §3.1. The units ride on the labels. */
export const PRICING_SCORE_LABEL = {
  derivedBefore: 'Look-through value · USD',
  derivedAfter: 'Look-through value at repriced marks · USD',
  pricing: '+ Pricing difference · USD',
  revised: '= Repriced value · USD',
  nonPosition: '+ Non-position difference · USD',
  nav: '= NAV · USD',
} as const;

function pricingTile(
  label: string,
  value: string,
  valueKey: string,
  detail: string,
  detailKey: string | null,
  tone = ''
): HTMLElement {
  return el('div', { class: 'score-tile' }, [
    el('div', { class: 'score-label', text: label }),
    el('div', { class: `score-value ${tone}`.trim(), ...parity(valueKey), text: value }),
    el('div', { class: 'score-detail', ...parity(detailKey), text: detail }),
  ]);
}

export function renderPricingScore(
  host: HTMLElement,
  repricing: RepricingFixture,
  view: PricingView
): void {
  const after = view === 'after';
  const flagged = countFlagged(repricing, view);

  replace(
    host,
    pricingTile(
      after ? PRICING_SCORE_LABEL.derivedAfter : PRICING_SCORE_LABEL.derivedBefore,
      formatUsd(after ? repricing.R : repricing.D),
      'pricing.score.derived_mv',
      after ? 'every component at revised price' : 'look-through · current marks',
      'pricing.score.derived_basis'
    ),
    pricingTile(
      PRICING_SCORE_LABEL.pricing,
      after ? '$0' : formatUsdParens(repricing.dPricing),
      'pricing.score.delta_pricing_usd',
      after
        ? 'reconciled · no pricing break'
        : `bottom-up repricing P&L · ${formatBpsOf(repricing.dPricing, repricing.N)}`,
      'pricing.score.delta_pricing_detail',
      after || repricing.dPricing >= 0 ? 'pos' : 'neg'
    ),
    pricingTile(
      PRICING_SCORE_LABEL.revised,
      formatUsd(repricing.R),
      'pricing.score.revised_mv',
      'NAV-repriced bottom-up',
      null
    ),
    pricingTile(
      PRICING_SCORE_LABEL.nonPosition,
      formatUsdParens(repricing.dNonPos),
      'pricing.score.delta_nonposition_usd',
      `cash/fees/receivables · ${formatBpsOf(repricing.dNonPos, repricing.N)}`,
      'pricing.score.delta_nonposition_detail',
      repricing.dNonPos < 0 ? 'neg' : 'pos'
    ),
    pricingTile(
      PRICING_SCORE_LABEL.nav,
      formatUsd(repricing.N),
      'pricing.score.nav',
      `sum of top-level feeder NAVs · ${flagged} flagged`,
      'pricing.score.nav_detail'
    )
  );
}

/**
 * The fund whose own level carries the largest repricing gain or loss, among funds that both
 * report a NAV and hold something. Ties keep source order, which is what the original did and is
 * why SPORT rather than SPORTHLD is named for the same $336,038.
 */
export function pricingLargestTier(repricing: RepricingFixture): RepricingFund | null {
  const candidates = repricing.funds.filter((f) => f.hasNav && f.holdings.length > 0);
  const sorted = candidates.slice().sort((a, b) => Math.abs(b.pnlLevel) - Math.abs(a.pnlLevel));
  return sorted[0] ?? null;
}

/**
 * The banner. It states the rule, then the three figures the rule produces, then names the fund
 * doing most of the work — so the table below is read with an expectation rather than scanned.
 */
export function renderPricingNarrative(host: HTMLElement, repricing: RepricingFixture): void {
  const big = pricingLargestTier(repricing);
  const nodes: (Node | string)[] = [
    el('span', { class: 'narrative-tag', text: 'Bottom-up repricing' }),
    " Reprice the deepest funds first — a lowest-level fund's repriced unit price = ",
    el('b', { text: 'NAV ÷ units' }),
    "; a holder's repriced value = Σ held-qty × child repriced price + its direct securities," +
      ' propagated to the product. That lifts ',
    el('b', { text: `the look-through value ${formatUsd(repricing.D)}` }),
    ' to ',
    el('b', { text: `the repriced value ${formatUsd(repricing.R)}` }),
    ' (repricing gain or loss ',
    el('b', { text: formatUsdParens(repricing.dPricing) }),
    '), then non-position items bridge to ',
    el('b', { text: `NAV ${formatUsd(repricing.N)}` }),
    '.',
  ];
  if (big) {
    nodes.push(
      ' Largest repricing tier: ',
      el('b', { text: big.code }),
      ` (${formatUsdParens(big.pnlLevel)} across its ${big.holdings.length} holdings).` +
        ' Click any fund for its per-holding gain or loss.'
    );
  }
  replace(host, ...nodes);
}
