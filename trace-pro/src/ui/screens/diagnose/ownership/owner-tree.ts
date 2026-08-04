/**
 * The upward ownership tree, the header identifying the position it is rooted on, and the
 * proportional ribbon that indexes it.
 *
 * The tree reads in the opposite direction to the Reconciliation hierarchy: the searched position
 * is the root, and every twisty opens the holders ABOVE the row, one level per click, until an
 * ultimate owner (held by nobody) or a circular holding stops the chain.
 *
 * Six columns, all of them the original's, because parity is checked on the joined header text.
 * The renamed vocabulary from docs/redesign-spec.md §3.1 rides along as the `title` on each header,
 * so "Immediate %" is still one hover from "Direct share (of the level below)".
 */
import { TRUNCATE } from '../../../../domain/exceptions.js';
import { formatCount, formatPercent } from '../../../../domain/money.js';
import type { OwnershipGraph, OwnershipRow } from '../../../../domain/ownership.js';
import {
  displayName,
  immediateHolders,
  isSecurity,
  isSubtotal,
  totalQuantity,
  vpmSymbol,
} from '../../../../domain/ownership.js';
import { el, replace, activate } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';

/** 16px per level, matching the original's indent so a deep chain stays readable. */
const OWNERSHIP_INDENT = 16;

/**
 * The eight-colour ribbon rotation. Colour is never the only cue: each segment names itself in its
 * accessible name and its `title`.
 *
 * Three of the eight shipped tones (`#0fb5a6`, `#8aa0c0`, `#7fc8bf`) were too light to carry a focus
 * ring: every segment is a focus stop (R6), and the ring's white halo needs ≥ 3:1 against the fill
 * it is drawn over. Darkened to relative luminance ≤ 0.30, which puts the halo at 3.2:1 (was 1.9:1)
 * on the palest segment while keeping the hue rotation legible. Measured per stop in
 * tests/e2e/rubric.spec.ts.
 */
const OWNERSHIP_RIBBON_COLORS = [
  '#14356b',
  '#0e8f83',
  '#3a5c92',
  '#0a9d6b',
  '#c47f17',
  '#5c6b76',
  '#6a83aa',
  '#4e9a91',
];

/**
 * Who this lens is currently answering about: kind, VPM symbol, name and code, units outstanding,
 * and the reminder that everything below is a share of that whole.
 */
export function renderOwnershipIdentity(
  host: HTMLElement,
  graph: OwnershipGraph,
  code: string,
  total: number
): void {
  const security = isSecurity(graph, code);
  replace(
    host,
    el('span', {
      class: `tag ${security ? 'tag-leaf' : 'tag-vehicle'}`,
      ...parity(`ownership.${code}.kind`),
      text: security ? 'SECURITY' : 'SPV / FUND',
    }),
    el('span', { class: 'own-symbol', ...parity(`ownership.${code}.symbol`), text: vpmSymbol(graph, code) }),
    el('span', {
      class: 'own-name',
      ...parity(`ownership.${code}.name_and_code`),
      text: `${displayName(graph, code)} · code ${code}`,
    }),
    el('span', {
      class: 'own-qty',
      ...parity(`ownership.${code}.total_qty`),
      title: 'Units outstanding (firm-wide) — the denominator of every Immediate % below.',
      text: `Total qty: ${formatCount(total)}`,
    }),
    el('span', {
      class: 'own-pie',
      ...parity(`ownership.${code}.pie`),
      title: 'The whole entity. Every share below is a share of this.',
      text: '100%',
    })
  );
}

export interface OwnershipTreeCallbacks {
  /** A twisty was operated: open or close that branch. */
  onToggleBranch(rowId: string): void;
  /** A row was chosen: show its derivation in the inspector. */
  onSelectRow(rowId: string): void;
}

export interface OwnershipTreeOptions {
  graph: OwnershipGraph;
  root: string;
  rows: readonly OwnershipRow[];
  expanded: ReadonlySet<string>;
  selectedRowId: string | null;
}

/**
 * Header labels. `Immediate %` and `% of SYM` carry a sub-line, exactly as shipped; the joined
 * text of this row is the `ownership.column_headers` parity key.
 */
function ownershipHeaderRow(rootSymbol: string): HTMLElement {
  const columns: { label: string; sub?: string; align: 'l' | 'r'; title: string }[] = [
    {
      label: 'Owner (expand ▸ upward)',
      align: 'l',
      title: 'Each twisty opens the holders of the row it sits on — the chain upward, not downward.',
    },
    { label: 'VPM symbol', align: 'l', title: 'The symbol this entity trades under in VPM.' },
    { label: 'SPV fund code', align: 'l', title: 'The SPV fund code that maps the holding.' },
    { label: 'Qty held', align: 'r', title: 'Units of the row below that this holder holds.' },
    {
      // Renamed per docs/redesign-spec.md §3.1 and declared in docs/rename-map.json: the old
      // subtitle "share of row below" only restated the old label "Immediate %".
      label: 'Direct share',
      sub: 'of the level below',
      align: 'r',
      title: 'Direct share, was "Immediate %" — holder qty ÷ units outstanding of the row below.',
    },
    {
      label: `% of ${rootSymbol}`,
      sub: 'cumulative · effective',
      align: 'l',
      title: `Effective share (of the searched position) — every direct share on the path multiplied together, ending at ${rootSymbol}.`,
    },
  ];
  return el(
    'tr',
    { ...parity('ownership.column_headers') },
    columns.map((c) =>
      el('th', { class: c.align, scope: 'col', title: c.title }, [
        el('span', { class: 'th-label', text: c.label }),
        c.sub ? el('span', { class: 'th-sub', text: c.sub }) : null,
      ])
    )
  );
}

/** `= 100% of X · N units` — the closing line of a branch, restating what the % above are of. */
function ownershipSubtotalRow(
  graph: OwnershipGraph,
  root: string,
  row: Extract<OwnershipRow, { subtotal: true }>
): HTMLElement {
  const cell = el('td', {
    class: 'l',
    colspan: '6',
    style: `padding-left:${8 + OWNERSHIP_INDENT * row.depth}px`,
  });
  cell.append(
    document.createTextNode('= 100% of '),
    el('b', { text: row.code }),
    document.createTextNode(` · ${formatCount(row.total)} units`)
  );
  if (row.depth > 0) {
    cell.append(
      document.createTextNode(` · ${formatPercent(row.cumulative)} of ${vpmSymbol(graph, root)}`)
    );
  }
  return el('tr', { class: 'own-subtotal' }, [cell]);
}

function ownershipOwnerRow(
  options: OwnershipTreeOptions,
  row: Extract<OwnershipRow, { holder: string }>,
  callbacks: OwnershipTreeCallbacks
): HTMLElement {
  const { graph, root, expanded, selectedRowId } = options;
  const open = expanded.has(row.id);
  const ultimate = graph.ultimates.has(row.holder);
  const name = displayName(graph, row.holder);
  // Parity keys are only defined for the immediate owners, which are the rows the frozen baseline
  // captured; a deeper row can repeat a code, and a repeated key would be a false figure.
  const keyed = row.depth === 0 ? `ownership.${root}.owner.${row.holder}` : null;

  const tr = el('tr', {
    class: ['own-row', 'rowv', row.id === selectedRowId ? 'selected' : '', row.cyclic ? 'own-cyclic' : '']
      .filter(Boolean)
      .join(' '),
    'data-own-row': row.id,
    'data-code': row.holder,
  });

  const first = el('td', { class: 'l', style: `padding-left:${8 + OWNERSHIP_INDENT * row.depth}px` });
  if (row.expandable) {
    const twist = el('button', {
      type: 'button',
      class: 'twist',
      'aria-expanded': open ? 'true' : 'false',
      'aria-label': `${open ? 'Collapse' : 'Expand'} the owners of ${name}`,
      text: open ? '▾' : '▸',
    });
    twist.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onToggleBranch(row.id);
    });
    first.append(twist);
  } else if (row.cyclic) {
    first.append(
      el('span', {
        class: 'twist own-cycle-mark',
        title: 'Circular holding — this owner already appears further down this same chain, so the walk stops here rather than looping.',
        text: '⟲',
      })
    );
  } else {
    first.append(el('span', { class: 'twist twist-empty', 'aria-hidden': 'true' }));
  }
  first.append(
    el('span', {
      class: `tag ${ultimate ? 'tag-apex' : 'tag-vehicle'}`,
      title: ultimate
        ? 'Ultimate owner — the top of this ownership chain, held by no one else in the mapped universe.'
        : 'A holder of the row below. Expand it to see who holds it.',
      text: ultimate ? 'Ult. owner' : 'Owner',
    }),
    el('span', { class: 'row-name', title: `${name} · ${row.holder}`, text: name }),
    el('span', { class: 'code', text: row.holder })
  );
  tr.append(first);

  tr.append(el('td', { class: 'l mono', text: vpmSymbol(graph, row.holder) }));
  tr.append(el('td', { class: 'l mono', text: row.holder }));
  tr.append(
    el('td', { class: 'r', ...parity(keyed && `${keyed}.qty_held`), text: formatCount(row.units) })
  );
  tr.append(
    el('td', {
      class: 'r',
      ...parity(keyed && `${keyed}.immediate_pct`),
      text: formatPercent(row.direct),
    })
  );
  // The inline gradient is the bar: its width is the figure, so it cannot live in a stylesheet.
  const barWidth = Math.min(100, row.cumulative * 100);
  tr.append(
    el(
      'td',
      {
        class: 'l own-cum',
        style: `background:linear-gradient(90deg,rgba(11,31,58,.13) ${barWidth}%,transparent 0)`,
      },
      [
        el('span', {
          class: 'own-cum-value mono',
          ...parity(keyed && `${keyed}.cumulative_pct`),
          text: formatPercent(row.cumulative),
        }),
      ]
    )
  );

  activate(tr, () => callbacks.onSelectRow(row.id), {
    role: 'button',
    label: `Show how ${name} arrives at ${formatPercent(row.cumulative)} of ${vpmSymbol(graph, root)}`,
  });
  return tr;
}

/** The whole table. Called on every expand, selection and search — it is cheap and stateless. */
export function renderOwnershipTree(
  host: HTMLElement,
  options: OwnershipTreeOptions,
  callbacks: OwnershipTreeCallbacks
): void {
  const body = el('tbody');
  for (const row of options.rows) {
    body.append(
      isSubtotal(row)
        ? ownershipSubtotalRow(options.graph, options.root, row)
        : ownershipOwnerRow(options, row, callbacks)
    );
  }
  // `id="revtree"` and the `rowv` row class are harness anchors, matching the frozen map's
  // ownRow step and its column selectors. Not user-visible.
  const table = el('table', {
    id: 'revtree',
    class: 'tbl own-tree',
    'aria-label': `Owners of ${vpmSymbol(options.graph, options.root)}, upward`,
  });
  table.append(el('thead', {}, [ownershipHeaderRow(vpmSymbol(options.graph, options.root))]), body);
  replace(host, table);
}

/**
 * The ribbon: one segment per immediate owner, width proportional to its direct share. It is an
 * index into the tree, so every segment is a control that scrolls to and selects its row — the
 * original made these mouse-only `div`s.
 */
export function renderOwnershipRibbon(
  host: HTMLElement,
  graph: OwnershipGraph,
  root: string,
  onPick: (code: string) => void
): void {
  const total = totalQuantity(graph, root);
  const owners = immediateHolders(graph, root)
    .slice()
    .sort((a, b) => b[1] - a[1]);
  const shown = owners.slice(0, TRUNCATE.ribbonSegments);

  const strip = el('div', {
    class: 'own-ribbon',
    role: 'group',
    'aria-label': `Immediate owners of ${vpmSymbol(graph, root)}, sized by share`,
  });
  shown.forEach(([code, units], index) => {
    const share = total ? units / total : 0;
    const segment = el('div', {
      class: 'own-seg',
      'data-code': code,
      style: `width:${share * 100}%;background:${OWNERSHIP_RIBBON_COLORS[index % OWNERSHIP_RIBBON_COLORS.length]}`,
      title: `${displayName(graph, code)} (${code}) — ${formatPercent(share)}`,
    });
    activate(segment, () => onPick(code), {
      role: 'button',
      label: `${displayName(graph, code)}, ${formatPercent(share)} — go to its row`,
    });
    strip.append(segment);
  });

  replace(
    host,
    strip,
    owners.length > shown.length
      ? el('p', {
          class: 'note',
          text: `Ribbon shows the largest ${shown.length} of ${owners.length} immediate owners; the table below lists all ${owners.length}.`,
        })
      : null
  );
}
