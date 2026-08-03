/**
 * Section 1 — "The three price columns — start here" (4 terms).
 *
 * This is the section the whole glossary exists for: the original's single most common support
 * question was "why are there three price columns and which one do I send?". The overview card
 * answers it with a side-by-side table built from live figures, then the three individual cards
 * define each column on its own.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossaryPricingTerms(f: GlossaryFacts): GlossaryTerm[] {
  return [
    {
      term: 'Publish px vs Current/Applied px vs Revised px',
      category: 'pricing',
      wide: true,
      aliases: ['three prices', 'why three columns'],
      plain:
        'The Look-Through Pricing table shows **three** unit prices for the same fund because each ' +
        'answers a different question: **Publish** = the price to send today (top-down from NAV); ' +
        '**Current / Applied** = the price the position is being valued at in the view you are on; ' +
        '**Revised** = the price rebuilt bottom-up from the underlyings. When Publish and Revised ' +
        'disagree, you are looking at a pricing break.',
      source: 'Look-Through Pricing tab · columns navPx, curPx, revPx (from the embedded revised set).',
      method: 'See the three rows below — each is value ÷ global units.',
      exampleLabel: f.label,
      priceTable: [
        {
          column: 'Publish px',
          value: f.publishPx,
          build: `NAV ${f.nav} ÷ units ${f.units}`,
          detail: 'Top-down: the fund’s own reported NAV per unit — the price you actually publish / send.',
        },
        {
          column: 'Current px',
          note: '(→ “Applied px” in the After view)',
          value: f.currentPx,
          build: `Derived MV ${f.derivedMv} ÷ units`,
          detail:
            'Today’s as-booked look-through mark per unit. In the After view the same column is ' +
            `relabelled Applied px and shows the revised price ${f.revisedPx}.`,
        },
        {
          column: 'Revised px',
          value: f.revisedPx,
          build: `Revised MV ${f.revisedMv} ÷ units`,
          detail:
            'Bottom-up: rebuilt from the underlyings’ repriced values, flown up through ownership.',
        },
      ],
      example:
        `**Why they differ — the pricing break.** Publish px (${f.publishPx}) ≠ Revised px ` +
        `(${f.revisedPx}): the fund’s own NAV stamp disagrees with the value implied by summing its ` +
        `repriced underlyings, by ${f.repricingPnl} (${f.bps} bps). **That gap is the pricing break** ` +
        '— exactly what this tool surfaces. Current px sits in between: it is those same underlyings ' +
        'at *today’s* marks, before repricing.',
      alsoFind: 'publish applied current revised price column break nav units bottom-up top-down',
    },
    {
      term: 'Publish px',
      category: 'pricing',
      aliases: ['navPx', 'Publish price', 'NAV ÷ units'],
      plain:
        'The official **unit price to publish** for the day — what one unit is worth using the fund’s ' +
        'own reported NAV. It is the emphasised column and does not change between the Before and ' +
        'After views.',
      source: 'NAV Report ENDING_NAV ÷ Position Report global units · field `navPx`.',
      method: 'Publish px = fund NAV ÷ global units (top-down).',
      exampleLabel: f.sym,
      example: `Publish px = NAV ${f.nav} ÷ ${f.units} units = **${f.publishPx}**.`,
      alsoFind: 'publish price unit price to send daily',
    },
    {
      term: 'Current px / Applied px',
      category: 'pricing',
      aliases: ['curPx', 'Current price', 'Applied px', 'position marks'],
      plain:
        'The price the position is **actually being valued at** in the current view. In the **Before** ' +
        'view it is today’s as-booked mark; the *same column* is relabelled **Applied px** in the ' +
        '**After** view and then shows the revised price. That label-swap (Current → Applied) is the ' +
        'usual source of confusion — it is one column, two labels.',
      source:
        'Look-through of the underlyings · field `curPx` (Before) which the table swaps to `revPx` in After.',
      method:
        'Current px (Before) = Derived MV ÷ global units. Applied px (After) = Revised MV ÷ global units.',
      exampleLabel: f.sym,
      example:
        `Current px = Derived MV ${f.derivedMv} ÷ units = **${f.currentPx}**. In the After view this ` +
        `cell shows the revised price ${f.revisedPx}.`,
      alsoFind: 'current applied mark before after label swap',
    },
    {
      term: 'Revised px',
      category: 'pricing',
      aliases: ['revPx', 'Revised price', 'bottom-up price'],
      plain:
        'The **bottom-up NAV-repriced** unit price. Built from the deepest funds upward: each terminal ' +
        'fund prices at NAV ÷ units, then every holder is revalued using its children’s revised ' +
        'prices. Always shown in its own column, in both views.',
      source: 'Bottom-up revised set (revByFund) · field `revPx`.',
      method:
        'Revised px = Revised MV ÷ global units, where Revised MV = Σ (held qty × child revised price) ' +
        '+ own direct securities. A terminal fund’s Revised MV is just its NAV, so its Revised px = ' +
        'NAV ÷ units.',
      exampleLabel: f.sym,
      example: `Revised px = Revised MV ${f.revisedMv} ÷ units = **${f.revisedPx}**.`,
      alsoFind: 'revised bottom up reprice terminal',
    },
  ];
}
