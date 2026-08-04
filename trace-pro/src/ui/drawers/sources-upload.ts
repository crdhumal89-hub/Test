/**
 * The two upload slots, working.
 *
 * WHY THIS FILE EXISTS. The drawer used to describe two upload slots and then send the reader
 * somewhere else to use them: "the recompute is wired on the Reconciliation screen — upload there",
 * with each slot reading "Accepted on the Reconciliation screen". There was no file input anywhere in
 * the application. A controller who followed that sentence would have arrived on a screen with
 * nothing to drop a file onto — the app instructing someone to do something it cannot do. The
 * footer's status line, which is a frozen parity string, says "Upload either file to recompute every
 * tab", so of the two available fixes — implement it, or reword it — only one could make the
 * application and its own words agree. This is that implementation.
 *
 * WHAT EACH SLOT ACTUALLY DOES, which is what the slot text now says:
 *   NAV Report      — reads fund code → this period's ENDING_NAV, joins it onto the loaded funds and
 *                     reprices the whole book bottom-up (`applyNavOnly`). Structure is untouched.
 *   Position Report — reads structure, units and market values, then rebuilds BOTH the look-through
 *                     hierarchy and the repricing model from them, so no screen can show the shipped
 *                     structure above uploaded values.
 *
 * All three R4 states are real and panel-scoped: the slot shows a loading state while the file is
 * read (the read is chunked and yields, so it is visible rather than theoretical), an empty state
 * when the file parses but carries nothing this product can use, and an announced error state naming
 * the columns it wanted when the file is not the report it claims to be. Nothing here is swallowed:
 * a validated fault becomes a state, and an unexpected exception becomes a state AND is re-thrown on
 * a fresh task so the console listener in the headless suite still sees a real failure (R14).
 */
import { applyNavOnly, repriceFromPositions, structureFromTree } from '../../domain/repricing.js';
import { splitCsvLine } from '../../domain/ingest/cells.js';
import { navJoinToModel, readNavReport } from '../../domain/ingest/nav-report.js';
import {
  lookthroughFromPositions,
  positionEntities,
  positionIndexFromRows,
  positionReportProblem,
} from '../../domain/ingest/position-report.js';
import { formatCount, formatUsdCents } from '../../domain/money.js';
import { readWorkbookRows } from '../../export/excel.js';
import type { Store } from '../../state/store.js';
import { el, emptyState, errorState, loadingState, replace } from '../primitives/dom.js';

export interface SourcesSlot {
  key: 'position' | 'nav';
  title: string;
  format: string;
  accept: string;
  purpose: string;
  effect: string;
}

/** The two slots the original carried, in the original order, with what each one now does. */
export const SOURCES_SLOTS: readonly SourcesSlot[] = [
  {
    key: 'position',
    title: 'Position Report',
    format: '.xlsx',
    accept: '.xlsx,.xls,.csv',
    purpose: 'Structure and units — who holds what, how many units, and the ultimate securities.',
    effect:
      'Rebuilds the look-through hierarchy and every value derived from it: the reconciliation, the ' +
      'tree, the prices to publish and the repricing walk. Needs Fund Code, SPV Fund Code, ' +
      'Quantity VPM and MV USD columns.',
  },
  {
    key: 'nav',
    title: 'NAV Report',
    format: '.csv',
    accept: '.csv,.xlsx,.xls',
    purpose: 'Net asset value per fund — the ENDING_NAV column, which sets every price to publish.',
    effect:
      'Reprices the whole book bottom-up from the uploaded net asset values, leaving the structure ' +
      'as it is. Needs a fund-code column and this period’s ENDING_NAV — a previous-day or opening ' +
      'NAV column is ignored rather than mistaken for it.',
  },
];

/** How many lines are read before the reader yields the thread, so the loading state paints. */
const SOURCES_CHUNK = 2000;

function sourcesYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * File → rows of cells. A workbook goes through the vendored library, which is fetched on demand; a
 * text file is split in chunks with a yield between them, so a 100,000-row report neither freezes the
 * drawer nor finishes before its own loading state is on screen.
 */
async function sourcesReadRows(file: File, onProgress: (lines: number) => void): Promise<string[][]> {
  if (/\.xlsx?$/i.test(file.name)) {
    onProgress(0);
    return readWorkbookRows(new Uint8Array(await file.arrayBuffer()));
  }
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const rows: string[][] = [];
  for (let at = 0; at < lines.length; at += SOURCES_CHUNK) {
    for (const line of lines.slice(at, at + SOURCES_CHUNK)) rows.push(splitCsvLine(line));
    onProgress(rows.length);
    await sourcesYield();
  }
  return rows;
}

interface SourcesSlotView {
  /** The slot's own state region — the one place its three states are rendered. */
  state: HTMLElement;
  /** The app-wide status line the original updated on every upload. */
  announce: (text: string) => void;
}

function sourcesSetState(view: SourcesSlotView, node: Node): void {
  replace(view.state, node);
}

/** Record and re-throw an unexpected exception, after the state is on screen (R14). */
function sourcesRecordFailure(slot: string, error: unknown): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  const log = globalThis as { __sourcesUploadFailures?: string[] };
  log.__sourcesUploadFailures ??= [];
  log.__sourcesUploadFailures.push(`${slot}: ${failure.message}`);
  setTimeout(() => {
    throw failure;
  }, 0);
  return failure;
}

const SOURCES_RETRY = 'Choose a different file';

function sourcesRetry(input: HTMLInputElement): { label: string; onAct: () => void } {
  return {
    label: SOURCES_RETRY,
    onAct: () => {
      input.value = '';
      input.click();
    },
  };
}

/* ------------------------------------------------------------------ the NAV report */

function sourcesApplyNav(store: Store, rows: string[][], file: string, view: SourcesSlotView, input: HTMLInputElement): void {
  const result = readNavReport(rows);
  if (result.kind === 'position-report') {
    sourcesSetState(view, errorState(
      `“${file}” looks like a Position Report, not a NAV report.`,
      'It carries units and market values per position but no per-fund ENDING_NAV column, so there is ' +
        'nothing here to reprice from. Upload it in the Position Report slot above, which is the slot ' +
        'that reads structure and units.',
      sourcesRetry(input)
    ));
    return;
  }
  if (result.kind === 'no-layout' || result.kind === 'no-nav-column') {
    sourcesSetState(view, errorState(
      `No net asset values could be read from “${file}”.`,
      'A NAV report needs a fund-code column and this period’s ENDING_NAV: either PRODUCT, FUND_CODE, ' +
        'ENDING_NAV, or a per-fund feed with Fund Code and Ending NAV. Nothing on any screen has ' +
        'changed — the shipped figures are still on display.',
      sourcesRetry(input)
    ));
    return;
  }
  if (result.kind === 'empty') {
    sourcesSetState(view, emptyState(
      `“${file}” is a NAV report, but it has no fund rows under its header — nothing to apply. The ` +
        'shipped figures are still on display.',
      sourcesRetry(input)
    ));
    return;
  }

  const known = Object.keys(store.repricing.gqByFund);
  const joined = navJoinToModel(result.navByFund, known);
  if (!joined.matched.length) {
    sourcesSetState(view, emptyState(
      `None of the ${formatCount(result.codes.length)} fund codes in “${file}” belong to this product, ` +
        'so there is nothing here to reprice. Check that the report is for the product named at the top ' +
        'of this drawer.',
      sourcesRetry(input)
    ));
    return;
  }

  const structure = structureFromTree(store.core.lookthrough.nodes);
  const next = applyNavOnly(store.repricing, structure, joined.navByFund);
  store.setRepricing(next);
  const applied =
    `NAV report “${file}” applied — ${formatCount(joined.matched.length)} of ` +
    `${formatCount(result.codes.length)} uploaded funds matched this product, repriced bottom-up to ` +
    `${formatUsdCents(next.N)}. The reconciliation, the tree, every price and the walk now read from it.`;
  sourcesSetState(view, el('p', { class: 'sources-slot-applied', role: 'status', text: applied }));
  view.announce(applied);
}

/* ------------------------------------------------------------------ the position report */

function sourcesApplyPositions(store: Store, rows: string[][], file: string, view: SourcesSlotView, input: HTMLInputElement): void {
  const problem = positionReportProblem(rows);
  if (problem) {
    sourcesSetState(view, errorState(
      `“${file}” could not be read as a Position Report.`,
      `${problem}. A Position Report needs Fund Code, SPV Fund Code, Quantity VPM and MV USD; the ` +
        'structure and the values on screen are unchanged.',
      sourcesRetry(input)
    ));
    return;
  }
  const index = positionIndexFromRows(rows);
  const { product } = positionEntities(index, store.state.productName);
  const lookthrough = lookthroughFromPositions(index, product, store.state.asof);
  if (!lookthrough.nodes.length || lookthrough.nodes.length === 1) {
    sourcesSetState(view, emptyState(
      `“${file}” parsed, but it describes no holdings for ${product} — there is no hierarchy to build ` +
        'from it. The shipped structure is still on display.',
      sourcesRetry(input)
    ));
    return;
  }
  const repricing = repriceFromPositions(index, store.repricing.navByFund, product, store.state.asof);
  store.setModel({ lookthrough, repricing });
  const applied =
    `Position report “${file}” applied — ${formatCount(repricing.nFunds)} funds and ` +
    `${formatCount(lookthrough.nodes.length)} hierarchy rows rebuilt for ${product}, look-through ` +
    `value ${formatUsdCents(repricing.D)}. The reconciliation, the tree, the structure graph, every ` +
    'price and the walk now read from it.';
  sourcesSetState(view, el('p', { class: 'sources-slot-applied', role: 'status', text: applied }));
  view.announce(applied);
}

/* ------------------------------------------------------------------ the slots */

function sourcesSlotElement(store: Store, slot: SourcesSlot, announce: (text: string) => void): HTMLElement {
  const inputId = `sources-file-${slot.key}`;
  const stateId = `sources-state-${slot.key}`;
  const input = el('input', {
    type: 'file',
    id: inputId,
    class: 'sources-slot-input',
    accept: slot.accept,
    'aria-describedby': stateId,
  }) as HTMLInputElement;
  const state = el('div', { class: 'sources-slot-state', id: stateId }, [
    el('p', {
      class: 'sources-slot-idle',
      text: `No ${slot.title.toLowerCase()} uploaded. Every figure on screen comes from the extract this app shipped with.`,
    }),
  ]);
  const view: SourcesSlotView = { state, announce };

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    sourcesSetState(view, loadingState(`“${file.name}” — reading its rows`));
    sourcesReadRows(file, (lines) => {
      if (lines) {
        sourcesSetState(view, loadingState(`“${file.name}” — ${formatCount(lines)} rows read so far`));
      }
    }).then(
      (rows) => {
        try {
          if (slot.key === 'nav') sourcesApplyNav(store, rows, file.name, view, input);
          else sourcesApplyPositions(store, rows, file.name, view, input);
        } catch (error: unknown) {
          const failure = sourcesRecordFailure(slot.key, error);
          sourcesSetState(view, errorState(
            `“${file.name}” could not be applied.`,
            `${failure.message}. Nothing was changed: the models on screen are replaced only once the ` +
              'new ones are built, so a failed upload leaves every figure exactly as it was.',
            sourcesRetry(input)
          ));
        }
      },
      (error: unknown) => {
        const failure = sourcesRecordFailure(slot.key, error);
        sourcesSetState(view, errorState(
          `“${file.name}” could not be read.`,
          `${failure.message}. Nothing on any screen has changed.`,
          sourcesRetry(input)
        ));
      }
    );
  });

  return el('div', { class: 'sources-slot', 'data-slot': slot.key, role: 'listitem' }, [
    el('label', { class: 'sources-slot-title', for: inputId, text: `${slot.title} ${slot.format}` }),
    el('span', { class: 'sources-slot-purpose', text: slot.purpose }),
    input,
    el('span', { class: 'sources-slot-effect', text: slot.effect }),
    state,
  ]);
}

/** The upload block: what the slots do, the two real inputs, and each slot's own state region. */
export function sourcesUploadBlock(store: Store, announce: (text: string) => void): HTMLElement {
  const note = el('p', {
    class: 'note',
    id: 'sources-upload-note',
    text:
      'Both slots are live here, in this drawer: choose a file and this app recomputes in place, in ' +
      'front of you. Nothing is sent anywhere — the file is read in the browser, and a file that ' +
      'cannot be read leaves every figure on screen untouched.',
  });
  const list = el('div', { class: 'sources-slots', role: 'list', 'aria-describedby': 'sources-upload-note' });
  for (const slot of SOURCES_SLOTS) list.append(sourcesSlotElement(store, slot, announce));
  return el('div', { class: 'sources-upload' }, [note, list]);
}
