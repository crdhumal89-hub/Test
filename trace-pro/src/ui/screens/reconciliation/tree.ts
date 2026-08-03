/**
 * The hierarchy: product ▸ feeder ▸ SPV ▸ security, with the three values side by side and the two
 * differences between them. Every row is keyboard-reachable and every header is a real control.
 */
import { reconcileNode, hasChildren, visibleNodes } from '../../../domain/lookthrough.js';
import { evaluateEntity } from '../../../domain/exceptions.js';
import { formatUsd, formatUsdParens, formatPercent } from '../../../domain/money.js';
import type { LookthroughNode, PricingView, RepricingFixture } from '../../../domain/types.js';
import { el, replace, activate } from '../../primitives/dom.js';

const EM_DASH = '—';

export const TREE_COLUMNS = [
  { key: 'hierarchy', label: 'Hierarchy — fund ▸ SPV ▸ security', align: 'l' },
  { key: 'symbol', label: 'VPM symbol', align: 'l' },
  { key: 'nav', label: 'NAV', sub: 'reported', align: 'r' },
  { key: 'derived', label: 'Look-through value', sub: 'current marks', align: 'r' },
  { key: 'revised', label: 'Repriced value', sub: 'NAV-repriced', align: 'r' },
  { key: 'pricing', label: 'Pricing difference', sub: 'repriced − look-through', align: 'r' },
  { key: 'nonPosition', label: 'Non-position difference', sub: 'NAV − repriced', align: 'r' },
] as const;

export interface TreeCallbacks {
  onToggle(nodeId: number): void;
  onSelect(nodeId: number): void;
}

export function renderTree(
  host: HTMLElement,
  options: {
    nodes: readonly LookthroughNode[];
    repricing: RepricingFixture;
    view: PricingView;
    expanded: ReadonlySet<number>;
    selectedId: number | null;
    symbolOf: (code: string) => string;
    asof: string;
  },
  callbacks: TreeCallbacks
): void {
  const { nodes, repricing, view, expanded, selectedId, symbolOf, asof } = options;
  const after = view === 'after';

  const head = el('tr', {}, [
    ...TREE_COLUMNS.map((c) =>
      el('th', { class: c.align === 'l' ? 'l' : 'r', scope: 'col' }, [
        el('span', { class: 'th-label', text: c.label }),
        'sub' in c && c.sub
          ? el('span', {
              class: 'th-sub',
              text: c.key === 'pricing' && after ? 'reconciled' : c.sub,
            })
          : null,
      ])
    ),
  ]);

  const body = el('tbody');
  for (const node of visibleNodes(nodes, expanded)) {
    body.append(renderRow(node, { nodes, repricing, view, expanded, selectedId, symbolOf }, callbacks));
  }
  body.append(renderTotals(repricing, after));

  const table = el('table', {
    class: 'tbl tree',
    'aria-label': `Look-through hierarchy for ${repricing.product}, as of ${asof}`,
  });
  table.append(el('thead', {}, [head]), body);
  replace(host, table);
}

function differenceCell(value: number | null, bps: number | null): HTMLElement {
  if (value == null || Math.abs(value) < 1) {
    return el('td', { class: 'r muted', text: EM_DASH });
  }
  return el('td', { class: 'r' }, [
    el('span', { class: value < 0 ? 'neg' : 'pos', text: formatUsdParens(value) }),
    bps == null
      ? null
      : el('span', { class: 'bps', text: `${bps >= 0 ? '+' : ''}${bps.toFixed(1)} bps` }),
  ]);
}

function renderRow(
  node: LookthroughNode,
  options: {
    nodes: readonly LookthroughNode[];
    repricing: RepricingFixture;
    view: PricingView;
    expanded: ReadonlySet<number>;
    selectedId: number | null;
    symbolOf: (code: string) => string;
  },
  callbacks: TreeCallbacks
): HTMLElement {
  const { nodes, repricing, view, expanded, selectedId, symbolOf } = options;
  const r = reconcileNode(node, repricing, view);
  const kids = hasChildren(node, nodes);
  const open = expanded.has(node.id);
  const flag = flagOf(node, repricing, view);

  const row = el('tr', {
    class: [
      'row',
      node.kind === 'vehicle' ? 'vehicle' : '',
      node.id === selectedId ? 'selected' : '',
      flag ? `flagged ${flag}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    'data-code': node.code,
    'data-node-id': String(node.id),
    'data-kind': node.kind,
  });

  const name = el('td', { class: 'l', style: `padding-left:${8 + 12 * node.level}px` });
  if (kids) {
    const twist = el('button', {
      type: 'button',
      class: 'twist',
      'aria-expanded': open ? 'true' : 'false',
      'aria-label': `${open ? 'Collapse' : 'Expand'} ${node.name}`,
      text: open ? '▾' : '▸',
    });
    twist.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onToggle(node.id);
    });
    name.append(twist);
  } else {
    name.append(el('span', { class: 'twist twist-empty', 'aria-hidden': 'true' }));
  }
  name.append(el('span', { class: `tag tag-${node.kind}`, text: KIND_LABEL[node.kind] }));
  name.append(el('span', { class: 'row-name', text: node.name }));
  if (node.kind === 'apex' || node.kind === 'vehicle') {
    name.append(el('span', { class: 'code', text: node.code }));
  }
  if (node.isLeaf && node.issuer) {
    name.append(el('div', { class: 'issuer', text: node.issuer }));
  }
  row.append(name);

  row.append(el('td', { class: 'l mono', text: node.kind === 'product' ? '' : symbolOf(node.code) }));
  row.append(
    r.nav == null
      ? el('td', { class: 'r muted', text: EM_DASH })
      : el('td', { class: 'r', text: formatUsd(r.nav) })
  );
  row.append(el('td', { class: 'r', text: formatUsd(r.derived) }));
  row.append(el('td', { class: 'r strong', text: formatUsd(r.revised) }));
  row.append(
    view === 'after'
      ? el('td', { class: 'r reconciled', text: '✓ reconciled' })
      : differenceCell(r.deltaPricing, r.pricingBps)
  );
  row.append(differenceCell(r.deltaNonPosition, r.nonPositionBps));

  activate(row, () => callbacks.onSelect(node.id), {
    role: 'button',
    label: `Open the breakdown for ${node.name}`,
  });
  return row;
}

const KIND_LABEL: Record<LookthroughNode['kind'], string> = {
  product: 'PRODUCT',
  apex: 'FEEDER',
  vehicle: 'SPV',
  leaf: 'SECURITY',
};

function flagOf(node: LookthroughNode, repricing: RepricingFixture, view: PricingView): string {
  if (node.kind === 'leaf' || node.kind === 'product') return '';
  const verdict = evaluateEntity({
    nav: repricing.navByFund[node.code] ?? null,
    revised: repricing.revByFund[node.code] ?? null,
    derived: repricing.ltvByFund[node.code] ?? null,
    globalUnits: repricing.gqByFund[node.code] ?? null,
    view,
    describe: () => ({ nonPosition: '', pricing: '' }),
  });
  return verdict.severity ?? '';
}

function renderTotals(repricing: RepricingFixture, after: boolean): HTMLElement {
  const row = el('tr', { class: 'row totals' });
  row.append(el('td', { class: 'l', text: `TOTALS · ${repricing.product}` }));
  row.append(el('td', {}));
  row.append(el('td', { class: 'r', text: formatUsd(repricing.N) }));
  row.append(el('td', { class: 'r', text: formatUsd(after ? repricing.R : repricing.D) }));
  row.append(el('td', { class: 'r strong', text: formatUsd(repricing.R) }));
  row.append(
    after
      ? el('td', { class: 'r reconciled', text: '✓ reconciled' })
      : el('td', { class: 'r' }, [
          el('span', {
            class: repricing.dPricing < 0 ? 'neg' : 'pos',
            text: formatUsdParens(repricing.dPricing),
          }),
        ])
  );
  row.append(
    el('td', { class: 'r' }, [
      el('span', {
        class: repricing.dNonPos < 0 ? 'neg' : 'pos',
        text: formatUsdParens(repricing.dNonPos),
      }),
    ])
  );
  return row;
}

/** Ownership figures the detail panel restates, kept here so the tree owns its own vocabulary. */
export function shareLabels(node: LookthroughNode): { direct: string; effective: string } {
  return { direct: formatPercent(node.ownpct), effective: formatPercent(node.applied) };
}
