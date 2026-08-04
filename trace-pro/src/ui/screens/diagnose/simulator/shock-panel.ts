/**
 * Simulator shock panel — the MV / Units / NAV inputs and Run.
 *
 * Ported from `simRenderInspector` / `simPreview` / `simReadNum` / `simRun` (original 1832-1885).
 * The arithmetic is entirely `domain/cascade`: `pendingShock` says what the three inputs amount to
 * and `shockCascade` propagates it. Nothing here computes a figure.
 *
 * The original's three inputs were the only way in and its holder/holding rows were `td`s with
 * `.onclick`. Here every row is a real button, so the whole panel is keyboard-operable.
 */
import { pendingShock, shockCascade, type CascadeIndex, type CascadeResult, type PendingShock } from '../../../../domain/cascade.js';
import { TRUNCATE } from '../../../../domain/exceptions.js';
import { formatCount, formatPercent, formatPrice, formatUsdCents, formatUsdCentsParens } from '../../../../domain/money.js';
import type { SimFund, SimulatorFixture } from '../../../../domain/types.js';
import { el, replace } from '../../../primitives/dom.js';
import { simulatorCompactUsd } from './ledger.js';

const SIMULATOR_FIELDS = [
  { key: 'mv' as const, label: 'Market value', hint: 'a move in MV flows through to NAV' },
  { key: 'qty' as const, label: 'Units outstanding', hint: 'firm-wide units (was global qty)' },
  { key: 'nav' as const, label: 'NAV', hint: 'total value of the whole entity' },
];

export interface SimulatorShockPanelContext {
  fixture: SimulatorFixture;
  index: CascadeIndex;
  selected: string | null;
  onRun(result: CascadeResult, field: string): void;
  onClear(): void;
  onSelect(code: string): void;
}

/** Read a number back out of one of the three inputs. Commas, $ and spaces are ignored. */
function simulatorReadNumber(input: HTMLInputElement | undefined): number | null {
  if (!input) return null;
  const cleaned = input.value.replace(/[,$\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number.parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}

/** Accounting entry format: grouped, two decimals, no symbol — what the input reads back. */
function simulatorInputText(x: number | null): string {
  return x == null || !isFinite(x) ? '' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function simulatorStat(label: string, value: string): HTMLElement {
  return el('div', { class: 'kv-row' }, [el('dt', { text: label }), el('dd', { class: 'mono', text: value })]);
}

/** A holder / holding row: a real button, so the panel can be walked with the keyboard. */
function simulatorLinkRow(code: string, cells: string[], onSelect: (code: string) => void, label: string): HTMLElement {
  const row = el('tr');
  const first = el('td', { class: 'l' });
  const button = el('button', { type: 'button', class: 'btn btn-inline', text: code, 'aria-label': label });
  button.addEventListener('click', () => onSelect(code));
  first.append(button);
  row.append(first, ...cells.map((c) => el('td', { class: 'mono', text: c })));
  return row;
}

function simulatorTable(head: string[], rows: HTMLElement[]): HTMLElement {
  return el('table', { class: 'mini' }, [
    el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i === 0 ? 'l' : '', text: h })))]),
    el('tbody', {}, rows),
  ]);
}

/** Render the panel for the selected fund, or the empty state when nothing is selected. */
export function simulatorRenderShockPanel(host: HTMLElement, context: SimulatorShockPanelContext): void {
  const { fixture, selected } = context;
  const fund: SimFund | undefined = selected ? fixture.funds[selected] : undefined;
  if (!fund || !selected) {
    replace(
      host,
      el('h4', { text: 'Shock panel' }),
      el('p', { class: 'note', text:
        'Pick any fund in the graph — or from the entity list below it — to see its NAV, units outstanding, unit price, holders and holdings, then move its market value, units or NAV and press Run to watch the P&L climb to product NAV.' })
    );
    return;
  }

  const inputs = new Map<'mv' | 'qty' | 'nav', HTMLInputElement>();
  const edited: { mv?: boolean; qty?: boolean; nav?: boolean } = {};
  const preview = el('p', { class: 'note mono', id: 'simulator-preview' });

  const readPending = (): PendingShock | null =>
    pendingShock(fund, edited, {
      mv: simulatorReadNumber(inputs.get('mv')),
      qty: simulatorReadNumber(inputs.get('qty')),
      nav: simulatorReadNumber(inputs.get('nav')),
    });

  const renderPreview = (): void => {
    const pending = readPending();
    if (!pending) return;
    const deltaValue = pending.value - pending.navBase;
    const deltaPrice = pending.priceAfter - pending.priceBefore;
    const estimate = (fund.eff ?? 0) * deltaValue;
    replace(
      preview,
      document.createTextNode(`New unit price ${formatPrice(pending.priceAfter)} (${deltaPrice >= 0 ? '+' : ''}${formatPrice(deltaPrice)}), new value ${formatUsdCents(pending.value)}. `),
      document.createTextNode(`Δ value at ${selected} ${formatUsdCentsParens(deltaValue)} → estimated product impact ≈ effective share ${formatPercent(fund.eff ?? 0)} × Δ = `),
      el('b', { class: estimate >= 0 ? 'pos' : 'neg', text: formatUsdCentsParens(estimate) }),
      document.createTextNode('. Run computes it exactly, holder by holder.')
    );
  };

  const editors = SIMULATOR_FIELDS.map((field) => {
    const input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'shock-input',
      id: `simulator-shock-${field.key}`,
      autocomplete: 'off',
    });
    input.value =
      field.key === 'mv' ? simulatorInputText(fund.gmv) : field.key === 'qty' ? simulatorInputText(fund.gq) : simulatorInputText(fund.nav);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      edited[field.key] = true;
      renderPreview();
    });
    input.addEventListener('blur', () => {
      const value = simulatorReadNumber(input);
      if (value != null) input.value = simulatorInputText(value);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.blur();
      run();
    });
    inputs.set(field.key, input);
    return el('div', { class: 'shock-field' }, [
      el('label', { class: 'shock-label', for: input.id }, [field.label, el('span', { class: 'note', text: field.hint })]),
      input,
    ]);
  });

  function run(): void {
    const pending = readPending();
    if (!pending || !selected) return;
    const result = shockCascade(context.index, selected, pending.value, pending.units, fixture.apex);
    context.onRun(result, pending.field ?? 'value');
  }

  const runButton = el('button', { type: 'button', class: 'btn btn-primary', id: 'simulator-run', text: '▶ Run cascade' });
  runButton.addEventListener('click', run);
  const clearButton = el('button', { type: 'button', class: 'btn', text: 'Reset' });
  clearButton.addEventListener('click', () => context.onClear());

  const holderRows = (fund.holders ?? []).map((h) =>
    simulatorLinkRow(
      h.h,
      [fixture.funds[h.h]?.sym ?? '', formatPercent(h.ownpct), formatCount(h.units)],
      context.onSelect,
      `Inspect ${h.h}, which holds ${formatPercent(h.ownpct)} of ${selected}`
    )
  );
  const holdingRows = (fund.holdings ?? []).map((h) =>
    simulatorLinkRow(
      h.i,
      [simulatorCompactUsd(h.nav), formatPercent(h.ownpct), simulatorCompactUsd((h.ownpct || 0) * (fixture.funds[h.i]?.ltv ?? 0))],
      context.onSelect,
      `Inspect ${h.i}, of which ${selected} holds ${formatPercent(h.ownpct)}`
    )
  );
  const leafRows = (fund.leaves ?? []).slice(0, TRUNCATE.simLeaves).map((l) =>
    el('tr', {}, [
      el('td', { class: 'l' }, [l.sec.slice(0, 24), el('div', { class: 'note', text: (l.name ?? '').slice(0, 40) })]),
      el('td', { class: 'mono', text: simulatorCompactUsd(l.mv) }),
    ])
  );

  replace(
    host,
    el('h4', {}, [el('span', { class: 'drawer-symbol', text: fund.sym || fund.code }), el('span', { class: 'tag', text: fund.kind })]),
    el('p', { class: 'drawer-sub', text: `${fund.name} · ${fund.code}` }),
    el('dl', { class: 'kv' }, [
      simulatorStat('NAV (value)', fund.nav == null ? 'No NAV reported' : formatUsdCents(fund.nav)),
      simulatorStat('Units outstanding (firm-wide)', formatCount(fund.gq)),
      simulatorStat('Price per unit', formatPrice(fund.price)),
      simulatorStat('Book value of the stake (as booked)', formatUsdCents(fund.gmv)),
      simulatorStat('Effective share (of the product)', formatPercent(fund.eff ?? 0)),
      simulatorStat('Look-through value', formatUsdCents(fund.ltv)),
    ]),
    el('h4', { text: 'Shock this fund' }),
    el('div', { class: 'shock-editor' }, editors),
    preview,
    el('div', { class: 'toolbar' }, [runButton, clearButton]),
    el('h4', { text: `Holders · who owns ${fund.code}` }),
    holderRows.length
      ? simulatorTable(['Holder', 'VPM symbol', 'Direct share', 'Units held'], holderRows)
      : el('p', { class: 'note', text: 'Held by nothing inside the product — this is a top-level feeder.' }),
    el('h4', { text: `Holdings · what ${fund.code} owns` }),
    holdingRows.length
      ? simulatorTable(['Fund', 'NAV', 'Direct share', 'Attributed value'], holdingRows)
      : el('p', { class: 'note', text: 'No fund-level holdings — everything below this node is a security.' }),
    leafRows.length
      ? el('div', {}, [
          el('h4', { text: `Ultimate securities · top ${Math.min(8, fund.nLeaves)} of ${fund.nLeaves}` }),
          simulatorTable(['Security', 'Market value'], leafRows),
        ])
      : el('span')
  );
  renderPreview();
}

/**
 * Every entity in the structure, by level, as real buttons.
 *
 * A keyboard-only route to selecting a fund and, just as importantly, a TEXT LISTING of the
 * structure the graph draws — the graph is never the only way to reach a node.
 */
export function simulatorRenderEntityList(
  host: HTMLElement,
  fixture: SimulatorFixture,
  onSelect: (code: string) => void
): void {
  const levels = [...new Set(fixture.treeNodes.map((n) => n.level))].sort((a, b) => a - b);
  const groups = levels.map((level) => {
    const list = el('ul', { class: 'entity-level', 'aria-label': `Level ${level}` });
    for (const node of fixture.treeNodes.filter((n) => n.level === level)) {
      const fund = fixture.funds[node.id];
      const button = el('button', {
        type: 'button',
        class: 'btn btn-inline',
        'data-code': node.id,
        text: node.id,
        title: fund ? `${fund.name} · ${fund.kind}` : fixture.product,
      });
      button.addEventListener('click', () => onSelect(node.id));
      list.append(el('li', {}, [button]));
    }
    return el('div', { class: 'entity-group' }, [el('h5', { text: `Level ${level}` }), list]);
  });
  replace(
    host,
    el('h4', { text: 'Every entity in the structure, by level' }),
    el('p', { class: 'note', text:
      `The same ${fixture.treeNodes.length} nodes as the graph, as buttons: a keyboard-only route to selecting a fund, and a text listing of the structure the graph draws.` }),
    ...groups
  );
}
