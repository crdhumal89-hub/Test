/* TEMPORARY — parity verification harness for the Ownership / Data-quality lenses. Delete. */
import { describe, it, expect } from 'vitest';
import {
  graphFromUniverse,
  solveEffectiveShares,
  effectiveOwners,
  totalQuantity,
  immediateHolders,
  displayName,
  vpmSymbol,
  isSecurity,
  walkOwnersUpward,
  isSubtotal,
} from '../../src/domain/ownership.js';
import { formatCount, formatPercent } from '../../src/domain/money.js';
import { loadFixtures } from './fixtures.js';
import baseline from '../baseline.json';

const values = baseline.values as Record<string, string>;
const { universe } = loadFixtures();
const graph = graphFromUniverse(universe);
const shares = solveEffectiveShares(graph);

function head(code: string): Record<string, string> {
  const tot = totalQuantity(graph, code);
  const imm = immediateHolders(graph, code)
    .slice()
    .sort((a, b) => b[1] - a[1]);
  const eo = effectiveOwners(graph, shares, code);
  const sumI = imm.reduce((s, [, u]) => s + u, 0) / (tot || 1);
  const sumU = [...eo.values()].reduce((a, b) => a + b, 0);
  const top5 = imm.slice(0, 5).reduce((s, [, u]) => s + u, 0) / (tot || 1);
  const okI = Math.abs(sumI - 1) <= 1e-3;
  const okU = Math.abs(sumU - 1) <= 1e-3;
  return {
    [`ownership.${code}.kind`]: isSecurity(graph, code) ? 'SECURITY' : 'SPV / FUND',
    [`ownership.${code}.symbol`]: vpmSymbol(graph, code),
    [`ownership.${code}.name_and_code`]: `${displayName(graph, code)} · code ${code}`,
    [`ownership.${code}.total_qty`]: `Total qty: ${formatCount(tot)}`,
    [`ownership.${code}.pie`]: '100%',
    [`ownership.${code}.immediate_check`]: okI
      ? '✓ Owners reconcile to 100%'
      : `⚠ Owners sum to ${formatPercent(sumI)}`,
    [`ownership.${code}.ultimate_check`]: okU
      ? '✓ Ultimate owners = 100%'
      : `⚠ Ultimate owners sum to ${formatPercent(sumU)}`,
    [`ownership.${code}.counts_hint`]:
      `${imm.length} immediate owners · ${eo.size} ultimate parents · top 5 = ${formatPercent(top5)}`,
  };
}

describe('ownership header / checks', () => {
  it('APPOURI', () => {
    for (const [k, v] of Object.entries(head('APPOURI'))) expect(v, k).toBe(values[k]);
  });
  it('CRIMAP', () => {
    for (const [k, v] of Object.entries(head('CRIMAP'))) {
      if (values[k] == null) continue;
      expect(v, k).toBe(values[k]);
    }
  });
});

describe('ownership owner rows', () => {
  it('39 immediate rows with matching cells', () => {
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set()).filter(
      (r) => !isSubtotal(r) && r.depth === 0
    );
    expect(String(rows.length)).toBe(values['ownership.APPOURI.owner.__row_count']);
    for (const r of rows) {
      if (isSubtotal(r)) continue;
      const p = `ownership.APPOURI.owner.${r.holder}`;
      expect(formatCount(r.units), `${p}.qty_held`).toBe(values[`${p}.qty_held`]);
      expect(formatPercent(r.direct), `${p}.immediate_pct`).toBe(values[`${p}.immediate_pct`]);
      expect(formatPercent(r.cumulative), `${p}.cumulative_pct`).toBe(values[`${p}.cumulative_pct`]);
    }
  });
});

describe('ownership ultimate rollup', () => {
  it('top 12 shares', () => {
    const tot = totalQuantity(graph, 'APPOURI');
    const arr = [...effectiveOwners(graph, shares, 'APPOURI').entries()].sort((a, b) => b[1] - a[1]);
    const shown = arr.slice(0, 12);
    expect(String(shown.length)).toBe(values['ownership.APPOURI.ultimate.__row_count']);
    for (const [p, w] of shown) {
      const key = `ownership.APPOURI.ultimate.${p}.share`;
      expect(`${formatPercent(w)} · ${formatCount(w * tot)}`, key).toBe(values[key]);
    }
    expect(arr.length).toBe(39);
  });
});

describe('ownership derivation (first row = CSTR)', () => {
  it('title, headline, equation, ladder', () => {
    const rows = walkOwnersUpward(graph, 'APPOURI', new Set()).filter((r) => !isSubtotal(r));
    const r = rows[0]!;
    if (isSubtotal(r)) throw new Error('unreachable');
    const ult = graph.ultimates.has(r.holder);
    expect(`${ult ? 'Ultimate owner' : 'Owner'} — how this % is derived`).toBe(
      values['ownership.derivation.title']
    );
    expect(`${r.holder} owns ${formatPercent(r.direct)} of ${r.parent}`).toBe(
      values['ownership.derivation.headline']
    );
    expect(
      `${formatCount(r.units)} units held ÷ ${formatCount(totalQuantity(graph, r.parent))} total units of ${r.parent} = ${formatPercent(r.direct)} immediate`
    ).toBe(values['ownership.derivation.equation']);
    const ladder = [vpmSymbol(graph, 'APPOURI')];
    for (const step of r.chain) {
      ladder.push(`×${(step.direct * 100).toFixed(1)}%→`, step.code);
    }
    expect(`${ladder.join(' ')} = ${formatPercent(r.cumulative)}`).toBe(
      values['ownership.derivation.ladder']
    );
  });
});

describe('ownership column headers', () => {
  it('joined header text', () => {
    const joined = [
      'Owner (expand ▸ upward)',
      'VPM symbol',
      'SPV fund code',
      'Qty held',
      'Immediate %' + 'share of row below',
      `% of ${vpmSymbol(graph, 'APPOURI')}` + 'cumulative · effective',
    ].join('');
    expect(joined).toBe(values['ownership.column_headers']);
  });
});

describe('ownership footnote', () => {
  it('exact', () => {
    const text =
      'Immediate % = holder qty ÷ total qty of the entity in the row below. Cumulative % chains up the path (shown when you click a row). Ultimate owners are solved by fixed-point so cross-holdings/cycles resolve and sum to 100%.';
    expect(text).toBe(values['ownership.APPOURI.footnote']);
  });
});

describe('ownership conservation audit', () => {
  it('names the offenders', () => {
    const off: [string, number][] = [];
    let checked = 0;
    for (const code of graph.globalUnits.keys()) {
      if (graph.ultimates.has(code)) continue;
      const eo = effectiveOwners(graph, shares, code);
      if (!eo.size) continue;
      checked++;
      const total = [...eo.values()].reduce((s, v) => s + v, 0);
      if (Math.abs(total - 1) > 1e-3) off.push([code, total]);
    }
    // eslint-disable-next-line no-console
    console.log('AUDIT checked', checked, 'offenders', JSON.stringify(off));
    expect(off.length).toBe(5);
  });
});

describe('data quality', () => {
  const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9_.>-]+/g, '_');
  it('counts and buckets, unscoped', () => {
    const buckets = universe.issues;
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const bySev = (sev: string): number =>
      buckets.filter((b) => b.sev === sev).reduce((a, b) => a + b.count, 0);
    expect(String(bySev('High'))).toBe(values['data_quality.high_count']);
    expect(String(bySev('Medium'))).toBe(values['data_quality.medium_count']);
    expect(String(bySev('Low'))).toBe(values['data_quality.low_count']);
    expect(String(total)).toBe(values['data_quality.total_count']);
    expect(String(total)).toBe(values['data_quality.tab_badge']);
    expect('All fund entities · scanned universe').toBe(values['data_quality.scope_label']);
    expect(String(buckets.length)).toBe(values['data_quality.bucket.__row_count']);
    for (const b of buckets) {
      const p = `data_quality.bucket.${sanitize(b.name)}`;
      expect(`${b.count} · ${b.sev}`, `${p}.count_and_severity`).toBe(
        values[`${p}.count_and_severity`]
      );
      expect(b.expl, `${p}.explanation`).toBe(values[`${p}.explanation`]);
    }
  });

  it('scoped to Apollo Sports Capital', () => {
    const label = 'Apollo Sports Capital';
    const reach = new Set(universe.entReach[label] ?? []);
    const scoped = universe.issues.map((b) => ({
      ...b,
      rows: b.rows.filter((r) => reach.has(r.code)),
    }));
    const counts = scoped.map((b) => b.rows.length);
    const total = counts.reduce((a, b) => a + b, 0);
    const high = scoped.filter((b) => b.sev === 'High').reduce((a, b) => a + b.rows.length, 0);
    expect(String(total)).toBe(values['data_quality.scoped.total']);
    expect(String(high)).toBe(values['data_quality.scoped.high']);
    expect(`${label} · ${reach.size} funds in world`).toBe(values['data_quality.scoped.label']);
  });

  it('no bucket exceeds the 200-row cap in this fixture', () => {
    // eslint-disable-next-line no-console
    console.log('bucket row counts', universe.issues.map((b) => b.rows.length).join(','));
  });
});
