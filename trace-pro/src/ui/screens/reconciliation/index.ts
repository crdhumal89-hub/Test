/**
 * Reconciliation — the landing screen.
 *
 * Question it answers: does my NAV agree with what I hold, and where is the difference?
 * The waterfall carrying that answer is above the fold on load, with no click required (R5).
 */
import { groupExceptions, EXCEPTION_TIPS } from '../../../domain/exceptions.js';
import { allNodeIds, defaultExpansion, expansionRevealing } from '../../../domain/lookthrough.js';
import type { Store } from '../../../state/store.js';
import { el, replace, qs, activate, emptyState } from '../../primitives/dom.js';
import { renderWaterfall, reconciliationStatusLine } from './waterfall.js';
import { renderTree } from './tree.js';
import { renderNodeDetail } from './detail.js';

export const RECONCILIATION_QUESTION =
  'Does this product’s NAV agree with the value of what it holds, and where is the difference?';

export function mountReconciliation(host: HTMLElement, store: Store): () => void {
  replace(
    host,
    el('p', { class: 'screen-question', id: 'reconciliation-question', text: RECONCILIATION_QUESTION }),
    el('div', { class: 'toolbar', id: 'reconciliation-tools' }),
    el('div', { class: 'waterfall', id: 'reconciliation-waterfall' }),
    el('div', { class: 'exceptions', id: 'reconciliation-exceptions' }),
    el('p', { class: 'screen-help', id: 'reconciliation-help' }),
    el('div', { class: 'table-scroll', id: 'reconciliation-tree' }),
    el('aside', {
      class: 'drawer',
      id: 'reconciliation-detail',
      role: 'dialog',
      'aria-label': 'Look-through breakdown',
      'aria-hidden': 'true',
      hidden: 'hidden',
    })
  );

  const symbolOf = (code: string): string => {
    const fund = store.repricing.funds.find((f) => f.code === code);
    return fund?.sym ?? code;
  };

  function renderTools(): void {
    const tools = qs('#reconciliation-tools', host);
    const expandAll = el('button', { type: 'button', class: 'btn', id: 'expand-all', text: 'Expand all' });
    expandAll.addEventListener('click', () =>
      store.set({ expandedNodes: allNodeIds(store.core.lookthrough.nodes) })
    );
    const collapse = el('button', { type: 'button', class: 'btn', id: 'collapse', text: 'Collapse' });
    collapse.addEventListener('click', () =>
      store.set({ expandedNodes: defaultExpansion(store.core.lookthrough.nodes) })
    );
    replace(
      tools,
      expandAll,
      collapse,
      el('span', { class: 'status-line', id: 'reconciliation-status', text: reconciliationStatusLine(store.repricing) })
    );
  }

  function renderHelp(): void {
    const help = qs('#reconciliation-help', host);
    replace(
      help,
      document.createTextNode('Read it as one addition: '),
      el('b', { text: 'look-through value' }),
      document.createTextNode(' (what the underlyings are worth at today’s marks) + '),
      el('b', { text: 'pricing difference' }),
      document.createTextNode(' (what changes when each fund is repriced from its own NAV, deepest first) = '),
      el('b', { text: 'repriced value' }),
      document.createTextNode(', then + '),
      el('b', { text: 'non-position difference' }),
      document.createTextNode(
        ' (cash, fees and receivables that sit in NAV but are not held as positions) = '
      ),
      el('b', { text: 'NAV' }),
      document.createTextNode(
        '. Every difference also shows basis points — the difference divided by NAV, times 10,000. Select any row for its full breakdown.'
      )
    );
  }

  function renderExceptions(): void {
    const strip = qs('#reconciliation-exceptions', host);
    const categories = groupExceptions(store.repricing, store.state.view);
    if (!categories.length) {
      replace(
        strip,
        el('span', { class: 'chip chip-ok' }, [
          el('span', { class: 'chip-count', text: '✓' }),
          el('span', { text: 'Every fund reconciles within tolerance' }),
        ])
      );
      return;
    }
    replace(strip);
    for (const category of categories) {
      const chip = el('span', {
        class: `chip chip-${category.severity}`,
        'data-exception': category.title,
        title: EXCEPTION_TIPS[category.title] ?? category.title,
      });
      chip.append(
        el('span', { class: 'chip-count', text: String(category.codes.length) }),
        el('span', { class: 'chip-label', text: category.title })
      );
      const first = category.codes[0];
      if (first) {
        activate(
          chip,
          () => {
            const { expanded, node } = expansionRevealing(
              store.core.lookthrough.nodes,
              first,
              store.state.expandedNodes
            );
            if (!node) return;
            store.set({ expandedNodes: expanded, selectedNodeId: node.id });
            const row = host.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
            row?.scrollIntoView({ block: 'center' });
          },
          { role: 'button', label: `Jump to the first fund flagged ${category.title}` }
        );
      }
      strip.append(chip);
    }
  }

  function renderDetail(): void {
    const drawer = qs('#reconciliation-detail', host);
    const id = store.state.selectedNodeId;
    if (id == null) {
      drawer.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
      return;
    }
    const node = store.core.lookthrough.nodes.find((n) => n.id === id);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    if (!node) {
      replace(drawer, emptyState('That row is no longer in the hierarchy.', {
        label: 'Close',
        onAct: () => store.set({ selectedNodeId: null }),
      }));
      return;
    }
    renderNodeDetail(drawer, {
      node,
      repricing: store.repricing,
      view: store.state.view,
      asof: store.state.asof,
      symbolOf,
      onClose: () => store.set({ selectedNodeId: null }),
    });
  }

  function renderAll(): void {
    renderWaterfall(qs('#reconciliation-waterfall', host), store.repricing, store.state.view, store.state.asof);
    renderExceptions();
    renderTree(
      qs('#reconciliation-tree', host),
      {
        nodes: store.core.lookthrough.nodes,
        repricing: store.repricing,
        view: store.state.view,
        expanded: store.state.expandedNodes,
        selectedId: store.state.selectedNodeId,
        symbolOf,
        asof: store.state.asof,
      },
      {
        onToggle: (nodeId) => {
          const next = new Set(store.state.expandedNodes);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          store.set({ expandedNodes: next });
        },
        onSelect: (nodeId) => store.set({ selectedNodeId: nodeId }),
      }
    );
    renderDetail();
  }

  renderTools();
  renderHelp();
  renderAll();

  return store.subscribe((_state, changed) => {
    if (changed.has('view') || changed.has('product')) {
      renderTools();
      renderAll();
      return;
    }
    if (changed.has('expandedNodes') || changed.has('selectedNodeId')) renderAll();
  });
}
