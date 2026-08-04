/**
 * The Simulator lens's opening block: the question it answers, the vocabulary that question and
 * everything under it use, and the verbatim help line.
 *
 * A separate file for one reason, stated so nobody has to guess: `simulator/index.ts` was at 399 of
 * the 400 lines `scripts/check-limits.mjs` allows, and the vocabulary line would not fit. Splitting
 * by concern was the honest option; deleting comments to make room was not.
 */
import type { Store } from '../../../../state/store.js';
import { el } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';
import { termAnnotate, termBindGlossary, termVocabularyLine } from '../../../primitives/term.js';

export const SIMULATOR_QUESTION =
  'If this fund’s value or units move, what happens to product NAV, and through which holders?';

/**
 * Every denylisted abbreviation this lens puts on screen, in the order a reader meets it — and this
 * lens puts more of them on screen than any other, which is why it needed the longest line:
 *
 *   `NAV` ×22 — the question, the baseline tile and its basis, the toolbar readout, five SVG
 *               `<title>`s ("no NAV reported"), the shock panel's own label and table headers, the
 *               graph's text alternative, the reprice ledger's "= Product NAV", the break callout.
 *   `SPV` ×5  — the subject tile's symbol, two graph node labels, the drawer symbol, a break line.
 *   `MV`  ×2  — the shock panel's hint and the help line's "MV / Qty / NAV".
 *   `Δ`   ×2  — the baseline tile's basis and the shock preview.
 *   `bps` ×1  — the "NAV vs look-through" break line.
 *   `apex` ×1 — a node tag on the graph.
 *   `DC`  ×2  — inside two registered entity names the graph labels.
 *   `px`, `qty` — the ~20 SVG node captions ("px 1.122812") and the units input.
 *
 * Almost none of them can take route (b): SVG `<text>` and `<title>` cannot contain an HTML
 * `<button>`, and the rest sit inside graph nodes, table headers and chips that are already
 * controls (R6c forbids a control inside a control). So this lens leans on R2's route (a) — one
 * visible expansion, rendered before every use of it — and this is that line.
 */
const SIMULATOR_VOCABULARY = [
  'nav',
  'spv',
  'carried_mv_position_mv',
  'global_units_global_quantity',
  'publish_px_vs_current_applied_px_vs_revised_px',
  'pricing',
  'bps',
  'apex_fund_feeder_terminal_fund',
  'double_count',
];

/**
 * Question, then vocabulary. `termAnnotate` links the `NAV` inside the question rather than
 * expanding it, because the question precedes the vocabulary line and R2 measures first use by
 * position; it adds no characters, so R1's ≤ 140 and the parity gate both read what they read
 * before.
 */
export function simulatorIntro(store: Store): (Node | string)[] {
  termBindGlossary(store);
  return [
    el('p', { class: 'screen-question', id: 'simulator-question' }, termAnnotate(SIMULATOR_QUESTION)),
    termVocabularyLine(SIMULATOR_VOCABULARY, 'simulator-vocabulary'),
  ];
}

/**
 * The help line, verbatim. `simulator.help_text` is a STRICT parity key — not in
 * docs/rename-map.json — so it keeps the original's wording, including the old names of the two
 * sweep controls, which the paragraph after it maps onto the shipped labels.
 */
export function simulatorHelpText(): HTMLElement {
  const b = (text: string): HTMLElement => el('b', { text });
  return el('p', { class: 'screen-help', id: 'simulator-help', ...parity('simulator.help_text') }, [
    'Click a node to shock its ', b('MV / Qty / NAV'), ' & hit ', b('Run'), ' · ',
    b('Run full reprice'), ' sweeps the whole book bottom-up automatically · ',
    b('Step by stage'), ' lets you ', b('click each level'),
    ' to reprice it yourself, one stage at a time. Prices flow up the lit path; open the ',
    b('▤ Ledger'), ' tray for the per-holder breakdown.',
  ]);
}
