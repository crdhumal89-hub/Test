/**
 * Pricing — the publish screen.
 *
 * Question it answers: what unit price do I publish for each fund today, and what does repricing do
 * to value? The score strip and the bridge are context; the two tables are the deliverable, and
 * they are two views of the same 26 funds rather than two screens (the original hid the walk behind
 * an unlabelled toggle and re-sorted it independently).
 */
import type { Store } from '../../../state/store.js';
import { el, replace, qs, emptyState } from '../../primitives/dom.js';
import { parity } from '../../parity.js';
import { exportSendToPricingCsv, exportPricingCsv } from '../../../export/csv.js';
import { exportPricingWorkbook } from '../../../export/excel.js';
import { renderPricingScore, renderPricingNarrative } from './score-strip.js';
import { renderPricingBridge } from './bridge.js';
import { renderPriceTable } from './price-table.js';
import { renderRepricingWalk } from './repricing-walk.js';
import { renderFundDetail } from './fund-detail.js';

export const PRICING_QUESTION =
  'What unit price do I publish for each fund today, and what does repricing do to value?';

/** The two arrangements of the same rows. Named, not a bare toggle. */
const PRICING_SUBVIEWS = [
  { id: 'table', label: 'Prices to publish', hint: 'One row per fund: the three unit prices and the value they produce' },
  { id: 'walk', label: 'Repricing walk', hint: 'The same funds as an audit trail: before, after, and what changed' },
] as const;

/** Columns that read best ascending on first click; everything else opens largest-first. */
const PRICING_ASCENDING_FIRST = new Set(['code', 'sym', 'name']);

export function mountPricing(host: HTMLElement, store: Store): () => void {
  replace(
    host,
    el('p', { class: 'screen-question', id: 'pricing-question', text: PRICING_QUESTION }),
    el('div', { class: 'toolbar', id: 'pricing-tools' }),
    el('div', { class: 'score-strip', id: 'pricing-score' }),
    el('p', { class: 'narrative', id: 'pricing-banner', ...parity('pricing.banner.narrative') }),
    el('div', { class: 'bridge', id: 'pricing-bridge' }),
    el('p', { class: 'screen-help', id: 'pricing-help' }),
    el('div', { class: 'table-scroll', id: 'pricing-price-table' }),
    el('div', { class: 'table-scroll', id: 'pricing-walk-table', hidden: 'hidden' }),
    el('aside', {
      class: 'drawer',
      id: 'pricing-detail',
      role: 'dialog',
      'aria-label': 'Pricing derivation for the selected fund',
      'aria-hidden': 'true',
      hidden: 'hidden',
    })
  );

  let releaseDrawer: (() => void) | null = null;

  function renderTools(): void {
    const tools = qs('#pricing-tools', host);
    const toggle = el('div', {
      class: 'subview-toggle',
      id: 'pricing-subview',
      role: 'group',
      'aria-label': 'How to arrange the funds',
    });
    for (const subview of PRICING_SUBVIEWS) {
      const on = store.state.pricingSubview === subview.id;
      const button = el('button', {
        type: 'button',
        class: `seg${on ? ' on' : ''}`,
        'data-subview': subview.id,
        'data-parity-scene': `step:rfxView:${subview.id === 'walk' ? 'walk' : 'table'}`,
        'aria-pressed': on ? 'true' : 'false',
        title: subview.hint,
        text: subview.label,
      });
      button.addEventListener('click', () => store.set({ pricingSubview: subview.id }));
      toggle.append(button);
    }

    const filter = el('input', {
      type: 'search',
      class: 'combo-input',
      id: 'pricing-filter',
      value: store.state.pricingFilter,
      placeholder: 'Filter by fund code, VPM symbol or name',
      'aria-label': 'Filter the funds by code, VPM symbol or name',
    });
    filter.addEventListener('input', () => store.set({ pricingFilter: filter.value }));

    const sendToPricing = el('button', {
      type: 'button',
      class: 'btn',
      id: 'export-pricing',
      title: 'Symbol, quantity, local price and local market value — the send-to-pricing file',
      text: 'Export pricing',
    });
    sendToPricing.addEventListener('click', () =>
      exportSendToPricingCsv(store.repricing, store.state.asof)
    );
    const csv = el('button', { type: 'button', class: 'btn', id: 'export-pricing-csv', text: 'CSV' });
    csv.addEventListener('click', () => exportPricingCsv(store.repricing, store.state.asof));
    const excel = el('button', {
      type: 'button',
      class: 'btn',
      id: 'download-pricing-excel',
      text: 'Download Excel',
    });
    excel.addEventListener('click', () => {
      // Surface a failed library load rather than swallowing it.
      void exportPricingWorkbook(store.repricing, store.state.view, store.state.asof).catch(
        (error: unknown) => {
          qs('#pricing-tools', host).append(
            el('span', {
              class: 'export-error',
              role: 'alert',
              text: `Excel export failed: ${error instanceof Error ? error.message : String(error)}`,
            })
          );
        }
      );
    });

    replace(
      tools,
      toggle,
      el('label', { class: 'combo', for: 'pricing-filter' }, [filter]),
      sendToPricing,
      csv,
      excel,
      el('span', { class: 'status-line', id: 'pricing-status' }, [
        'Publishing for ',
        el('b', { ...parity('pricing.active_product_code'), text: store.repricing.productCode }),
        ` · ${store.repricing.funds.length} funds · as of ${store.state.asof}`,
      ])
    );
  }

  function renderHelp(): void {
    replace(
      qs('#pricing-help', host),
      'Read across one fund: its ',
      el('b', { text: 'price to publish' }),
      ' is its own NAV divided by its units outstanding; its ',
      el('b', { text: 'look-through value' }),
      ' is what its underlyings are worth at today’s marks; its ',
      el('b', { text: 'repriced value' }),
      ' is those same underlyings valued from their own NAVs, deepest level first. The difference between the last two is the ',
      el('b', { text: 'repricing gain or loss' }),
      '. ',
      el('b', { text: 'bps' }),
      ' (basis points) is that difference divided by the fund’s own NAV, times 10,000 — so 50 bps is half a percent. ',
      el('b', { text: 'Δ' }),
      ' means change. Select any row, or any bar in the bridge, for the full derivation.'
    );
  }

  function syncSubview(): void {
    const walk = store.state.pricingSubview === 'walk';
    qs('#pricing-price-table', host).hidden = walk;
    qs('#pricing-walk-table', host).hidden = !walk;
    for (const button of Array.from(
      qs('#pricing-subview', host).querySelectorAll<HTMLButtonElement>('button')
    )) {
      const on = button.dataset.subview === store.state.pricingSubview;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function select(code: string): void {
    store.set({ selectedFundCode: code });
  }

  function clearFilter(): void {
    store.set({ pricingFilter: '' });
    const input = host.querySelector<HTMLInputElement>('#pricing-filter');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  /**
   * Re-sorting rebuilds the table, which destroys the header the keystroke came from. Put the
   * caret back on the same column so a keyboard user can reverse the order without re-tabbing.
   */
  function refocusHeader(tableId: string, column: string): void {
    const th = host.querySelector<HTMLElement>(`#${tableId} thead th[data-col="${column}"]`);
    th?.focus();
  }

  function nextDirection(current: { column: string; direction: 1 | -1 }, column: string): 1 | -1 {
    if (current.column === column) return (current.direction * -1) as 1 | -1;
    return PRICING_ASCENDING_FIRST.has(column) ? 1 : -1;
  }

  function sortTable(column: string): void {
    store.set({ pricingSort: { column, direction: nextDirection(store.state.pricingSort, column) } });
    refocusHeader('pricing-price-table', column);
  }

  function sortWalk(column: string): void {
    store.set({ walkSort: { column, direction: nextDirection(store.state.walkSort, column) } });
    refocusHeader('pricing-walk-table', column);
  }

  function renderTables(): void {
    const { view, pricingSort, pricingFilter, walkSort, selectedFundCode, asof } = store.state;
    renderPriceTable(
      qs('#pricing-price-table', host),
      { repricing: store.repricing, view, sort: pricingSort, filter: pricingFilter, selectedCode: selectedFundCode, asof },
      { onSort: sortTable, onSelect: select, onClearFilter: clearFilter }
    );
    renderRepricingWalk(
      qs('#pricing-walk-table', host),
      { repricing: store.repricing, sort: walkSort, filter: pricingFilter, selectedCode: selectedFundCode, asof },
      { onSort: sortWalk, onSelect: select, onClearFilter: clearFilter }
    );
  }

  function renderDrawer(): void {
    const drawer = qs('#pricing-detail', host);
    releaseDrawer?.();
    releaseDrawer = null;

    const code = store.state.selectedFundCode;
    if (code == null) {
      drawer.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
      replace(drawer);
      return;
    }
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    const fund = store.repricing.funds.find((f) => f.code === code);
    if (!fund) {
      replace(
        drawer,
        emptyState(`${code} is not one of this product’s funds.`, {
          label: 'Close',
          onAct: () => store.set({ selectedFundCode: null }),
        })
      );
      return;
    }
    releaseDrawer = renderFundDetail(drawer, {
      fund,
      repricing: store.repricing,
      view: store.state.view,
      asof: store.state.asof,
      onClose: () => store.set({ selectedFundCode: null }),
      onSelect: select,
    });
  }

  function renderAll(): void {
    renderPricingScore(qs('#pricing-score', host), store.repricing, store.state.view);
    renderPricingNarrative(qs('#pricing-banner', host), store.repricing);
    renderPricingBridge(qs('#pricing-bridge', host), {
      repricing: store.repricing,
      view: store.state.view,
      selectedCode: store.state.selectedFundCode,
      onSelect: select,
    });
    renderTables();
  }

  renderTools();
  renderHelp();
  renderAll();
  syncSubview();
  renderDrawer();

  const unsubscribe = store.subscribe((_state, changed) => {
    if (changed.has('product')) {
      renderTools();
      renderAll();
      syncSubview();
      renderDrawer();
      return;
    }
    if (changed.has('view')) {
      renderAll();
      renderDrawer();
      return;
    }
    if (changed.has('selectedFundCode')) {
      renderAll();
      renderDrawer();
      return;
    }
    if (changed.has('pricingSubview')) {
      syncSubview();
      return;
    }
    if (changed.has('pricingFilter') || changed.has('pricingSort') || changed.has('walkSort')) {
      renderTables();
    }
  });

  return () => {
    releaseDrawer?.();
    releaseDrawer = null;
    unsubscribe();
  };
}
