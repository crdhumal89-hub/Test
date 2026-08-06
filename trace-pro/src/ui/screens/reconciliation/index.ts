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
import { term, termAnnotate, termBindGlossary, termVocabularyLine } from '../../primitives/term.js';
import { parity } from '../../parity.js';
import { exportLookthroughCsv } from '../../../export/csv.js';
import { exportReconciliationWorkbook } from '../../../export/excel.js';
import { renderWaterfall, reconciliationStatusLine } from './waterfall.js';
import { renderTree } from './tree.js';
import { renderNodeDetail } from './detail.js';

export const RECONCILIATION_QUESTION =
  'Does this product’s NAV agree with the value of what it holds, and where is the difference?';

/**
 * The abbreviations this screen renders, in the order a reader meets them, expanded and linked
 * once at the top (rubric R2). `NAV` is inside the screen question and every waterfall label,
 * `SPV` in the "Dangling SPV" chip and the tree's hierarchy column, `VPM` in the symbol column,
 * `bps` beside every difference. The list is short on purpose: a term that is not on the screen
 * does not belong on its vocabulary line.
 */
/*
 * `double_count` is here because four entity names in this product's tree carry a literal "(DC)" —
 * "AP Deuce Intermediate Holdings I (DC), L.P." and three more. They are invisible until the tree is
 * expanded, which is why every other screen listing DC had it and this one did not: the R2 crawl only
 * ever visited the collapsed default. Pricing and Diagnose already disclose the same case.
 */
const RECONCILIATION_VOCABULARY = ['nav', 'spv', 'vpm', 'bps', 'double_count'];

export function mountReconciliation(host: HTMLElement, store: Store): () => void {
  // Every term() on this screen opens the glossary at its own definition through this binding.
  termBindGlossary(store);

  replace(
    host,
    // The question is unchanged text — `docs/first-run.md` quotes it and R1 measures it — with
    // its one abbreviation wrapped rather than expanded, so textContent is byte-identical.
    el('p', { class: 'screen-question', id: 'reconciliation-question' }, termAnnotate(RECONCILIATION_QUESTION)),
    termVocabularyLine(RECONCILIATION_VOCABULARY, 'reconciliation-vocabulary'),
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
    const expandAll = el('button', {
      type: 'button',
      class: 'btn',
      id: 'expand-all',
      'data-parity-scene': 'step:expandAll',
      text: 'Expand all',
    });
    expandAll.addEventListener('click', () =>
      store.set({ expandedNodes: allNodeIds(store.core.lookthrough.nodes) })
    );
    const collapse = el('button', { type: 'button', class: 'btn', id: 'collapse', text: 'Collapse' });
    collapse.addEventListener('click', () =>
      store.set({ expandedNodes: defaultExpansion(store.core.lookthrough.nodes) })
    );
    const csv = el('button', { type: 'button', class: 'btn', id: 'export-csv', text: 'Export CSV' });
    csv.addEventListener('click', () =>
      // The active basis travels with the file: the CSV must say what the tree says (R13).
      exportLookthroughCsv(
        store.core.lookthrough.nodes,
        store.repricing,
        store.state.view,
        store.state.asof
      )
    );
    const excel = el('button', {
      type: 'button',
      class: 'btn',
      id: 'download-excel',
      text: 'Download Excel',
    });
    excel.addEventListener('click', () => {
      // A failed library load must surface, not vanish: the original alerted and gave up.
      void exportReconciliationWorkbook(store.repricing, store.state.view, store.state.asof).catch(
        (error: unknown) => {
          qs('#reconciliation-tools', host).append(
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
      expandAll,
      collapse,
      csv,
      excel,
      // A DECLARED-LABEL parity key: docs/rename-map.json pins this whole sentence, so its `NAV`
      // is annotated in place rather than expanded.
      el(
        'span',
        { class: 'status-line', id: 'reconciliation-status', ...parity('reconciliation.status_line') },
        termAnnotate(reconciliationStatusLine(store.repricing))
      )
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
      ...termAnnotate(' (what changes when each fund is repriced from its own NAV, deepest first) = '),
      el('b', { text: 'repriced value' }),
      document.createTextNode(', then + '),
      el('b', { text: 'non-position difference' }),
      ...termAnnotate(
        ' (cash, fees and receivables that sit in net asset value (NAV) but are not held as positions) = '
      ),
      el('b', {}, [term('NAV', 'nav')]),
      ...termAnnotate(
        '. Every difference also shows basis points (bps) — the difference divided by NAV, times 10,000. A fund entity may hold through a special purpose vehicle (SPV); the hierarchy column names each one. Select any row for its full breakdown.'
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
        ...parity(`reconciliation.exception.${category.title.replace(/[^A-Za-z0-9_.>-]+/g, '_')}`),
        title: EXCEPTION_TIPS[category.title] ?? category.title,
      });
      // The chip label is NOT wrapped in term(): `activate()` makes the whole chip a
      // role="button" that jumps to the first flagged fund, and nesting a second control inside a
      // control is an R6 defect, not an R2 fix. `SPV` in "Dangling SPV" is disposed of by route
      // (a) instead — expanded and linked on the vocabulary line above, which precedes this strip.
      chip.append(
        el('span', {
          class: 'chip-count',
          ...parity(
            `reconciliation.exception.${category.title.replace(/[^A-Za-z0-9_.>-]+/g, '_')}.count`
          ),
          text: String(category.codes.length),
        }),
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
    renderWaterfall(qs('#reconciliation-waterfall', host), store.repricing, store.state.view);
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
