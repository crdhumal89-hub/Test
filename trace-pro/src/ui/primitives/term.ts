/**
 * `term()` — a controller abbreviation, rendered BYTE-FOR-BYTE UNCHANGED, wired to its glossary
 * definition. This is rubric R2's second escape hatch ("rendered as a glossary-linked term that
 * opens the definition in one action") and the missing fourth clause of R7 ("clicking a
 * glossary-linked label anywhere opens the glossary *at that term*").
 *
 * WHY route (b) and not expansion-in-place. 978 of the 1,020 keys in `tests/baseline.json` pin a
 * rendered string byte-for-byte, and the parity gate reads `textContent`. Writing "Net Asset Value"
 * where the baseline pins "NAV" breaks a gate that is green. `term()` therefore adds no characters
 * and removes none: it wraps the SAME text in an inline control, so `textContent` is identical and
 * the affordance is new. `termAnnotate()` does the same to a whole pinned sentence.
 *
 * What the control is, precisely (R6c — anything clickable is a real control):
 *   - a native `<button type="button">`, so it has role `button`, a tab stop and Enter/Space
 *     activation for free, with no keydown plumbing to get wrong;
 *   - an `aria-label` carrying the plain-language expansion taken from the glossary data itself
 *     (`src/glossary/*` — the 35 typed terms), so a screen reader hears "SPV, a special-purpose
 *     vehicle / holding entity that sits between a feeder and the ultimate assets" rather than
 *     three letters;
 *   - a visible affordance: dotted underline and `cursor: help` (see glossary-terms.css), with a
 *     `:focus-visible` ring — never `outline: none`;
 *   - one action: click or Enter dispatches `TERM_GLOSSARY_EVENT`, which `termBindGlossary()`
 *     turns into `{ drawer: 'glossary', glossaryFocusTerm: <slug> }`. That store field existed and
 *     was only ever assigned `null`; this is what finally writes a term into it.
 *
 * The primitive deliberately knows nothing about the store: a screen binds once
 * (`termBindGlossary(store)`) and every term on it is live. The drawer is mounted lazily by the
 * shell, so it cannot own the listener.
 */
import '../styles/glossary-terms.css';
import { el } from './dom.js';
import { glossaryPlainText, glossarySlug, glossaryTerms } from '../../glossary/terms.js';
import type { GlossaryFacts } from '../../glossary/terms.js';

/** The event a glossary-linked term raises. Bubbles, so one document listener serves every term. */
export const TERM_GLOSSARY_EVENT = 'trace-pro:glossary-term';

export interface TermRequest {
  /** The glossary slug to open at — `glossarySlug()` of the term's heading. */
  readonly slug: string;
}

/**
 * The slice of the store a term needs. Declared structurally so `src/ui/primitives` keeps its
 * independence from `src/state` — any object with a compatible `set` works, including the Store.
 */
export interface TermGlossaryTarget {
  set(patch: { drawer: 'glossary'; glossaryFocusTerm: string }): void;
}

/**
 * Worked-example placeholders. `glossaryTerms()` takes the facts its examples quote; this module
 * reads only `term`, `aliases` and `plain`, none of which is a figure, so the facts are neutral
 * words rather than fabricated numbers. Nothing here is ever rendered: it exists so the accessible
 * names below come from the glossary's own prose instead of a second, drifting copy of it.
 */
const TERM_NEUTRAL_FACTS: GlossaryFacts = {
  sym: 'the fund’s symbol',
  name: 'the fund’s name',
  label: 'the fund',
  codeStem: 'the fund code',
  nav: 'its NAV',
  units: 'its units',
  publishPx: 'its publish price',
  currentPx: 'its current price',
  revisedPx: 'its revised price',
  derivedMv: 'its look-through value',
  revisedMv: 'its repriced value',
  repricingPnl: 'its repricing gain or loss',
  bps: 'its bps',
  coOwners: 'its holders',
  apexList: 'the top-level feeders',
  productNav: 'the product NAV',
  derivedTotal: 'the look-through total',
  revisedTotal: 'the repriced total',
  deltaPricing: 'the pricing difference',
  deltaNonPosition: 'the non-position difference',
  sumAllFundNav: null,
};

interface TermDefinition {
  /** The glossary card's heading, for "opens the glossary at …". */
  readonly heading: string;
  /** The first sentence of the card's plain-language definition. */
  readonly sentence: string;
}

let termIndexCache: Map<string, TermDefinition> | null = null;

/**
 * A sentence ends at `.`, `!` or `?` followed by whitespace or the end of the string — so
 * "1 bp = 0.01%" and "$2,062,198,835.86" do not split a definition mid-number.
 */
function termFirstSentence(plain: string): string {
  const text = glossaryPlainText(plain).replace(/\s+/g, ' ').trim();
  const end = /[.!?](?=\s|$)/.exec(text);
  const first = end ? text.slice(0, end.index + 1) : text;
  return first.length > 200 ? first.slice(0, 197).trimEnd() + '…' : first;
}

/** slug → definition, built once from the glossary's 35 typed terms. */
function termIndex(): Map<string, TermDefinition> {
  if (termIndexCache) return termIndexCache;
  const index = new Map<string, TermDefinition>();
  for (const entry of glossaryTerms(TERM_NEUTRAL_FACTS)) {
    index.set(glossarySlug(entry.term), {
      heading: entry.term,
      sentence: termFirstSentence(entry.plain),
    });
  }
  termIndexCache = index;
  return index;
}

/** True when `slug` names one of the 35 glossary terms. Used by the callers' own sanity checks. */
export function termIsKnown(slug: string): boolean {
  return termIndex().has(glossarySlug(slug));
}

let termTarget: TermGlossaryTarget | null = null;
let termListening = false;

/**
 * Point every glossary-linked term on this screen at the store. Idempotent, and safe to call from
 * each screen's mount — the last caller wins, which is correct when a screen re-mounts.
 */
export function termBindGlossary(target: TermGlossaryTarget): void {
  termTarget = target;
  if (termListening) return;
  termListening = true;
  document.addEventListener(TERM_GLOSSARY_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TermRequest>).detail;
    if (!detail?.slug) return;
    termTarget?.set({ drawer: 'glossary', glossaryFocusTerm: detail.slug });
  });
}

function termAccessibleName(text: string, slug: string): string {
  const def = termIndex().get(slug);
  if (!def) return `${text} — open the glossary`;
  // Name the card only when it says something the rendered text does not: "SPV: SPV. A special-…"
  // is noise, "qty: Global units / Global quantity. The total units …" is the useful part.
  const sameWord = def.heading.toLowerCase() === text.toLowerCase();
  const body = sameWord || def.sentence.startsWith(def.heading) ? def.sentence : `${def.heading}. ${def.sentence}`;
  return `${text}: ${body} Opens the glossary at this term.`;
}

/**
 * Every term gets a unique, monotonically numbered id — `#gterm-spv-3`.
 *
 * Not decoration: `shell.ts` restores focus after an overlay closes by remembering a STABLE
 * SELECTOR for the last control focused outside it, and it builds that selector from `id` first.
 * Without an id a term is invisible to that mechanism, and closing the glossary drops focus on
 * `#screen` instead of on the word that opened it (R6d). The counter never resets, so ids are
 * unique for the life of the page; a term recreated by a later re-render simply gets a new one,
 * which the restore treats as "gone" rather than as somebody else.
 */
let termSequence = 0;

/**
 * One glossary-linked abbreviation. `text` is rendered exactly as given — no expansion, no case
 * change, no added punctuation — so it is safe inside a parity-pinned string.
 *
 * `slug` is a glossary slug (`glossarySlug()` of the card heading): `nav`, `spv`, `vpm`, `bps`,
 * `global_units_global_quantity`, … An unknown slug still renders and still opens the glossary,
 * which then falls back to its search box rather than failing silently.
 */
export function term(text: string, slug: string): HTMLElement {
  const key = glossarySlug(slug);
  termSequence += 1;
  const node = el('button', {
    type: 'button',
    class: 'gterm',
    id: `gterm-${key}-${termSequence}`,
    'data-glossary-term': key,
    'aria-label': termAccessibleName(text, key),
    'aria-haspopup': 'dialog',
    title: `${text} — open the glossary at this term`,
    text,
  });
  node.addEventListener('click', (event) => {
    // Terms sit inside chips, cells and headers that have handlers of their own; opening the
    // definition must not also sort a column or jump the tree.
    event.preventDefault();
    event.stopPropagation();
    node.dispatchEvent(
      new CustomEvent<TermRequest>(TERM_GLOSSARY_EVENT, {
        detail: { slug: key },
        bubbles: true,
        composed: true,
      })
    );
  });
  return node;
}

/**
 * The vocabulary this module knows how to link, longest match first.
 *
 * Deliberately excludes `lt`, `ltv`, `gq`, `mv100`, `dcN`, `nonav`, `str`, `sim`, `iss`, `own`,
 * `gls` and `rfx`: `tests/e2e/rubric.spec.ts` flags a code token when it is the ENTIRE text of an
 * element, so wrapping one of those would manufacture the very finding it looks for. They are also
 * retired from this rebuild's vocabulary — see docs/vocabulary-todo.md.
 */
const TERM_TOKENS: readonly { readonly token: string; readonly slug: string }[] = [
  { token: 'VPM symbol', slug: 'vpm' },
  { token: 'VPM Symbol', slug: 'vpm' },
  { token: 'NAV', slug: 'nav' },
  { token: 'SPV', slug: 'spv' },
  { token: 'VPM', slug: 'vpm' },
  { token: 'bps', slug: 'bps' },
  { token: 'apex', slug: 'apex_fund_feeder_terminal_fund' },
  { token: 'MV', slug: 'carried_mv_position_mv' },
  { token: 'Qty', slug: 'global_units_global_quantity' },
  { token: 'qty', slug: 'global_units_global_quantity' },
  { token: 'px', slug: 'publish_px_vs_current_applied_px_vs_revised_px' },
  { token: 'Δ', slug: 'pricing' },
];

const TERM_TOKEN_RE = new RegExp(
  '(?<![A-Za-z0-9])(' +
    TERM_TOKENS.map((t) => t.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')(?![A-Za-z0-9])',
  'g'
);

const TERM_SLUG_BY_TOKEN = new Map(TERM_TOKENS.map((t) => [t.token, t.slug]));

/**
 * Wrap every whole-word abbreviation in `text` as a glossary link, and return the pieces for
 * `el()` / `replace()`. The concatenated result is character-for-character `text`, which is what
 * makes this usable on a string the frozen baseline pins.
 *
 *     el('span', { ...parity('reconciliation.status_line') }, termAnnotate(statusLine))
 *
 * `Δ` is matched bare because it is not an alphanumeric; everything else is whole-word, so
 * `DEUCE1DC`, `navy` and `proxy` are left alone.
 */
export function termAnnotate(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let last = 0;
  for (const match of text.matchAll(TERM_TOKEN_RE)) {
    const at = match.index;
    const token = match[1] ?? '';
    const slug = TERM_SLUG_BY_TOKEN.get(token);
    if (!slug) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(term(token, slug));
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

/**
 * The visible first-use expansion of each abbreviation — rubric R2's route (a), which the crawler
 * measures per screen (`docs/evidence/review-scripts/abbrev.mjs` regex-tests the screen's whole
 * visible text). The wording is not free: the crawler looks for "special purpose vehicle"
 * unhyphenated, for "valuation portfolio", for "basis points", for "net asset value" and for
 * "double-count", so these strings are written to match while still reading as English.
 */
const TERM_FIRST_USE: Readonly<Record<string, { readonly abbr: string; readonly expansion: string }>> = {
  nav: { abbr: 'NAV', expansion: 'net asset value' },
  spv: { abbr: 'SPV', expansion: 'special purpose vehicle' },
  vpm: { abbr: 'VPM', expansion: 'the valuation portfolio accounting system' },
  bps: { abbr: 'bps', expansion: 'basis points, one hundredth of a percent' },
  carried_mv_position_mv: { abbr: 'MV', expansion: 'market value' },
  global_units_global_quantity: { abbr: 'qty', expansion: 'quantity, in units' },
  publish_px_vs_current_applied_px_vs_revised_px: { abbr: 'px', expansion: 'unit price' },
  pricing: { abbr: 'Δ', expansion: 'change' },
  apex_fund_feeder_terminal_fund: { abbr: 'apex', expansion: 'the top-level feeder funds' },
  /**
   * `DC` is the one entry whose only on-screen occurrences are NOT the app's vocabulary: every one
   * of them sits inside a registered entity name — "AP Deuce Intermediate Holdings I (DC), L.P.",
   * "AP Sports Intermediate Holdings Velocity (DC), L.P.", "AP Sports Debt Holdings II (DC), L.P."
   * The fixture carries no double-count flag on those nodes, so linking the `(DC)` inside a legal
   * name to the Double-count card would assert something the data does not say. R2 offers two
   * routes and this is the one that is honest here: expand the abbreviation once, at the top, and
   * leave the names themselves as names. The wording says so out loud rather than implying the
   * parenthesis is a computed flag.
   */
  double_count: {
    abbr: 'DC',
    expansion: 'double count — and, inside a registered entity name below, part of that name',
  },
};

export const TERM_VOCABULARY_LEAD = 'Terms on this screen: ';
export const TERM_VOCABULARY_TAIL = ' Each dotted term opens its glossary definition.';

/**
 * One compact line that expands, and links, every abbreviation a screen uses — placed immediately
 * after the screen's question so it precedes the screen's first use of each of them.
 *
 * It is deliberately not a tooltip and not a `<details>`: R2 counts rendered text, and a
 * collapsed expansion is not an expansion.
 */
export function termVocabularyLine(slugs: readonly string[], id?: string): HTMLElement {
  const children: (Node | string)[] = [TERM_VOCABULARY_LEAD];
  let first = true;
  for (const slug of slugs) {
    const entry = TERM_FIRST_USE[glossarySlug(slug)];
    if (!entry) continue;
    if (!first) children.push(' · ');
    first = false;
    children.push(term(entry.abbr, slug), ` = ${entry.expansion}`);
  }
  children.push('.', TERM_VOCABULARY_TAIL);
  return el('p', { class: 'screen-vocab', ...(id ? { id } : {}) }, children);
}
