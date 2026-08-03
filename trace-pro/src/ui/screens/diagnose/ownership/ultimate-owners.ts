/**
 * The ultimate-owner rollup: every top-of-chain parent of the searched position, with its effective
 * share and the units that share represents.
 *
 * Also the honesty layer for this lens. The original's footer asserts that ownership "sums to 100%"
 * everywhere, verified to conserve. It does not: this module measures the claim against the shipped
 * universe and reports the entities where it fails, rather than repeating the assurance.
 */
import { TRUNCATE } from '../../../../domain/exceptions.js';
import { formatCount, formatPercent } from '../../../../domain/money.js';
import type { OwnershipGraph } from '../../../../domain/ownership.js';
import {
  displayName,
  effectiveOwners,
  immediateHolders,
  totalQuantity,
} from '../../../../domain/ownership.js';
import { el, replace, emptyState } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';

export type OwnershipShares = Map<string, Map<string, number>>;

/**
 * The two sentences defining the two percentage columns, true of any data. The opening term is the
 * renamed column head, exactly as declared for `ownership.APPOURI.footnote` in docs/rename-map.json.
 */
const OWNERSHIP_COLUMN_DEFINITIONS =
  'Direct share = holder qty ÷ total qty of the entity in the row below. ' +
  'Cumulative % chains up the path (shown when you click a row).';

/** Does ownership close for the position on screen? Measured, never assumed. */
export interface OwnershipIntegrity {
  sumImmediate: number;
  sumUltimate: number;
  closesImmediate: boolean;
  closesUltimate: boolean;
  immediateCount: number;
  ultimateCount: number;
  top5: number;
}

export function ownershipIntegrityOf(
  graph: OwnershipGraph,
  shares: OwnershipShares,
  code: string
): OwnershipIntegrity {
  const total = totalQuantity(graph, code) || 1;
  const owners = immediateHolders(graph, code)
    .slice()
    .sort((a, b) => b[1] - a[1]);
  const ultimate = effectiveOwners(graph, shares, code);
  const sumImmediate = owners.reduce((sum, [, units]) => sum + units, 0) / total;
  const sumUltimate = [...ultimate.values()].reduce((sum, w) => sum + w, 0);
  return {
    sumImmediate,
    sumUltimate,
    closesImmediate: Math.abs(sumImmediate - 1) <= 1e-3,
    closesUltimate: Math.abs(sumUltimate - 1) <= 1e-3,
    immediateCount: owners.length,
    ultimateCount: ultimate.size,
    top5: owners.slice(0, 5).reduce((sum, [, units]) => sum + units, 0) / total,
  };
}

/**
 * The two integrity checks and the counts hint. The original printed both checks as unconditional
 * ticks; here a position that does not close says so, and says what that means.
 */
export function renderOwnershipChecks(
  host: HTMLElement,
  code: string,
  integrity: OwnershipIntegrity
): void {
  replace(
    host,
    el('span', {
      class: `chip chip-${integrity.closesImmediate ? 'ok' : 'bad'}`,
      ...parity(`ownership.${code}.immediate_check`),
      text: integrity.closesImmediate
        ? '✓ Owners reconcile to 100%'
        : `⚠ Owners sum to ${formatPercent(integrity.sumImmediate)}`,
    }),
    el('span', {
      class: `chip chip-${integrity.closesUltimate ? 'ok' : 'bad'}`,
      ...parity(`ownership.${code}.ultimate_check`),
      text: integrity.closesUltimate
        ? '✓ Ultimate owners = 100%'
        : `⚠ Ultimate owners sum to ${formatPercent(integrity.sumUltimate)}`,
    }),
    el('span', {
      class: 'own-hint',
      ...parity(`ownership.${code}.counts_hint`),
      text: `${integrity.immediateCount} immediate owners · ${integrity.ultimateCount} ultimate parents · top 5 = ${formatPercent(integrity.top5)}`,
    })
  );
  if (integrity.closesImmediate && integrity.closesUltimate) return;
  host.append(
    el('div', { class: 'callout callout-bad' }, [
      el('div', { class: 'callout-title', text: 'Ownership does not close for this position' }),
      el('p', {
        text:
          (integrity.closesImmediate
            ? ''
            : `Its immediate holders hold ${formatPercent(integrity.sumImmediate)} of its units outstanding. `) +
          (integrity.closesUltimate
            ? ''
            : `Its ultimate owners account for ${formatPercent(integrity.sumUltimate)}. `) +
          'Above 100% means units are recorded twice, usually through a circular mapping; below 100% means part of the ownership is not in the mapped universe. ' +
          'Treat every share on this lens as indicative until the mapping is corrected — the Data quality lens lists the offending rows.',
      }),
    ])
  );
}

/**
 * The column definitions plus a statement about the fixed-point solve that is conditional on this
 * position actually closing, rather than the original's blanket assurance that it always does.
 */
export function ownershipFootnoteText(integrity: OwnershipIntegrity): string {
  return integrity.closesUltimate
    ? `${OWNERSHIP_COLUMN_DEFINITIONS} Ultimate owners are solved by fixed-point so cross-holdings/cycles resolve and sum to 100%.`
    : `${OWNERSHIP_COLUMN_DEFINITIONS} Ultimate owners are solved by fixed-point so cross-holdings/cycles resolve, but for this position they sum to ${formatPercent(integrity.sumUltimate)}, not 100% — see the correction below.`;
}

export interface OwnershipConservation {
  /** Held entities whose ultimate owners were measurable. */
  checked: number;
  /** Those whose ultimate shares do not sum to 100%, worst first. */
  offenders: { code: string; total: number }[];
}

/** Measured once per solve; the answer cannot change without the universe changing. */
const ownershipAuditCache = new WeakMap<OwnershipShares, OwnershipConservation>();

/**
 * Does ownership actually conserve? Sums each held entity's ultimate shares and reports the ones
 * that do not close to 100% within a tenth of a basis point.
 */
export function ownershipConservationAudit(
  graph: OwnershipGraph,
  shares: OwnershipShares
): OwnershipConservation {
  const cached = ownershipAuditCache.get(shares);
  if (cached) return cached;
  const offenders: { code: string; total: number }[] = [];
  let checked = 0;
  for (const code of graph.globalUnits.keys()) {
    if (graph.ultimates.has(code)) continue;
    const owners = effectiveOwners(graph, shares, code);
    if (!owners.size) continue;
    checked++;
    const total = [...owners.values()].reduce((sum, w) => sum + w, 0);
    if (Math.abs(total - 1) > 1e-3) offenders.push({ code, total });
  }
  offenders.sort((a, b) => Math.abs(b.total - 1) - Math.abs(a.total - 1));
  const result = { checked, offenders };
  ownershipAuditCache.set(shares, result);
  return result;
}

/**
 * The correction that replaces the original's blanket guarantee. Named entities, measured shares,
 * and a pointer back to the per-position check, which is the figure a controller should act on.
 */
export function renderOwnershipConservationNote(
  host: HTMLElement,
  graph: OwnershipGraph,
  audit: OwnershipConservation
): void {
  if (!audit.offenders.length) {
    replace(
      host,
      el('p', {
        class: 'note',
        text: `Checked firm-wide: all ${audit.checked} held positions in this universe close to 100%.`,
      })
    );
    return;
  }
  const worst = audit.offenders
    .slice(0, 3)
    .map((o) => `${o.code} at ${formatPercent(o.total)}`)
    .join(', ');
  const note = el('div', { class: 'callout callout-warn own-conservation' }, [
    el('div', {
      class: 'callout-title',
      text: `Ownership does not conserve everywhere — ${audit.offenders.length} of ${audit.checked} held positions do not close`,
    }),
    el('p', {
      text:
        `The fixed-point solve resolves the cross-holdings, but it cannot invent ownership the source data does not record. ` +
        `${worst}${audit.offenders.length > 3 ? `, and ${audit.offenders.length - 3} more` : ''}. ` +
        `The two circular mappings the Data quality lens reports as High severity are the cause of the overshoot; a shortfall means the holders sit outside the mapped universe. ` +
        `Trust the per-position check at the top of this lens, which is computed for the position on screen — not a firm-wide guarantee.`,
    }),
  ]);
  const list = el('ul', { class: 'own-conservation-list' });
  for (const offender of audit.offenders) {
    list.append(
      el('li', {}, [
        el('span', { class: 'mono', text: offender.code }),
        document.createTextNode(` · ${formatPercent(offender.total)} · ${displayName(graph, offender.code)}`),
      ])
    );
  }
  note.append(list);
  replace(host, note);
}

export interface OwnershipUltimateOptions {
  graph: OwnershipGraph;
  shares: OwnershipShares;
  root: string;
  showAll: boolean;
  onToggleShowAll: (next: boolean) => void;
  /** Make one of the parents the searched position. */
  onFollow: (code: string) => void;
}

/** The rollup, capped at 12 rows with an explicit toggle for the rest. Never a silent cut. */
export function renderOwnershipUltimateOwners(
  host: HTMLElement,
  options: OwnershipUltimateOptions,
  total: number
): void {
  const { graph, shares, root, showAll, onToggleShowAll, onFollow } = options;
  const owners = [...effectiveOwners(graph, shares, root).entries()].sort((a, b) => b[1] - a[1]);

  const heading = el('h3', { text: 'Ultimate owners' });
  const blurb = el('p', {
    class: 'note',
    text:
      'Each top-of-chain parent’s total effective share of the searched position, solved by fixed point so cross-holdings and cycles resolve. ' +
      'Whether they close to 100% for this position is stated by the check above.',
  });

  if (!owners.length) {
    replace(
      host,
      heading,
      blurb,
      emptyState('No ultimate owner is recorded for this position — nothing in the universe holds it.')
    );
    return;
  }

  const limit = showAll ? owners.length : TRUNCATE.ultimateOwners;
  const list = el('div', {
    class: 'own-rollup',
    role: 'list',
    'aria-label': `Ultimate owners of ${root}`,
  });
  for (const [code, weight] of owners.slice(0, limit)) {
    const row = el('button', {
      type: 'button',
      class: 'own-rollup-row',
      role: 'listitem',
      'data-code': code,
      title: `Make ${displayName(graph, code)} the searched position`,
    });
    row.append(
      el('span', { class: 'own-rollup-code' }, [
        el('span', { class: 'mono', text: code }),
        el('span', { class: 'own-rollup-name', text: displayName(graph, code) }),
      ]),
      el('span', {
        class: 'own-rollup-share mono',
        ...parity(`ownership.${root}.ultimate.${code}.share`),
        text: `${formatPercent(weight)} · ${formatCount(weight * total)}`,
      })
    );
    row.addEventListener('click', () => onFollow(code));
    list.append(row);
  }

  replace(host, heading, blurb, list);

  if (owners.length > TRUNCATE.ultimateOwners) {
    const toggle = el('button', {
      type: 'button',
      class: 'btn own-rollup-more',
      'aria-expanded': showAll ? 'true' : 'false',
      text: showAll
        ? `Show top ${TRUNCATE.ultimateOwners}`
        : `Show all ${owners.length} ultimate owners`,
    });
    toggle.addEventListener('click', () => onToggleShowAll(!showAll));
    host.append(
      el('p', {
        class: 'note',
        text: showAll
          ? `Showing all ${owners.length}.`
          : `Showing the largest ${TRUNCATE.ultimateOwners} of ${owners.length}.`,
      }),
      toggle
    );
  }
}
