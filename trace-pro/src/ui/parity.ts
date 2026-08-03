/**
 * Parity tagging.
 *
 * The rebuild moves, renames and re-homes almost everything, so the verification harness cannot
 * find a figure by its position in the DOM. Instead every figure carries the SEMANTIC key it
 * answers to, straight from the frozen `parity-map.json`:
 *
 *     <div class="wf-value" data-parity="reconciliation.waterfall.derived_mv">$2,060,224,441</div>
 *
 * That makes parity self-documenting in the markup — you can see, at the point a figure is
 * rendered, which frozen baseline value it is answerable to — and it means the harness needs no
 * knowledge of our layout at all.
 *
 * Some keys are view-dependent: the same element answers to
 * `reconciliation.waterfall.derived_mv` under current marks and
 * `reconciliation.after.repriced_mv` under the repriced basis. `parityKey` resolves that, so the
 * choice is made in one place rather than at every call site.
 */
import type { PricingView } from '../domain/types.js';

/** Attribute name, used by both the app and the harness. */
export const PARITY_ATTR = 'data-parity';

/** Spread into an `el()` attribute bag: `el('div', { ...parity('some.key') })`. */
export function parity(key: string | null): Record<string, string> {
  return key ? { [PARITY_ATTR]: key } : {};
}

/**
 * Slots on the Reconciliation waterfall whose key depends on the active pricing basis. The
 * before-view key is the primary one in the baseline; the after-view key is its counterpart.
 */
const RECONCILIATION_BY_VIEW: Record<string, { before: string; after: string | null }> = {
  start_label: { before: 'reconciliation.waterfall.start_label', after: 'reconciliation.after.start_label' },
  start_value: { before: 'reconciliation.waterfall.derived_mv', after: 'reconciliation.after.repriced_mv' },
  start_basis: { before: 'reconciliation.waterfall.derived_basis', after: null },
  pricing_label: { before: 'reconciliation.waterfall.delta_pricing_label', after: null },
  pricing_value: { before: 'reconciliation.waterfall.delta_pricing_usd', after: 'reconciliation.after.delta_pricing_usd' },
  pricing_bps: { before: 'reconciliation.waterfall.delta_pricing_bps', after: null },
  pricing_basis: { before: null as unknown as string, after: 'reconciliation.after.delta_pricing_note' },
  revised_value: { before: 'reconciliation.waterfall.revised_mv', after: 'reconciliation.after.revised_mv' },
  revised_basis: { before: 'reconciliation.waterfall.revised_basis', after: null },
  nonposition_label: { before: 'reconciliation.waterfall.delta_nonposition_label', after: null },
  nonposition_value: {
    before: 'reconciliation.waterfall.delta_nonposition_usd',
    after: 'reconciliation.after.delta_nonposition_usd',
  },
  nonposition_bps: { before: 'reconciliation.waterfall.delta_nonposition_bps', after: null },
  nav_value: { before: 'reconciliation.waterfall.nav', after: 'reconciliation.after.nav' },
  nav_basis: { before: 'reconciliation.waterfall.nav_basis', after: null },
  tie_statement: { before: 'reconciliation.tie.statement', after: 'reconciliation.after.tie_statement' },
  tie_status: { before: 'reconciliation.tie.status', after: null },
};

/** Resolve a view-dependent Reconciliation slot to its key, or null when that view has none. */
export function reconciliationKey(slot: keyof typeof RECONCILIATION_BY_VIEW, view: PricingView): string | null {
  const entry = RECONCILIATION_BY_VIEW[slot];
  if (!entry) return null;
  const key = view === 'after' ? entry.after : entry.before;
  return key ?? null;
}
