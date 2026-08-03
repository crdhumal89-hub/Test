/**
 * The Data sources drawer — "where did this number come from, and as of when?"
 *
 * In the original this was a permanent strip above the tab bar that the hamburger could fold away,
 * which is how a figure could end up readable while its as-of date was not (rubric R3). Here the
 * as-of lives in the never-collapsible masthead and this drawer carries the *provenance*: which
 * report each figure comes from, the two upload slots, and where the shipped fixtures came from.
 *
 * The upload slots are present but inert. Upload recompute is wired on the Reconciliation screen,
 * where the recomputed figures are actually read; a slot that silently rebuilt every screen from a
 * drawer would be the original's behaviour and the original's surprise. The slots say so, rather
 * than looking broken.
 */
import type { Store } from '../../state/store.js';
import { el, replace, trapFocus } from '../primitives/dom.js';
import { formatCount } from '../../domain/money.js';

export const SOURCES_TITLE = 'Data sources & as-of';

export const SOURCES_STATUS = 'Loaded base dataset. Upload either file to recompute every tab.';

interface SourcesFigureRow {
  figure: string;
  report: string;
  field: string;
  note: string;
}

interface SourcesSlot {
  key: string;
  title: string;
  format: string;
  purpose: string;
}

/** The two upload slots the original carried, in the original order. */
const SOURCES_SLOTS: readonly SourcesSlot[] = [
  {
    key: 'position',
    title: 'Position Report',
    format: '.xlsx',
    purpose: 'Structure and units — who holds what, how many units, and the ultimate securities.',
  },
  {
    key: 'nav',
    title: 'NAV Report',
    format: '.csv',
    purpose: 'Net asset value per fund — the ENDING_NAV column, which sets every price to publish.',
  },
];

/** Where each figure the app renders actually comes from. `feeders` is the live top-level list. */
function sourcesFigureRows(feeders: string): readonly SourcesFigureRow[] {
  return [
    {
      figure: 'Net asset value (NAV), per fund',
      report: 'NAV Report (.csv)',
      field: 'ENDING_NAV',
      note: 'Reported, never recomputed. Divided by units outstanding it becomes the price to publish.',
    },
    {
      figure: 'Product NAV',
      report: 'NAV Report (.csv)',
      field: `Σ ENDING_NAV over the top-level feeders (${feeders})`,
      note: 'Only the top-level feeders are summed. Summing every fund would count parents and children twice.',
    },
    {
      figure: 'Units outstanding, firm-wide',
      report: 'Position Report (.xlsx)',
      field: 'Quantity VPM, summed across holders',
      note: 'The denominator of every per-unit price.',
    },
    {
      figure: 'Structure and direct share',
      report: 'Position Report (.xlsx)',
      field: 'Fund Entity · Fund Code · SPV Fund Code',
      note: 'Holder to vehicle to security. Direct share = units held ÷ units outstanding.',
    },
    {
      figure: 'Book value of the stake, as booked',
      report: 'Position Report (.xlsx)',
      field: 'MV USD',
      note: 'What the position is carried at before any repricing.',
    },
    {
      figure: 'Look-through value at current marks',
      report: 'Derived in TRACE-Pro',
      field: 'Position Report roll-up',
      note: 'Each holding expanded by its direct share, down to the ultimate securities, at today’s marks.',
    },
    {
      figure: 'Repriced value (NAV, bottom-up)',
      report: 'Derived in TRACE-Pro',
      field: 'NAV Report + Position Report',
      note: 'Deepest funds price at NAV ÷ units, then every holder is revalued from its children.',
    },
    {
      figure: 'Symbols and quantities',
      report: 'VPM accounting system',
      field: 'VPM symbol · Quantity VPM',
      note: 'Reaches the app through the Position Report. Basis of the Symbol column.',
    },
    {
      figure: 'Split of a fund’s units across its parents',
      report: 'Allocation Tracker (reference)',
      field: 'Ownership allocation',
      note: 'Here derived from the Position Report itself, so co-owned funds are checked to sum to ~100%.',
    },
  ];
}

function sourcesRow(cells: readonly string[]): HTMLElement {
  return el(
    'tr',
    {},
    cells.map((text, index) => el('td', { class: index === 1 ? '' : 'l', text }))
  );
}

function sourcesTable(headers: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  const table = el('table', { class: 'mini' });
  table.append(
    el('thead', {}, [
      el(
        'tr',
        {},
        headers.map((text, index) => el('th', { class: index === 1 ? '' : 'l', scope: 'col', text }))
      ),
    ])
  );
  table.append(el('tbody', {}, rows.map(sourcesRow)));
  return table;
}

function sourcesBlock(title: string, ...children: (Node | string | null)[]): HTMLElement {
  return el('div', { class: 'section' }, [el('h3', { text: title }), ...children]);
}

/** The two upload affordances: visible, focusable, explained, and honestly inert. */
function sourcesSlotList(status: HTMLElement, noteId: string): HTMLElement {
  const list = el('div', { class: 'sources-slots' });
  for (const slot of SOURCES_SLOTS) {
    const button = el('button', {
      type: 'button',
      class: 'btn sources-slot',
      'data-slot': slot.key,
      'aria-disabled': 'true',
      'aria-describedby': noteId,
    });
    button.append(
      el('span', { class: 'sources-slot-title', text: `${slot.title} ${slot.format}` }),
      el('span', { class: 'sources-slot-purpose', text: slot.purpose })
    );
    button.addEventListener('click', () => {
      status.textContent =
        `The ${slot.title} slot is not wired here. Upload it on the Reconciliation screen, ` +
        'where the recomputed reconciliation is shown as it changes.';
    });
    list.append(button);
  }
  return list;
}

/** Mount the drawer into `host` (the shell's `#drawer-host`). */
export function mountSourcesDrawer(host: HTMLElement, store: Store): () => void {
  const panel = el('aside', {
    class: 'drawer drawer-sources',
    id: 'sources-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'sources-title',
    'aria-hidden': 'true',
    hidden: 'hidden',
  });

  const close = el('button', {
    type: 'button',
    class: 'drawer-close',
    id: 'sources-close',
    'aria-label': 'Close data sources',
    text: '×',
  });
  close.addEventListener('click', () => store.set({ drawer: null }));

  const status = el('span', { class: 'ub-status', id: 'ubstatus', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { class: 'drawer-body', id: 'sources-body' });

  replace(
    panel,
    el('header', { class: 'drawer-head' }, [
      el('h2', { class: 'drawer-title', id: 'sources-title', text: SOURCES_TITLE }),
      el('p', { class: 'drawer-sub', id: 'sources-asof' }),
      close,
    ]),
    body
  );
  host.append(panel);

  function build(): void {
    const { asof, productName, productCode } = store.state;
    const repricing = store.repricing;
    const lookthrough = store.core.lookthrough;
    const simulator = store.core.simulator;
    const universe = store.universe;
    status.textContent = SOURCES_STATUS;

    const asofLine = panel.querySelector('#sources-asof');
    if (asofLine) {
      asofLine.textContent =
        `${productName} (${productCode}) · every figure in this app is as of ${asof}, in US dollars. ` +
        'Nothing here reads a clock, so the same files always produce the same numbers.';
    }

    replace(
      body,
      sourcesBlock(
        'Which report each figure comes from',
        sourcesTable(
          ['Figure', 'As of', 'Field in the file', 'How it arrives'],
          sourcesFigureRows(repricing.apex.join(', ')).map((r) => [r.figure, asof, `${r.report} — ${r.field}`, r.note])
        )
      ),
      sourcesBlock(
        'Upload a fresh file',
        el('p', {
          class: 'note',
          id: 'sources-upload-note',
          text:
            'These two slots are shown here so the expected inputs are discoverable, but the recompute ' +
            'is wired on the Reconciliation screen — upload there and the reconciliation, the tree and ' +
            'every price update in place, in front of you.',
        }),
        sourcesSlotList(status, 'sources-upload-note'),
        status
      ),
      sourcesBlock(
        'Where the shipped figures came from',
        el('p', {
          class: 'note',
          text:
            'No backend. The five fixtures in data/ were extracted from the original TRACE-Pro artifact ' +
            'by scripts/extract-fixtures.mjs, and npm run fixtures:check asserts deep equality against ' +
            'that artifact, so they cannot drift from the file they came from.',
        }),
        sourcesTable(
          ['File in data/', 'Was called', 'Contents', 'Read by'],
          [
            [
              'lookthrough.json',
              asof,
              `${formatCount(lookthrough.nodes.length)} look-through tree nodes, product headline`,
              'Reconciliation, Structure',
            ],
            [
              'repricing.json',
              asof,
              `${formatCount(repricing.funds.length)} funds, ${formatCount(repricing.apex.length)} top-level feeders, ${formatCount(repricing.breaks.length)} data breaks`,
              'Reconciliation, Pricing — the authoritative reconciliation',
            ],
            [
              'simulator.json',
              asof,
              `${formatCount(Object.keys(simulator.funds).length)} funds, ${formatCount(simulator.edges.length)} ownership edges`,
              'Simulator lens',
            ],
            [
              'universe.json',
              asof,
              universe
                ? `${formatCount(universe.edges.length)} ownership edges, ${formatCount(universe.entities.length)} entities firm-wide`
                : 'firm-wide ownership graph — 472 KiB, fetched on first use',
              'Ownership and Data quality lenses',
            ],
            [
              'legacy-pricing.json',
              asof,
              'legacy reconciliation model — supplies the flag thresholds and the derived-value map only',
              'Pricing thresholds',
            ],
          ]
        )
      ),
      sourcesBlock(
        'One caveat worth knowing',
        el('p', {
          class: 'note',
          text:
            `Two product NAVs exist in the source files and differ by $2,785.79: Σ of the top-level ` +
            'feeders’ ENDING_NAV, which the reconciliation uses, and the single fund-entity NAV stamp, ' +
            'which is the same figure less the DUNK feeder. Both are preserved and both are labelled ' +
            'by basis wherever they appear, rather than one being silently corrected.',
        })
      )
    );
  }

  let release: (() => void) | null = null;

  function sync(): void {
    const open = store.state.drawer === 'sources';
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) {
      release?.();
      release = null;
      return;
    }
    build();
    release = trapFocus(panel, () => store.set({ drawer: null }));
  }

  build();
  sync();

  const unsubscribe = store.subscribe((_state, changed) => {
    if (changed.has('product') || changed.has('asof')) build();
    if (changed.has('drawer')) sync();
  });

  return () => {
    unsubscribe();
    release?.();
    panel.remove();
  };
}
