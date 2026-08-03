/**
 * Section 5 — "Structure & ownership" (6 terms).
 *
 * The identifiers that join the two source files together, the entity types between a feeder and a
 * security, and the two things that go wrong: a code that resolves to nothing, and a NAV counted
 * twice.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossaryStructureTerms(f: GlossaryFacts): GlossaryTerm[] {
  const notSumAll = f.sumAllFundNav ? `, not Σ all funds (${f.sumAllFundNav})` : '';
  return [
    {
      term: 'SPV',
      category: 'structown',
      aliases: ['Special Purpose Vehicle', 'SPV Fund Code', 'holding vehicle'],
      plain:
        'A **special-purpose vehicle** / holding entity that sits between a feeder and the ultimate ' +
        'assets. In the Structure graph these are the intermediate “SPV / holding” nodes.',
      source: 'Position Report “SPV Fund Code” / the SPV’s security description.',
      method: 'A structural node, valued by looking through to what it holds.',
      alsoFind: 'spv special purpose vehicle holding intermediate',
    },
    {
      term: 'Fund Code',
      category: 'structown',
      aliases: ['fc', 'FUND_CODE'],
      plain:
        `The short code that identifies a fund or SPV (e.g. ${f.codeStem}, DEUCE2FC). It is the ` +
        '**join key** between the Position Report and the NAV Report.',
      source: 'Position Report “Fund Code” / NAV Report “FUND_CODE”.',
      method:
        'Identifier only — never the “Fund Entity”, which is the product and is identical on every row.',
      alsoFind: 'fund code identifier join key fund_code',
    },
    {
      term: 'VPM Symbol',
      category: 'structown',
      aliases: ['sym', 'symbol', 'VPM symbol'],
      plain:
        `The trading / accounting **symbol** for a fund or SPV (e.g. “${f.sym}”), from the VPM ` +
        'accounting system. Shown in the Symbol column.',
      source: 'Position Report / VPM · field `sym`.',
      method: 'Mapped per fund code; used as the human-facing security label.',
      alsoFind: 'vpm symbol sym trading accounting label',
    },
    {
      term: 'Co-ownership / multi-parent',
      category: 'structown',
      aliases: ['co-owned', 'multi-parent', 'shared holding'],
      plain:
        'When **more than one parent** holds the same fund. Each parent’s share is its ownership %, ' +
        'and the shares sum to ~100%.',
      source: 'Position Report edges (multiple holders → one child).',
      method: 'Each edge = held units ÷ child global units; Σ over parents ≈ 100%.',
      exampleLabel: 'DEUCE2FC',
      example: `DEUCE2FC — ${f.coOwners}.`,
      alsoFind: 'co ownership multi parent shared deuce2fc',
    },
    {
      term: 'Missing Linked Security',
      category: 'structown',
      aliases: ['dangling SPV', 'missing SPV code', 'no NAV', 'unmapped'],
      plain:
        'A holding that points to a linked fund / SPV code the source files **cannot resolve** — ' +
        'either the SPV code has no positions beneath it (nothing to look through) or the fund has no ' +
        'ENDING_NAV. Surfaced in the Issue Log.',
      source:
        'Issue Log buckets “Missing / dangling SPV code” and the “no NAV” break · field `breaks`.',
      method: 'Flagged when a referenced code has no matching positions and/or no NAV.',
      alsoFind: 'missing linked security dangling spv unmapped no nav break',
    },
    {
      term: 'Double-count',
      category: 'structown',
      aliases: ['double count', 'Incomplete look-through'],
      plain:
        'The error of **adding up NAVs that already contain each other** — summing every fund’s NAV ' +
        'counts a parent *and* its children, hugely overstating the total. TRACE-Pro avoids it by ' +
        'summing only apex funds and by looking through with ownership %.',
      source:
        'Concept · Issue Log bucket “Incomplete look-through (double-count flag, nothing beneath)”.',
      method:
        `Product NAV = Σ apex NAV (${f.productNav})${notSumAll}; look-through weights each node by ` +
        'Applied %.',
      alsoFind: 'double count incomplete look through parent children overstate',
    },
  ];
}
