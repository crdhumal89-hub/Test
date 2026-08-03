/**
 * Simulator ledgers.
 *
 * Two of them, answering two different questions:
 *
 *   the CASCADE ledger  — one shock climbed the ownership chain: who booked what, via which share.
 *   the REPRICE ledger  — the whole book repriced bottom-up: the five rows that must tie, to the
 *                         cent, to the Reconciliation waterfall. That identity is the point of the
 *                         lens, so the reprice ledger is rendered at rest as well as after a sweep;
 *                         a controller should not have to press a button to see the answer.
 *
 * Ported from `simRenderLedger` / `simFRRenderLedger` / `simRenderBreaks` (original 1793-1996).
 * Every figure comes from `domain/reconciliation.repriceLedger` or `domain/cascade`; nothing here
 * re-derives arithmetic.
 */
import type { Booking, CascadeResult } from '../../../../domain/cascade.js';
import { repriceLedger } from '../../../../domain/reconciliation.js';
import { formatUsdCents, formatUsdCentsParens, formatCount, formatPercent, formatPrice } from '../../../../domain/money.js';
import type { RepricingFixture, SimulatorFixture } from '../../../../domain/types.js';
import { el, replace } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';

const EN = 'en-US';

function simulatorGrouped(n: number, digits: number): string {
  return Number(n).toLocaleString(EN, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Was the Simulator's own `Uc`. The stage carries compact money at TWO decimals — `$1.59m`, not
 * `$1.6m` — which is a different precision from the Reconciliation screen's compact format, so it
 * is a different function rather than a shared one bent to two purposes.
 */
export function simulatorCompactUsd(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${simulatorGrouped(a / 1e9, 2)}bn`;
  if (a >= 1e6) return `${sign}$${simulatorGrouped(a / 1e6, 2)}m`;
  return `${sign}$${simulatorGrouped(a, 2)}`;
}

/** Was the Simulator's own `Ucv`: the same, with negatives in parentheses. */
export function simulatorCompactUsdParens(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return '—';
  const core = simulatorCompactUsd(Math.abs(x));
  return x < 0 ? `(${core})` : core;
}

/* ------------------------------------------------------------------ the reprice ledger */

/**
 * The five rows of the whole-book reprice, to the cent, each with its own parity key so the tie to
 * the Reconciliation waterfall is machine-checked rather than asserted.
 *
 * Two deliberate choices. First, the row labels are the ones the original used; the renamed
 * vocabulary of spec §3.1 is carried by the tie note beside the tray and by each row's tooltip, so
 * the figure and its frozen key stay welded together. Second, this ledger renders AT REST as well
 * as after a sweep — the identity is true of the book whether or not anyone pressed a button, and a
 * controller should not have to run an animation to read the answer.
 */
export function simulatorRenderRepriceLedger(host: HTMLElement, repricing: RepricingFixture): void {
  const ledger = repriceLedger(repricing);
  const row = (label: string, value: string, key: string, extra: string, tip: string): HTMLElement =>
    el('div', { class: `prow ${extra}`.trim() }, [
      el('span', { class: 'lab', title: tip, text: label }),
      el('span', { class: 'num mono', ...parity(key), text: value }),
    ]);

  replace(
    host,
    row('Derived look-through · before', formatUsdCents(ledger.derivedBefore), 'simulator.reprice.derived_before', '', 'Look-through value at current marks'),
    document.createTextNode(' '),
    el('div', { class: 'midarrow', text: '↓ bottom-up reprice', 'aria-hidden': 'true' }),
    document.createTextNode(' '),
    row('+ Repricing P&L', formatUsdCentsParens(ledger.repricingPnl), 'simulator.reprice.pnl', ledger.repricingPnl >= 0 ? 'pos' : 'neg', 'Pricing difference — what changes when each fund is repriced from its own NAV'),
    document.createTextNode(' '),
    row('= Revised look-through', formatUsdCents(ledger.revised), 'simulator.reprice.revised', 'big', 'Repriced value (NAV, bottom-up)'),
    document.createTextNode(' '),
    row('+ Non-position (cash / fees)', formatUsdCentsParens(ledger.nonPosition), 'simulator.reprice.nonposition', '', 'Non-position difference — cash, fees and receivables in NAV but not held as positions'),
    document.createTextNode(' '),
    row('= Product NAV', formatUsdCents(ledger.productNav), 'simulator.reprice.product_nav', '', 'Σ top-level feeder ENDING_NAV, from the NAV report'),
    document.createTextNode(' '),
    el('p', { class: 'shockline', ...parity('simulator.reprice.shockline') }, [
      'Whole-book reprice · deepest level first → product. Pricing gap ',
      el('b', { text: 'reconciled' }),
      ` (Δ pricing ${simulatorCompactUsdParens(ledger.repricingPnl)}); the residual ${simulatorCompactUsdParens(ledger.nonPosition)} is `,
      el('b', { text: 'non-position' }),
      ' (cash / fees — non-trade), ',
      el('b', { text: 'not' }),
      ' a pricing break. Product NAV holds at ',
      el('b', { text: formatUsdCents(ledger.productNav) }),
      '.',
    ])
  );
}

/* ------------------------------------------------------------------ the cascade ledger */

/** One row of the cascade ledger: a holder and the P&L it booked from the shock below it. */
export interface SimulatorCascadeRow {
  code: string;
  layer: number;
  delta: number;
  share: string;
}

/** Pure: turn a cascade result into its ledger rows, children before parents. Was inside `simRenderLedger`. */
export function simulatorCascadeRows(result: CascadeResult): SimulatorCascadeRow[] {
  const shareOf = (code: string): string => {
    const into: Booking[] = result.bookings.filter((b) => b.parent === code);
    if (!into.length) return '';
    const first = into[0];
    return into.length === 1 && first ? formatPercent(first.ownpct) : 'blended';
  };
  return [...result.affected]
    .filter((code) => code !== result.shocked)
    .map((code) => ({
      code,
      layer: result.layer[code] ?? 0,
      delta: result.valueDelta[code] ?? 0,
      share: shareOf(code),
    }))
    .sort((a, b) => a.layer - b.layer || Math.abs(b.delta) - Math.abs(a.delta));
}

export function simulatorRenderCascadeLedger(
  host: HTMLElement,
  fixture: SimulatorFixture,
  result: CascadeResult | null
): void {
  if (!result) {
    replace(
      host,
      el('h4', { text: 'Cascade ledger' }),
      el('p', { class: 'note', text:
        'Every booking as a shock climbs the ownership chain — who booked what P&L, through which direct share, up to the product. Shock a fund and press Run to populate it.' }),
      el('p', { class: 'state state-empty', text: 'No shock yet.' })
    );
    return;
  }

  const rows = simulatorCascadeRows(result);
  const scale = Math.max(1, ...rows.map((r) => Math.abs(r.delta)), Math.abs(result.productValueDelta));
  const bar = (v: number): HTMLElement =>
    el('div', { class: 'barwrap' }, [
      el('div', {
        class: `b ${v >= 0 ? 'pos' : 'neg'}`,
        'aria-hidden': 'true',
        style: `width:${Math.min(50, (Math.abs(v) / scale) * 50).toFixed(2)}%`,
      }),
    ]);

  const table = el('table', { class: 'mini' });
  const head = el('thead', {}, [
    el('tr', {}, [
      el('th', { class: 'l', text: 'Holder' }),
      el('th', { text: 'Direct share' }),
      el('th', { text: 'P&L' }),
      el('th', { text: 'Δ NAV booked' }),
    ]),
  ]);
  const body = el('tbody');
  const line = (label: string, share: string, delta: number, kind: string): HTMLElement =>
    el('tr', { class: kind, 'data-code': label }, [
      el('td', { class: 'l' }, [el('span', { class: 'tag', text: kind === 'shock' ? 'shock' : `L${result.layer[label] ?? 0}` }), ` ${label}`]),
      el('td', { text: share || '—' }),
      el('td', {}, [bar(delta)]),
      el('td', { class: `mono ${delta >= 0 ? 'pos' : 'neg'}`, text: formatUsdCentsParens(delta) }),
    ]);

  body.append(line(result.shocked, 'origin', result.valueDelta[result.shocked] ?? 0, 'shock'));
  for (const r of rows) {
    body.append(line(r.code, r.share, r.delta, fixture.apex.includes(r.code) ? 'apex' : 'holder'));
  }
  body.append(
    el('tr', { class: 'totals' }, [
      el('td', { class: 'l', text: `▶ ${fixture.productCode} · PRODUCT` }),
      el('td', { text: 'Σ top-level feeders' }),
      el('td', {}, [bar(result.productValueDelta)]),
      el('td', {
        class: `mono ${result.productValueDelta >= 0 ? 'pos' : 'neg'}`,
        text: formatUsdCentsParens(result.productValueDelta),
      }),
    ])
  );
  table.append(head, body);

  replace(
    host,
    el('h4', { text: `${result.shocked} → ${fixture.productCode} · waterfall` }),
    el('p', { class: 'note', text:
      'Each holder books units held × the change in the unit price of what it owns; the direct share is held units ÷ units outstanding. P&L rolls up through every path to the product with no double count.' }),
    el('p', { class: 'note mono', text:
      `Shock ${result.shocked}: ${formatCount(result.unitsBefore)} units, price ${formatPrice(result.priceBefore)} → ${formatPrice(result.priceAfter)}, ${result.affected.size} stages, ${result.bookings.length} bookings.` }),
    table
  );
}

/** The break cards for the current selection. Data-quality facts, stated in plain English. */
export function simulatorRenderBreaks(host: HTMLElement, fixture: SimulatorFixture, selected: string | null, result: CascadeResult | null): void {
  const relevant = fixture.breaks.filter(
    (b) => !selected || b.code === selected || (result?.affected.has(b.code) ?? false)
  );
  const source = selected || result ? relevant : fixture.breaks;
  const cards = source.slice(0, 6).map((b) =>
    el('div', { class: `callout ${b.type === 'no NAV' ? 'callout-warn' : 'callout-bad'}` }, [
      el('p', { class: 'callout-title' }, [el('span', { class: 'tag', text: b.type }), ` ${b.code}`]),
      el('p', { text: b.detail }),
    ])
  );
  if (!cards.length) {
    replace(host, el('p', { class: 'badge badge-ok', text: '✓ No anomalies for the current selection.' }));
    return;
  }
  replace(host, el('h4', { text: 'Exceptions & breaks' }), ...cards);
}
