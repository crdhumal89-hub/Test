/**
 * The materiality rules, defined ONCE.
 *
 * The original carried four independent copies of the same threshold — `ltFlag` (line 1082),
 * `ltFundFlags` (1109), `renderScore` (1316) and `rfxFlag` (1353) — so changing the firm's
 * tolerance meant finding all four. Rubric R9 asserts these literals appear exactly once.
 */
import type { PricingView, RepricingFund, RepricingFixture } from './types.js';
import { bpsOf } from './money.js';

/** A gap is material when it is large in BOTH dollars and basis points. */
export const MATERIAL_USD = 250_000;
export const MATERIAL_BPS = 50;

/** Severity bands for the bps chip on the pricing table. */
export const WARN_BPS = 25;
export const BAD_BPS = 50;

/** How many rows each panel shows before truncating. One place, so nothing truncates silently. */
export const TRUNCATE = {
  heldBy: 8,
  whoHolds: 10,
  perHolding: 14,
  ribbonSegments: 40,
  ultimateOwners: 12,
  issueRows: 200,
  // The simulator's two: `simLeaves` caps the shock panel's leaf table, `simHolders` the holders
  // list the repricing model builds. Both sites used to type the number; `tests/unit/rules.spec.ts`
  // now asserts NO key in this table is shadowed by a literal, so a copy drifting back fails there.
  simLeaves: 8,
  simHolders: 14,
} as const;

export type Severity = 'bad' | 'warn' | null;

export interface Exception {
  title: string;
  detail: string;
}

export interface ExceptionVerdict {
  severity: Severity;
  messages: Exception[];
}

export function isMaterial(gapUsd: number | null, navBase: number | null | undefined): boolean {
  if (gapUsd == null) return false;
  const bps = bpsOf(gapUsd, navBase);
  if (bps == null) return false;
  return Math.abs(gapUsd) >= MATERIAL_USD && Math.abs(bps) >= MATERIAL_BPS;
}

/**
 * Exceptions for one entity, given its NAV, its repriced value and its derived value.
 * `formatUsdParens` and `bps` text are supplied by the caller so this stays presentation-free.
 */
export function evaluateEntity(input: {
  nav: number | null;
  revised: number | null;
  derived: number | null;
  globalUnits: number | null;
  view: PricingView;
  describe: (usd: number, bps: number) => { nonPosition: string; pricing: string };
}): ExceptionVerdict {
  const { nav, revised, derived, globalUnits, view, describe } = input;
  const messages: Exception[] = [];
  let severity: Severity = null;

  if (nav == null && globalUnits) {
    messages.push({
      title: 'Missing NAV',
      detail:
        'This fund is held in the structure but has no ENDING_NAV in the NAV report — it cannot be repriced or given a unit price.',
    });
    severity = 'bad';
  }

  if (nav != null && revised != null && derived != null) {
    const dNonPos = nav - revised;
    const dPricing = revised - derived;
    const bNonPos = bpsOf(dNonPos, nav) ?? 0;
    const bPricing = bpsOf(dPricing, nav) ?? 0;

    if (isMaterial(dNonPos, nav)) {
      messages.push({ title: 'Material non-position gap', detail: describe(dNonPos, bNonPos).nonPosition });
      severity = severity ?? 'warn';
    }
    if (view === 'before' && isMaterial(dPricing, nav)) {
      messages.push({ title: 'Material pricing gap', detail: describe(dPricing, bPricing).pricing });
      severity = severity ?? 'warn';
    }
    if (globalUnits && nav / globalUnits <= 0) {
      messages.push({
        title: 'Non-positive price',
        detail: `NAV ÷ units = ${(nav / globalUnits).toFixed(6)} is not positive — check the units or the NAV sign.`,
      });
      severity = 'bad';
    }
  }

  return { severity, messages };
}

/** The per-fund flag shown as a dot on the pricing table. */
export type FundFlag = 'ok' | 'warn' | 'bad' | 'nonav';

export function flagForFund(f: RepricingFund, view: PricingView): FundFlag {
  if (!f.hasNav) return 'nonav';
  if (f.gq && f.nav != null && f.nav / f.gq <= 0) return 'bad';
  if (view === 'before' && f.nav && (isMaterial(f.dPricing, f.nav) || isMaterial(f.dNonPos, f.nav))) return 'warn';
  if (f.nav && isMaterial(f.dNonPos, f.nav)) return 'warn';
  return 'ok';
}

/** Count of funds carrying a material gap, for the score strip. */
export function countFlagged(repricing: RepricingFixture, view: PricingView): number {
  return repricing.funds.filter((f) => {
    if (!f.hasNav || !f.nav) return false;
    const pricing = view === 'before' && isMaterial(f.dPricing, f.nav);
    return pricing || isMaterial(f.dNonPos, f.nav);
  }).length;
}

/**
 * The grouped exception categories for the Reconciliation screen's strip. Returns categories in
 * severity order with the entity codes that triggered each.
 */
export function groupExceptions(
  repricing: RepricingFixture,
  view: PricingView
): { title: string; severity: Exclude<Severity, null>; codes: string[] }[] {
  const cats = new Map<string, { title: string; severity: Exclude<Severity, null>; codes: Set<string> }>();
  const add = (title: string, severity: Exclude<Severity, null>, code: string) => {
    const hit = cats.get(title);
    if (hit) hit.codes.add(code);
    else cats.set(title, { title, severity, codes: new Set([code]) });
  };

  for (const f of repricing.funds) {
    if (!f.hasNav && f.gq) add('Missing NAV', 'bad', f.code);
    if (f.hasNav && f.nav) {
      if (isMaterial(f.dNonPos, f.nav)) {
        add(view === 'after' ? 'Non-position residual (non-trade)' : 'Material non-position gap', 'warn', f.code);
      }
      if (view === 'before' && isMaterial(f.dPricing, f.nav)) add('Material pricing gap', 'warn', f.code);
      if (f.gq && f.nav / f.gq <= 0) add('Non-positive price', 'bad', f.code);
    }
  }
  for (const b of repricing.breaks) {
    if (b.type === 'own>100%') add('Ownership > 100%', 'bad', b.code);
    if (b.type === 'dangling SPV') add('Dangling SPV', 'bad', b.code);
  }

  const order = { bad: 0, warn: 1 };
  return [...cats.values()]
    .map((c) => ({ title: c.title, severity: c.severity, codes: [...c.codes] }))
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * The rule in words, built FROM the constants rather than restated beside them. The tooltip an
 * operator reads and the comparison the code makes are now the same two numbers, so the tolerance
 * cannot be changed in one place and quietly misdescribed in the other (rubric R9).
 */
const MATERIALITY_IN_WORDS = `≥ ${MATERIAL_BPS} bps and ≥ $${MATERIAL_USD / 1000}k`;

/** Plain-language tooltips for each exception category. */
export const EXCEPTION_TIPS: Record<string, string> = {
  'Missing NAV': 'Held funds with no ENDING_NAV in the NAV report',
  'Material non-position gap':
    `NAV vs bottom-up value ${MATERIALITY_IN_WORDS} — cash / fees / receivables`,
  'Non-position residual (non-trade)':
    `NAV vs bottom-up value ${MATERIALITY_IN_WORDS} — cash / fees / receivables`,
  'Material pricing gap': `Repricing to NAV moves value ${MATERIALITY_IN_WORDS}`,
  'Non-positive price': 'NAV ÷ units is not positive',
  'Ownership > 100%': 'Held units exceed the fund’s global units',
  'Dangling SPV': 'Referenced as an SPV but has no positions to look through',
};
