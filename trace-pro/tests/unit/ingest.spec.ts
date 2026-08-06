/**
 * The uploaded-file readers, tested where they can be tested exactly: as functions over rows.
 *
 * `docs/redesign-spec.md` §6 Q3 says the robustness in the legacy upload path — the
 * `PREV_DAY_ENDING_NAV` trap and the whitespace-dirty fund-code join — "gets unit tests before the
 * deletion, not after". These are those tests, plus a small hand-computable structure that pins the
 * arithmetic of the position-report path: three entities, one security, one share, one answer that can
 * be checked by hand.
 */
import { describe, expect, it } from 'vitest';
import { normaliseCell, normaliseCode, parseFigure, splitCsvLine } from '../../src/domain/ingest/cells.js';
import { navJoinToModel, readNavReportText } from '../../src/domain/ingest/nav-report.js';
import {
  lookthroughFromPositions,
  positionEntities,
  positionIndexFromRows,
  positionReportProblem,
} from '../../src/domain/ingest/position-report.js';
import { repriceFromPositions } from '../../src/domain/repricing-positions.js';

describe('cells', () => {
  it('splits quoted commas and doubled quotes', () => {
    expect(splitCsvLine('a,"b,c","d""e",')).toEqual(['a', 'b,c', 'd"e', '']);
  });

  it('reads figures the way an accountant writes them', () => {
    expect(parseFigure('$1,234.50')).toBe(1234.5);
    expect(parseFigure('(1,234.50)')).toBe(-1234.5);
    expect(parseFigure('#N/A')).toBeNull();
    expect(parseFigure('—')).toBeNull();
    expect(parseFigure('')).toBeNull();
    expect(parseFigure(42)).toBe(42);
  });

  it('hardens a code for joining without upper-casing a name', () => {
    expect(normaliseCode('  asc hon  ')).toBe('ASC HON');
    expect(normaliseCell('  Apollo Sports Capital ')).toBe('Apollo Sports Capital');
    expect(normaliseCell('NaN')).toBe('');
  });
});

describe('NAV report', () => {
  it('reads the pivot layout', () => {
    const result = readNavReportText(
      'PRODUCT,FUND_CODE,ENDING_NAV\n"Apollo Sports Capital","ASCON",100\n"Apollo Sports Capital","DUNK",2785.79\n'
    );
    expect(result).toEqual({
      kind: 'applied',
      layout: 'pivot',
      codes: ['ASCON', 'DUNK'],
      navByFund: { ASCON: 100, DUNK: 2785.79 },
    });
  });

  it('never mistakes a previous-day or opening NAV column for this period’s', () => {
    const result = readNavReportText(
      'As Of Date,Fund Code,PREV_DAY_ENDING_NAV,BEGINNING_NAV,Ending NAV\n' +
        '2026-06-30,ASCON,1,2,300\n'
    );
    expect(result.kind === 'applied' && result.navByFund).toEqual({ ASCON: 300 });
  });

  it('prefers an exactly named ENDING_NAV column over one that merely contains it', () => {
    const result = readNavReportText('Fund Code,ADJUSTED_ENDING_NAV,ENDING_NAV\nASCON,9,7\n');
    expect(result.kind === 'applied' && result.navByFund).toEqual({ ASCON: 7 });
  });

  it('recognises a position report dropped in the NAV slot', () => {
    const result = readNavReportText('Fund Code,SPV Fund Code,Quantity VPM,MV USD\nA,B,1,2\n');
    expect(result.kind).toBe('position-report');
  });

  it('separates “no rows” from “not a NAV report”', () => {
    expect(readNavReportText('PRODUCT,FUND_CODE,ENDING_NAV\n').kind).toBe('empty');
    expect(readNavReportText('Some,Meeting,Minutes\n1,2,3\n').kind).toBe('no-layout');
  });

  /**
   * The original took the first value per code and said nothing, which protected the pivot case —
   * a subtotal row restating a one-fund group — and silently resolved the case where two rows
   * genuinely disagree. Repeating a figure is still tolerated, because reading the same number twice
   * cannot change an answer; disagreeing is now named, with the row and both figures, because the
   * one that used to win was whichever the export happened to write first.
   */
  it('tolerates a repeated figure and refuses two that disagree, by name', () => {
    const same = readNavReportText('Fund Code,ENDING_NAV\nASCON,10\nASCON,10.00\n');
    expect(same.kind === 'applied' && same.navByFund).toEqual({ ASCON: 10 });
    expect(readNavReportText('Fund Code,ENDING_NAV\nASCON,10\nASCON,999\n')).toEqual({
      kind: 'duplicate-fund',
      code: 'ASCON',
      first: 10,
      second: 999,
      row: 3,
    });
  });

  it('joins a whitespace-dirty, case-variant feed code onto the model’s own spelling', () => {
    const joined = navJoinToModel({ ' asc hon ': 5, 'zzz': 9 }, ['ASC HON', 'DUNK']);
    expect(joined.navByFund).toEqual({ 'ASC HON': 5 });
    expect(joined.matched).toEqual(['ASC HON']);
    expect(joined.unmatched).toEqual(['zzz']);
  });
});

/**
 * P holds all 1,000 units of feeder F. F holds 500 of S's 1,000 units outstanding — the other 500 are
 * held outside the product, which is what makes the share 50% rather than 100%. S holds one security
 * worth $1,000,000. So: value of the whole of S is 1,000,000; F's look-through value is 500,000; and
 * the product's is 500,000. Every one of those figures is checkable by hand, which is the point.
 */
const POSITIONS = [
  ['Fund Entity', 'Fund', 'Fund Code', 'SPV Fund Code', 'Security Code', 'Security', 'Issuer', 'Quantity VPM', 'MV USD', 'NAV End USD'],
  ['P', 'Feeder F', 'F', 'S', 'S', 'SPV S', '', '500', '400000', '2000000'],
  ['P', 'Feeder F', 'F', '', 'CASH', 'Fund Cash', '', '0', '0', '2000000'],
  ['Outside', 'Other holder', 'X', 'S', 'S', 'SPV S', '', '500', '400000', ''],
  ['P', 'SPV S', 'S', '', 'SEC1', 'A security', 'An issuer', '10', '1000000', ''],
];

describe('position report', () => {
  it('names the columns it needs when they are missing', () => {
    expect(positionReportProblem([['Ticker', 'Price'], ['ABC', '1']])).toContain('Fund Code');
    expect(positionReportProblem([['Fund Code']])).toBe('the file has no rows under its header');
    expect(positionReportProblem(POSITIONS)).toBeNull();
  });

  it('indexes units outstanding across every holder, inside the product and outside it', () => {
    const index = positionIndexFromRows(POSITIONS);
    expect(index.globalUnits.get('S')).toBe(1000);
    expect(index.edgeUnits.get('F|S')).toBe(500);
    expect(index.leavesByFund.get('S')?.[0]?.mv).toBe(1_000_000);
    expect(index.navByEntity.get('P')).toBe(2_000_000);
    expect(positionEntities(index, 'P').product).toBe('P');
    expect(positionEntities(index, 'Nowhere').entities).toEqual(['Outside', 'P']);
  });

  it('builds a hierarchy whose values are the ones a controller can check by hand', () => {
    const index = positionIndexFromRows(POSITIONS);
    const tree = lookthroughFromPositions(index, 'P', '2026-06-30');
    const byCode = new Map(tree.nodes.map((n) => [n.code, n]));

    expect(tree.nodes[0]?.kind).toBe('product');
    expect(byCode.get('F')?.kind).toBe('apex');
    expect(byCode.get('S')?.ownpct).toBeCloseTo(0.5, 12);
    expect(byCode.get('S')?.mv100).toBeCloseTo(1_000_000, 6);
    expect(byCode.get('S')?.derived).toBeCloseTo(500_000, 6);
    expect(byCode.get('SEC1')?.derived).toBeCloseTo(500_000, 6);
    // Σ of the leaf look-through values is the product's, and the NAV stamp comes from the file.
    expect(tree.grand).toBeCloseTo(500_000, 6);
    expect(tree.prodNAV).toBe(2_000_000);
    expect(tree.resid).toBeCloseTo(500_000 - 2_000_000, 6);
    // Every node's path resolves to its parent, which is what the tree and the graph both read.
    for (const node of tree.nodes) {
      const trail = node.path.split('/').filter(Boolean).map(Number);
      expect(trail[trail.length - 1]).toBe(node.id);
    }
  });

  it('reprices the same index bottom-up, and agrees with the hierarchy it built', () => {
    const index = positionIndexFromRows(POSITIONS);
    const tree = lookthroughFromPositions(index, 'P', '2026-06-30');
    const repricing = repriceFromPositions(index, { S: 1_200_000 }, 'P', '2026-06-30');

    expect(repricing.apex).toEqual(['F']);
    expect(repricing.D).toBeCloseTo(tree.grand, 6);
    expect(repricing.ltvByFund.S).toBeCloseTo(1_000_000, 6);
    // S is repriced at its uploaded NAV, so F is worth half of it and the product follows F.
    expect(repricing.revByFund.S).toBeCloseTo(1_200_000, 6);
    expect(repricing.revByFund.F).toBeCloseTo(600_000, 6);
    expect(repricing.dPricing).toBeCloseTo(100_000, 6);
    expect(repricing.funds.map((f) => f.code).sort()).toEqual(['F', 'S']);
  });
});
