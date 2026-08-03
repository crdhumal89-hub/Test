/**
 * Section 3 — "Look-through & market value" (7 terms).
 *
 * The mechanics of flying a value up a structure: how many units exist, what share each parent
 * holds directly, what share reaches the product after every level is multiplied through, and the
 * two market values that share is applied to.
 */
import type { GlossaryFacts, GlossaryTerm } from './terms.js';

export function glossaryLookthroughTerms(f: GlossaryFacts): GlossaryTerm[] {
  return [
    {
      term: 'Global units / Global quantity',
      category: 'ltmv',
      aliases: ['gq', 'units', 'Quantity VPM'],
      plain:
        'The total number of units of a fund in issue across **all** holders — the denominator for ' +
        'every per-unit price.',
      source: 'Position Report “Quantity VPM” summed across holders · field `gq`.',
      method: 'Global units(F) = Σ units of F held by every holder firm-wide.',
      exampleLabel: f.sym,
      example: `Global units = **${f.units}**.`,
      alsoFind: 'global units quantity vpm denominator',
    },
    {
      term: 'Ownership % (Immediate %)',
      category: 'ltmv',
      aliases: ['ownpct', 'Immediate %', 'edge %'],
      plain:
        'A holder’s **direct** share of a fund — how much of the child’s units this one parent holds. ' +
        'It is the % pill on each Structure / Simulator edge.',
      source: 'Position Report units · field `ownpct`.',
      method: 'Ownership % = held units of child ÷ child’s global units.',
      exampleLabel: 'DEUCE2FC (co-owned)',
      example: `DEUCE2FC is held by ${f.coOwners} — the two shares sum to ~100%.`,
      alsoFind: 'ownership immediate percent edge pill share held units',
    },
    {
      term: 'Applied % (Effective ownership)',
      category: 'ltmv',
      aliases: ['applied', 'cumulative %', 'effective %', '% of OBJ'],
      plain:
        'The fraction of a node’s **full** value that ultimately belongs to the product, after ' +
        'multiplying ownership down every level of the chain. It is what rolls a node’s MV up to the ' +
        'product without double-counting.',
      source:
        'Look-through tree · field `applied`; shown on the Ownership Breakout tab as ' +
        '“% of … (cumulative · effective)”.',
      method:
        'Applied % = product of the immediate ownership %s along the path from the product to the node.',
      exampleLabel: 'APAV under APAEV',
      example:
        'APAV’s immediate ownership is 100%, but its Applied % is only ~12.92% — because its parent ' +
        'APAEV is held ~12.92% by ASCON, so only that slice reaches the product.',
      alsoFind: 'applied effective cumulative ownership chain path product',
    },
    {
      term: 'Value of 100% (mv100)',
      category: 'ltmv',
      aliases: ['mv100', '100% MV'],
      plain:
        'The full market value of a node **as if you owned 100%** of it, before applying ownership. ' +
        'Node size on the Structure graph is proportional to this.',
      source: 'Look-through tree · field `mv100`.',
      method: 'Contribution to the product = Applied % × mv100.',
      alsoFind: 'value of 100 percent mv100 node size',
    },
    {
      term: 'Carried MV / Position MV',
      category: 'ltmv',
      aliases: ['carried', 'Current MV of positions', 'MV USD'],
      plain:
        'The market value at which a fund is **carried on its holders’ books** — the “Current MV of ' +
        'positions” line, i.e. what the position is booked at before any repricing.',
      source: 'Position Report “MV USD” / NAV file “Current MV of positions” · field `carried`.',
      method: 'Carried MV = Σ (held units × current mark) across holders, as supplied by the source file.',
      alsoFind: 'carried position mv usd current mv of positions booked',
    },
    {
      term: 'Variance',
      category: 'ltmv',
      aliases: ['gap', 'diff', 'Diff P.U.', 'NAV diff'],
      plain:
        'A general term for the **difference between two views** of the same value. The tool names the ' +
        'specific ones: Repricing P&L (Revised − Derived), Δ Non-position (NAV − Revised), and the ' +
        'price Diff P.U. (Current − Revised px).',
      source: 'Derived in each tab from the two figures being compared.',
      method: 'Variance = value A − value B (see the named gap for which two).',
      alsoFind: 'variance gap difference diff',
    },
    {
      term: 'Look-through',
      category: 'ltmv',
      aliases: ['lookthrough', 'LT', 'see-through', 'trace'],
      plain:
        'Tracing a fund’s value **down through every SPV and holding to the ultimate securities**, ' +
        'weighting by ownership at each step, so you can value and attribute the fund from what it ' +
        'actually owns.',
      source: 'Position Report structure (holder → SPV → security) · the look-through tree.',
      method: 'Recursively expand each holding by its ownership % until only ultimate securities remain.',
      alsoFind: 'look through lookthrough trace underlying securities',
    },
  ];
}
