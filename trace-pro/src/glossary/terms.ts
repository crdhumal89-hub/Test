/**
 * The glossary's 35 terms — types, the pinned worked-example facts, and the composition of the
 * six section modules.
 *
 * Ported from the original's `renderGlossary()` (reference/TRACE-Pro-original.html 2235–2500),
 * which is the best-written part of the application. Two things are deliberately preserved:
 *
 *   1. **The original vocabulary inside the definitions.** "Derived MV", "Publish px", "Applied %"
 *      and the rest are the words a controller will still see in the source spreadsheets and in
 *      older screenshots, so the glossary names them and rubric R2 explicitly permits them here.
 *      The rename table (docs/redesign-spec.md §3.1) applies to screens, not to this drawer.
 *   2. **Worked examples computed from live data**, pinned to SPORTHFC and DEUCE2FC exactly as the
 *      original pinned them. Nothing here is a hardcoded figure: the fixture arrives as a
 *      parameter, so a different product or as-of date reprices every example.
 *
 * Emphasis inside the prose uses `**bold**`, `*italic*` and `` `code` `` markers rather than HTML,
 * because no data may reach the DOM through innerHTML. `glossaryPlainText` strips them, and the
 * rendered textContent is therefore exactly the original's — which is what parity is measured on.
 */
import { formatUsd, formatUsdParens, formatCount, formatPercent, formatPrice } from '../domain/money.js';
import type { LegacyPricingFixture, RepricingFixture, RepricingFund } from '../domain/types.js';
import { glossaryPricingTerms } from './terms-pricing.js';
import { glossaryValueTerms } from './terms-value.js';
import { glossaryLookthroughTerms } from './terms-lookthrough.js';
import { glossaryNavTerms } from './terms-nav.js';
import { glossaryStructureTerms } from './terms-structure.js';
import { glossarySourceTerms } from './terms-sources.js';

export type GlossaryCategory = 'pricing' | 'vpl' | 'ltmv' | 'navrec' | 'structown' | 'sources';

export interface GlossarySection {
  key: GlossaryCategory;
  /** The section heading inside the drawer. */
  title: string;
  /** The category chip's label. */
  chip: string;
  /** The small coloured tag stamped on each card, so a card found by search shows its section. */
  tag: string;
}

/** The six sections, in reading order. "The three price columns" is first for a reason. */
export const GLOSSARY_SECTIONS: readonly GlossarySection[] = [
  { key: 'pricing', title: 'The three price columns — start here', chip: 'Pricing', tag: 'Pricing' },
  { key: 'vpl', title: 'Value & P&L columns', chip: 'Value & P&L', tag: 'Value & P&L' },
  { key: 'ltmv', title: 'Look-through & market value', chip: 'Look-through & MV', tag: 'Look-through' },
  { key: 'navrec', title: 'NAV & reconciliation', chip: 'NAV & Reconciliation', tag: 'NAV & Recon' },
  { key: 'structown', title: 'Structure & ownership', chip: 'Structure & Ownership', tag: 'Structure' },
  { key: 'sources', title: 'Sources & systems', chip: 'Sources & Systems', tag: 'Sources' },
];

/** One row of the three-price comparison table on the overview card. */
export interface GlossaryPriceRow {
  column: string;
  /** The label-swap footnote, where the column has two names. */
  note?: string;
  value: string;
  build: string;
  detail: string;
}

export interface GlossaryTerm {
  term: string;
  category: GlossaryCategory;
  aliases: readonly string[];
  /** The plain-language definition. This is the string parity is measured on. */
  plain: string;
  /** Which report or system the number comes from. */
  source: string;
  /** How it is calculated. */
  method: string;
  example?: string;
  exampleLabel?: string;
  priceTable?: readonly GlossaryPriceRow[];
  /** Extra search words that appear in no visible field. Was the original's `hayx`. */
  alsoFind?: string;
  /** An overview card: spans the grid and floats to the top of its section. */
  wide?: boolean;
}

/** Every figure the worked examples quote, formatted once. Was the original's `ex*` locals. */
export interface GlossaryFacts {
  sym: string;
  name: string;
  /** `SYM · Full fund name` — the worked-example subtitle. */
  label: string;
  /** The symbol up to its first separator, as the Fund Code example quotes it. */
  codeStem: string;
  nav: string;
  units: string;
  publishPx: string;
  currentPx: string;
  revisedPx: string;
  derivedMv: string;
  revisedMv: string;
  repricingPnl: string;
  bps: string;
  /** `SPORT 87.08% + ASCON 12.92%` — the co-ownership example. */
  coOwners: string;
  apexList: string;
  productNav: string;
  derivedTotal: string;
  revisedTotal: string;
  deltaPricing: string;
  deltaNonPosition: string;
  /** Σ of every fund's NAV — the double-count total. Null when the legacy model is absent. */
  sumAllFundNav: string | null;
}

/**
 * The parity key for a term: lowercased, every run of non-alphanumerics collapsed to one `_`.
 * `Δ Non-position` → `non_position`; `Value of 100% (mv100)` → `value_of_100_mv100`.
 */
export function glossarySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The same string with its emphasis markers removed — i.e. exactly what the DOM will read. */
export function glossaryPlainText(marked: string): string {
  return marked.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

/**
 * The lowercased search haystack for one card: term, aliases, definition, source, method and the
 * extra find-words. Deliberately *excludes* the worked example, as the original did — otherwise a
 * search for a dollar amount would match every card that quotes one.
 */
export function glossaryHaystack(term: GlossaryTerm): string {
  return glossaryPlainText(
    [term.term, term.aliases.join(' '), term.plain, term.source, term.method, term.alsoFind ?? ''].join(' ')
  )
    .toLowerCase()
    .replace(/["<>]/g, '');
}

/** The fund the examples are pinned to: SPORTHFC, or the first priced non-terminal fund. */
function glossaryExampleFund(repricing: RepricingFixture): RepricingFund | null {
  return (
    repricing.funds.find((f) => f.code === 'SPORTHFC') ??
    repricing.funds.find((f) => f.navPx != null && f.curPx != null && f.revPx != null && !f.terminal) ??
    repricing.funds[0] ??
    null
  );
}

const EM = '—';

export function glossaryFacts(
  repricing: RepricingFixture,
  legacyPricing?: LegacyPricingFixture | null
): GlossaryFacts {
  const ex = glossaryExampleFund(repricing);
  const sym = ex?.sym ?? ex?.code ?? EM;
  const name = ex?.name ?? '';
  const nav = ex?.nav ?? null;
  const pnl = ex?.pnlLevel ?? 0;
  const bps = nav ? (pnl / nav) * 1e4 : 0;

  const deuce = repricing.funds.find((f) => f.code === 'DEUCE2FC');
  const coOwners = deuce?.holders.length
    ? deuce.holders.map((h) => `${h.h} ${formatPercent(h.ownpct)}`).join(' + ')
    : 'SPORT 87.08% + ASCON 12.92%';

  const sumAll = legacyPricing?.recon?.sumAllFundNAV ?? null;

  return {
    sym,
    name,
    label: sym + (name ? ' · ' + name : ''),
    codeStem: sym.replace(/[^A-Za-z0-9].*$/, ''),
    nav: formatUsd(nav),
    units: formatCount(ex?.gq ?? null),
    publishPx: formatPrice(ex?.navPx ?? null),
    currentPx: formatPrice(ex?.curPx ?? null),
    revisedPx: formatPrice(ex?.revPx ?? null),
    derivedMv: formatUsd(ex?.ltv ?? null),
    revisedMv: formatUsd(ex?.rev ?? null),
    repricingPnl: formatUsdParens(pnl),
    bps: bps.toFixed(0),
    coOwners,
    apexList: repricing.apex.join(', '),
    productNav: formatUsd(repricing.N),
    derivedTotal: formatUsd(repricing.D),
    revisedTotal: formatUsd(repricing.R),
    deltaPricing: formatUsdParens(repricing.dPricing),
    deltaNonPosition: formatUsdParens(repricing.dNonPos),
    sumAllFundNav: sumAll == null ? null : formatUsd(sumAll),
  };
}

/**
 * All 35 terms, in section order and alphabetised within each section, with the overview cards
 * floated to the top of their section — the original's `glsSortDOM()` ordering, done in data.
 */
export function glossaryTerms(facts: GlossaryFacts): GlossaryTerm[] {
  const all = [
    ...glossaryPricingTerms(facts),
    ...glossaryValueTerms(facts),
    ...glossaryLookthroughTerms(facts),
    ...glossaryNavTerms(facts),
    ...glossaryStructureTerms(facts),
    ...glossarySourceTerms(facts),
  ];
  const sortKey = (t: GlossaryTerm): string => t.term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const out: GlossaryTerm[] = [];
  for (const section of GLOSSARY_SECTIONS) {
    const inSection = all.filter((t) => t.category === section.key);
    inSection.sort((a, b) => {
      const wide = (a.wide ? 0 : 1) - (b.wide ? 0 : 1);
      if (wide !== 0) return wide;
      const ka = sortKey(a);
      const kb = sortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    out.push(...inSection);
  }
  return out;
}

/** How many terms the glossary is expected to carry. Asserted by the drawer, not assumed. */
export const GLOSSARY_TERM_COUNT = 35;
