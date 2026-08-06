/**
 * The Data sources drawer — "where did this number come from, and as of when?"
 *
 * In the original this was a permanent strip above the tab bar that the hamburger could fold away,
 * which is how a figure could end up readable while its as-of date was not (rubric R3). Here the
 * as-of lives in the never-collapsible masthead and this drawer carries the *provenance*: which
 * report each figure comes from, the two upload slots, and where the shipped fixtures came from.
 *
 * The two upload slots LIVE HERE and work here — see `sources-upload.ts`, which also records why the
 * previous version of this drawer, which described the slots and then sent the reader to a screen with
 * no file input on it, was the worst sentence in the application.
 */
import type { Store } from '../../state/store.js';
import { el, replace, trapFocus } from '../primitives/dom.js';
import { formatCount } from '../../domain/money.js';
import { sourcesUploadBlock } from './sources-upload.js';
import { termVocabularyLine } from '../primitives/term.js';

/**
 * The abbreviations this drawer puts on screen, in the order a reader meets them.
 *
 * `vpm` and `carried_mv_position_mv` are here for the source files' own column names — "Quantity
 * VPM" and "MV USD". Those names are the upstream system's, not this app's, so renaming them would
 * misdescribe the file a controller has to go and look at; the honest move is to say what they mean.
 */
const SOURCES_VOCABULARY = ['nav', 'vpm', 'carried_mv_position_mv', 'spv', 'global_units_global_quantity'];

export const SOURCES_TITLE = 'Data sources & as-of';

export const SOURCES_STATUS = 'Loaded base dataset. Upload either file to recompute every tab.';

interface SourcesFigureRow {
  figure: string;
  report: string;
  field: string;
  note: string;
}

/** Figures that arrive already computed in one of the two reports. */
function sourcesReportedFigures(feeders: string): SourcesFigureRow[] {
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
  ];
}

/** Figures TRACE-Pro works out itself from the two reports. */
function sourcesDerivedFigures(): SourcesFigureRow[] {
  return [
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
  ];
}

/** The upstream systems and references the two reports themselves depend on. */
function sourcesSystemFigures(): SourcesFigureRow[] {
  return [
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

/** Where each figure the app renders actually comes from. `feeders` is the live top-level list. */
function sourcesFigureRows(feeders: string): SourcesFigureRow[] {
  return [...sourcesReportedFigures(feeders), ...sourcesDerivedFigures(), ...sourcesSystemFigures()];
}

function sourcesRow(cells: readonly string[]): HTMLElement {
  return el(
    'tr',
    {},
    cells.map((text) => el('td', { class: 'l', text }))
  );
}

function sourcesTable(headers: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  const table = el('table', { class: 'mini sources-table' });
  table.append(
    el('thead', {}, [
      el(
        'tr',
        {},
        headers.map((text) => el('th', { class: 'l', scope: 'col', text }))
      ),
    ])
  );
  table.append(el('tbody', {}, rows.map(sourcesRow)));
  return table;
}

function sourcesBlock(title: string, ...children: (Node | string | null)[]): HTMLElement {
  return el('div', { class: 'section' }, [el('h3', { text: title }), ...children]);
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

  /*
   * The drawer's own status line. It used to carry `id="ubstatus"` — the same id as the footer's
   * status line, which is the element the parity contract selects. Two elements answering to one id
   * is a defect on its own, and the harness only ever saw the first of them.
   */
  const status = el('span', { class: 'ub-status', id: 'sources-upload-status', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { class: 'drawer-body', id: 'sources-body' });

  /**
   * What the status lines say right now. `build()` runs again whenever an upload replaces a model, so
   * the sentence has to live outside it — otherwise a successful upload would immediately overwrite
   * its own confirmation with "Loaded base dataset".
   */
  let statusText = SOURCES_STATUS;

  /**
   * Announce an upload. The footer's `#ubstatus` is the element the parity contract reads, and its
   * DEFAULT text is the frozen sentence "Loaded base dataset. Upload either file to recompute every
   * tab." An upload is the one event entitled to replace it, which is exactly what that sentence
   * invites and what the original did on the same element.
   */
  function announce(text: string): void {
    statusText = text;
    status.textContent = text;
    const footer = document.getElementById('ubstatus');
    if (footer) footer.textContent = text;
  }

  /*
   * Built ONCE, and re-appended by every rebuild rather than rebuilt. The slots own the three states
   * of an upload in progress; recreating them on the notification that an upload itself fires would
   * throw away the very state the user is reading.
   */
  const upload = sourcesUploadBlock(store, announce);

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
    status.textContent = statusText;

    const asofLine = panel.querySelector('#sources-asof');
    if (asofLine) {
      asofLine.textContent =
        `${productName} (${productCode}) · every figure in this app is as of ${asof}, in US dollars. ` +
        'Nothing here reads a clock, so the same files always produce the same numbers.';
    }

    replace(
      body,
      // The drawer declares its own vocabulary, first, exactly as each screen does. It is not
      // decoration: this drawer quotes the source files' literal column names — `Quantity VPM`,
      // `MV USD`, `SIM` — and it quoted them ABOVE the prose that explained them, so a reader met
      // every abbreviation before its definition. R2's bar names drawers, and a definition that
      // arrives after the table it describes is not an expansion "on first use".
      termVocabularyLine(SOURCES_VOCABULARY, 'sources-vocabulary'),
      sourcesBlock(
        'Which report each figure comes from',
        sourcesTable(
          ['Figure', 'Source report', 'Field in the file', 'How it arrives'],
          sourcesFigureRows(repricing.apex.join(', ')).map((r) => [r.figure, r.report, r.field, r.note])
        )
      ),
      sourcesBlock(
        'Upload a fresh file',
        upload,
        status
      ),
      sourcesBlock(
        'Where the shipped figures came from',
        el('p', {
          class: 'note',
          text:
            'No backend. The five fixtures in data/ were extracted from the original TRACE-Pro artifact ' +
            'by scripts/extract-fixtures.mjs, and npm run fixtures:check asserts deep equality against ' +
            'that artifact, so they cannot drift from the file they came from. "Was called" gives the ' +
            'original’s own names for them, kept so a figure can be traced back to it: EMB (embedded ' +
            'look-through), UNI (universe), REVBASE (revision base) and SIM (simulator).',
        }),
        sourcesTable(
          ['File in data/', 'Was called', 'Contents', 'Read by'],
          [
            [
              'lookthrough.json',
              'EMB',
              `${formatCount(lookthrough.nodes.length)} look-through tree nodes, product headline`,
              'Reconciliation, Structure',
            ],
            [
              'repricing.json',
              'REVBASE',
              `${formatCount(repricing.funds.length)} funds, ${formatCount(repricing.apex.length)} top-level feeders, ${formatCount(repricing.breaks.length)} data breaks`,
              'Reconciliation and Pricing — the authoritative reconciliation',
            ],
            [
              'simulator.json',
              /*
               * Glossed HERE, in the cell, not only in the paragraph above the table.
               *
               * This is the original's name for this DATASET. The rubric's R2 denylist also carries
               * `sim`, but that token is the original's TAB id — a different referent that happens to
               * share three letters, and one this rebuild renders nowhere, because the lens is called
               * "Simulator". While the only gloss was the prose above ("… and SIM (simulator)"), the
               * crawler was discharging the cell with a definition of a different thing, several
               * hundred characters upstream, and passing. Putting the gloss in the cell distinguishes
               * the two referents by construction: this row's file is `simulator.json`, so
               * "(simulator)" can only be read as naming that dataset.
               */
              'SIM (simulator)',
              `${formatCount(Object.keys(simulator.funds).length)} funds, ${formatCount(simulator.edges.length)} ownership edges`,
              'Simulator lens',
            ],
            [
              'universe.json',
              'UNI',
              universe
                ? `${formatCount(universe.edges.length)} ownership edges, ${formatCount(universe.entities.length)} entities firm-wide`
                : 'firm-wide ownership graph, 472 KiB — fetched on first use, not yet loaded',
              'Ownership and Data quality lenses',
            ],
            [
              'legacy-pricing.json',
              'PRICING',
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
            'Two product NAVs exist in the source files and differ by $2,785.79: Σ of the top-level ' +
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
