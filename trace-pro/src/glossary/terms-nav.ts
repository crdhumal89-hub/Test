/**
 * Section 4 — "NAV & reconciliation" (10 terms).
 *
 * The additive chain the whole product rests on, plus the two differences in it, plus the words the
 * flags use. The overview card ("The additive reconciliation") floats to the top of the section
 * because every other term in it is a line of that one addition.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossaryNavTerms(f: GlossaryFacts): GlossaryTerm[] {
  const doubleCountNote = f.sumAllFundNav
    ? ` (Σ of all funds’ NAV = ${f.sumAllFundNav} — the double-count total, wrong for the product.)`
    : '';
  return [
    {
      term: 'NAV',
      category: 'navrec',
      aliases: ['Net Asset Value', 'ENDING_NAV', 'Ending NAV'],
      plain:
        'A fund’s **net asset value** — assets minus liabilities — as reported. It is the source of ' +
        'truth for the publish price.',
      source: 'NAV Report · per-fund ENDING_NAV column (navByFund).',
      method: 'Reported figure, not recomputed. Publish px = NAV ÷ units.',
      alsoFind: 'nav net asset value ending',
    },
    {
      term: 'Product NAV',
      category: 'navrec',
      aliases: ['N', 'Apex NAV', 'Σ apex ENDING_NAV'],
      plain:
        'The **product’s own NAV** — the sum of the NAVs of its top (“apex” / feeder) funds only. It ' +
        'is **not** the sum of every fund’s NAV.',
      source: 'NAV Report · Σ ENDING_NAV over the apex funds · field `N`.',
      method:
        `Product NAV = Σ ENDING_NAV of apex funds (${f.apexList}) = **${f.productNav}**.` + doubleCountNote,
      alsoFind: 'product nav apex sum feeder 2062198835',
    },
    {
      term: 'Apex fund (feeder) & terminal fund',
      category: 'navrec',
      aliases: ['apex', 'feeder', 'terminal'],
      plain:
        'An **apex** fund is a top-of-structure feeder the product holds directly (nothing above it ' +
        'inside the product); its NAV sums to the Product NAV. A **terminal** fund is the deepest end ' +
        '— no priced children — so it prices straight at NAV ÷ units and repricing starts there.',
      source: 'Look-through tree topology (apex list; terminal flag).',
      method: 'Apex = held by the product but not itself held inside it. Terminal = has no child funds to look through.',
      example: `Apex funds: ${f.apexList}.`,
      alsoFind: 'apex feeder terminal top deepest',
    },
    {
      term: 'Δ Pricing',
      category: 'navrec',
      aliases: ['dPricing', 'Delta Pricing', 'Revised − Derived'],
      plain:
        'The **product-level pricing adjustment** — how much value moves when you reprice everything ' +
        'bottom-up to NAV, versus today’s marks.',
      source: 'Reconciliation · field `dPricing`.',
      method: `Δ Pricing = Revised MV − Derived MV = ${f.revisedTotal} − ${f.derivedTotal} = **${f.deltaPricing}**.`,
      alsoFind: 'delta pricing revised minus derived adjustment',
    },
    {
      term: 'Δ Non-position',
      category: 'navrec',
      aliases: ['dNonPos', 'Delta Non-position', 'NAV − Revised', 'non-trade'],
      plain:
        'The part of NAV that is **not in the positions file at all** — cash, fees payable, ' +
        'receivables. It is what remains after repricing reconciles the positions; it is **not** a ' +
        'pricing break.',
      source: 'Reconciliation · field `dNonPos`.',
      method: `Δ Non-position = NAV − Revised MV = ${f.productNav} − ${f.revisedTotal} = **${f.deltaNonPosition}**.`,
      alsoFind: 'delta non position cash fees receivables non-trade',
    },
    {
      term: 'Other / Non-position component',
      category: 'navrec',
      aliases: ['otherComp', 'Other Component of NAV'],
      plain:
        'The same idea at the **single-fund** level — the slice of a fund’s NAV not represented by its ' +
        'positions (cash / fees / receivables).',
      source: 'NAV file “Other Component of NAV” · field `otherComp`.',
      method: 'Other component = NAV − Carried MV of positions.',
      alsoFind: 'other component non position cash fees single fund',
    },
    {
      term: 'The additive reconciliation',
      category: 'navrec',
      wide: true,
      aliases: ['waterfall', 'bridge', 'tie-out'],
      plain:
        'TRACE-Pro reconciles the product with one additive chain: **Derived MV + Δ Pricing = Revised ' +
        'MV, then + Δ Non-position = NAV.** Nothing is recomputed by the Before/After toggle — it only ' +
        'switches which pre-computed set is shown — and Product NAV is untouched.',
      source: 'Embedded revised set (D, dPricing, R, dNonPos, N).',
      method:
        `${f.derivedTotal} + ${f.deltaPricing} = ${f.revisedTotal}, then + ${f.deltaNonPosition} = ` +
        `**${f.productNav}** (Product NAV).`,
      alsoFind: 'additive reconciliation waterfall bridge derived pricing revised non position nav tie',
    },
    {
      term: 'Reconciled',
      category: 'navrec',
      aliases: ['in tol', 'tie', '$0'],
      plain:
        'A level is **reconciled** when its pricing gap is ~$0 — the revised value equals the derived ' +
        'value, so no pricing break remains. Shown as $0 / green in the After view.',
      source: 'Pricing & LT tab flags.',
      method: 'Reconciled when |Repricing P&L| ≈ 0 (After repricing, every level ties).',
      alsoFind: 'reconciled in tolerance tie zero green',
    },
    {
      term: 'Exception / break',
      category: 'navrec',
      aliases: ['flag', 'pricing break', 'exception', 'warn'],
      plain:
        'A fund flagged because a gap is **material**. A **pricing break** specifically means Publish ' +
        'px (NAV ÷ units) disagrees with the bottom-up Revised px.',
      source: 'Pricing / LT flag logic & the Issue Log.',
      method: 'Exception when |gap| ≥ 50 bps and |$ gap| ≥ $250,000 (amber warning from ≥ 25 bps).',
      alsoFind: 'exception break flag material threshold 50 bps 250000',
    },
    {
      term: 'Before vs After Pricing',
      category: 'navrec',
      aliases: ['pricing view', 'toggle', 'pm-before', 'pm-after'],
      plain:
        'A global view toggle (top-right). **Before** = today’s as-booked reality (current marks, ' +
        'Derived MV, pricing gap open). **After** = the ideal fully-repriced state (every holding at ' +
        'its revised price; pricing gap ≈ $0). It changes several column labels: Current px→Applied ' +
        'px, Derived MV→Repriced MV, Repricing P&L→P&L (reconciled).',
      source: 'Pre-computed Before/After sets in the embedded revised artifact.',
      method: `Presentation switch only — no recompute; Product NAV stays ${f.productNav}.`,
      alsoFind: 'before after pricing toggle view applied repriced label',
    },
  ];
}
