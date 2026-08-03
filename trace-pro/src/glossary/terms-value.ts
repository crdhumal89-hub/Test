/**
 * Section 2 — "Value & P&L columns" (4 terms).
 *
 * The two market-value columns, the difference between them, and the unit that difference is
 * judged in. `bps` lives here rather than in a maths section because it is only ever read next to
 * a value column.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossaryValueTerms(f: GlossaryFacts): GlossaryTerm[] {
  return [
    {
      term: 'Derived MV / Repriced MV',
      category: 'vpl',
      aliases: ['ltv', 'Derived MV', 'Repriced MV', 'Derived market value'],
      plain:
        'The **look-through market value** of a fund — the sum of everything it owns, valued at ' +
        '**today’s** marks and weighted by ownership at each level. In the After view the column is ' +
        'relabelled **Repriced MV** and shows the same node at revised prices.',
      source: 'Position Report look-through roll-up · field `ltv` (After shows `rev`).',
      method:
        'Derived MV(F) = own direct securities’ MV + Σ (ownership % × Derived MV of each child), ' +
        'recursing to the ultimate securities.',
      exampleLabel: f.sym,
      example: `Derived MV = **${f.derivedMv}** (its holding of SPORTD plus its direct securities, at current marks).`,
      alsoFind: 'derived repriced market value look through roll up',
    },
    {
      term: 'Revised MV',
      category: 'vpl',
      aliases: ['rev', 'Revised market value', 'NAV-repriced MV'],
      plain:
        'The fund’s market value **after** bottom-up NAV repricing — every child valued at its revised ' +
        'price instead of its current mark.',
      source: 'Bottom-up revised set (revByFund) · field `rev`.',
      method:
        'Revised MV(F) = own direct securities + Σ (held qty × child revised price). Terminal fund: ' +
        'Revised MV = its NAV.',
      exampleLabel: f.sym,
      example: `Revised MV = **${f.revisedMv}**, vs Derived MV ${f.derivedMv} — a ${f.repricingPnl} repricing uplift.`,
      alsoFind: 'revised market value nav repriced',
    },
    {
      term: 'Repricing P&L / P&L (reconciled)',
      category: 'vpl',
      aliases: ['pnlLevel', 'Level P&L', 'Δ Pricing at level'],
      plain:
        'The value change from repricing this fund’s holdings to their revised prices — **Revised MV ' +
        'minus Derived MV**. In the After view every level reconciles, so this column reads **$0** and ' +
        'is relabelled “P&L (reconciled)”.',
      source: 'Look-Through Pricing tab · field `pnlLevel` (= dPricing at that level).',
      method:
        'Repricing P&L = Revised MV − Derived MV. Per holding = held qty × (revised px − current px), ' +
        'which rolls up to the level total; direct securities reprice to 0.',
      exampleLabel: f.sym,
      example: `Repricing P&L = ${f.revisedMv} − ${f.derivedMv} = **${f.repricingPnl}**.`,
      alsoFind: 'repricing pnl p&l reconciled level revised minus derived',
    },
    {
      term: 'bps',
      category: 'vpl',
      aliases: ['basis points', 'pricing bps'],
      plain:
        'The size of a gap expressed **relative to NAV**, in basis points (1 bp = 0.01%). It lets you ' +
        'compare a dollar gap across funds of very different sizes; the flag chip turns amber at ' +
        '≥25 bps and red at ≥50 bps.',
      source: 'Computed in the pricing / reconciliation tables from the gap and NAV.',
      method: 'bps = gap ÷ NAV × 10,000. On the Pricing tab the gap is the Repricing P&L.',
      exampleLabel: f.sym,
      example: `bps = ${f.repricingPnl} ÷ ${f.nav} × 10,000 = **${f.bps} bps**.`,
      alsoFind: 'bps basis points gap over nav',
    },
  ];
}
