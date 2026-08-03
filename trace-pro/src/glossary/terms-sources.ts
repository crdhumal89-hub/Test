/**
 * Section 6 — "Sources & systems" (4 terms).
 *
 * Where the numbers come from before TRACE-Pro touches them. Two of the four SOURCE lines are the
 * only place the port deviates from the original wording: the original pointed at "the Sources bar,
 * left / right", a permanent strip that is now the Data sources drawer (docs/redesign-spec.md §3.1),
 * so pointing at the bar would send a reader to a control that no longer exists.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossarySourceTerms(_facts: GlossaryFacts): GlossaryTerm[] {
  return [
    {
      term: 'Position Report',
      category: 'sources',
      aliases: ['pos report', 'AAALT', 'structure & units'],
      plain:
        'The **.xlsx that defines the structure and units** — who holds what, how many units, and the ' +
        'ultimate securities.',
      source: '“Position Report By Fund” .xlsx (Data sources drawer, first upload slot).',
      method:
        'Provides Fund Entity/Code, SPV Fund Code, Security Code/name, Quantity VPM (units), MV USD — ' +
        'driving ownership %, look-through and Derived MV.',
      alsoFind: 'position report xlsx structure units source sources bar',
    },
    {
      term: 'NAV Report',
      category: 'sources',
      aliases: ['NAV file', 'pivot', 'trial balance'],
      plain:
        'The **.csv that supplies each fund’s NAV** — the source of truth for prices and the Product NAV.',
      source: '“NAV file” .csv (Data sources drawer, second upload slot).',
      method:
        'Provides PRODUCT / FUND_CODE / ENDING_NAV (plus units and current/revised px in the pivot) — ' +
        'driving Publish px and the NAV reconciliation.',
      alsoFind: 'nav report csv ending_nav pivot source price sources bar',
    },
    {
      term: 'VPM',
      category: 'sources',
      aliases: ['VPM accounting', 'symbol source'],
      plain:
        'The **accounting / valuation system** the symbols and quantities come from — hence “Quantity ' +
        'VPM” and “VPM symbol”.',
      source: 'VPM (feeds the Position Report fields).',
      method: 'Provides the VPM symbol and the unit quantities used throughout the tool.',
      alsoFind: 'vpm accounting valuation system symbol quantity',
    },
    {
      term: 'Allocation Tracker',
      category: 'sources',
      aliases: ['allocation', 'ownership allocation'],
      plain:
        'The reference that governs **how a fund’s units are split across its parents** (the ' +
        'allocation of ownership). It is what co-owned funds are checked against.',
      source:
        'Ownership-allocation reference; in TRACE-Pro the effective allocation is derived directly from ' +
        'the Position Report (held units ÷ global units).',
      method: 'Cross-checks each holder’s immediate ownership % so co-owned funds reconcile to ~100%.',
      alsoFind: 'allocation tracker ownership split parents co-owned reconcile',
    },
  ];
}
