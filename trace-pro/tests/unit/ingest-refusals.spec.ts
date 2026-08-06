/**
 * What each uploader REFUSES, by name — the negative half of `ingest-roundtrip.spec.ts`.
 *
 * It is a second file because both halves together run past the 400-line limit, and because they
 * assert opposite things: that half proves a good file lands exactly on the shipped figures, this one
 * proves a bad file lands on a NAMED refusal instead of a plausible-looking wrong number. Every case
 * below is built by damaging the round-trip file from the shipped fixtures, so the damage is the only
 * difference between a file that reprices the whole book and a file that is turned away.
 *
 * Three of these refusals did not exist before this file did: a truncated position row, a numeric
 * column holding text, and two rows giving one fund different net asset values. Each of those used
 * to read as zero, as an absent NAV, or as whichever row the export happened to write first. The
 * measured cost of each is in the test that names it.
 *
 * WHAT IS NOT COVERED HERE. The sentence a refusal becomes on screen is built in
 * `src/ui/drawers/sources-upload.ts`, which needs a document; the unit environment is `node`, so
 * these tests assert the parser's own named result and `tests/e2e/states-upload.spec.ts` asserts the
 * state that result renders as. The one drawer-level guard whose absence would be invisible to both
 * — the fund-entity check — is pinned by reading the source, at the bottom of this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvRows, splitCsvLine } from '../../src/domain/ingest/cells.js';
import { navJoinToModel, readNavReportText } from '../../src/domain/ingest/nav-report.js';
import {
  lookthroughFromPositions,
  positionEntities,
  positionIndexFromRows,
  positionReportProblem,
} from '../../src/domain/ingest/position-report.js';
import { applyNavOnly, structureFromTree } from '../../src/domain/repricing.js';
import { loadFixtures } from './fixtures.js';
import { csvText, navPivotCsv, positionReportCsv } from './report-serialise.js';

const FIXTURES = loadFixtures();
const REPRICING = FIXTURES.repricing;
const TREE = FIXTURES.lookthrough;
const PRODUCT = TREE.product;
const KNOWN = Object.keys(REPRICING.gqByFund);

const NAV_CSV = navPivotCsv(PRODUCT, REPRICING.navByFund);
const POSITION_CSV = positionReportCsv(TREE, REPRICING);

/** The shipped NAV report with one row rewritten, so damage is the only difference. */
function navWithRow(edit: (row: string[], code: string) => string[] | null): string {
  const rows = csvRows(NAV_CSV);
  const out: string[][] = [];
  for (const [i, row] of rows.entries()) {
    if (i === 0) {
      out.push(row);
      continue;
    }
    const next = edit(row, row[1] ?? '');
    if (next) out.push(next);
  }
  return csvText(out);
}

/** The shipped position report cut off part-way through row 3, with `keep` whole cells left. */
function positionTruncatedAfter(keep: number): string {
  const lines = POSITION_CSV.split('\n');
  const short = splitCsvLine(lines[2] ?? '').slice(0, keep);
  return csvText([splitCsvLine(lines[0] ?? ''), splitCsvLine(lines[1] ?? ''), short]);
}

/* ================================================================= truncated files */

describe('a truncated file', () => {
  it('NAV report · a header with nothing under it is empty, not applied', () => {
    expect(readNavReportText('PRODUCT,FUND_CODE,ENDING_NAV\n')).toEqual({
      kind: 'empty',
      layout: 'pivot',
    });
    expect(readNavReportText(csvRows(NAV_CSV)[0]!.join(',') + '\n').kind).toBe('empty');
  });

  /**
   * A file cut off mid-row. The last line reaches the fund code and stops before ENDING_NAV, so the
   * row cannot be read — and the reader answers "empty" rather than inventing a NAV of nothing for a
   * real fund, which would have published a price of zero for it.
   */
  it('NAV report · a header plus half a row is empty, not a fund priced at nothing', () => {
    const whole = NAV_CSV.split('\n');
    const cut = (whole[1] ?? '').slice(0, Math.floor((whole[1] ?? '').length * 0.6));
    expect(cut).toContain('Apollo Sports Capital');
    const result = readNavReportText([whole[0], cut].join('\n') + '\n');
    expect(result).toEqual({ kind: 'empty', layout: 'pivot' });
  });

  it('Position report · a header with nothing under it is named', () => {
    const header = csvRows(POSITION_CSV)[0]!;
    expect(positionReportProblem([header])).toBe('the file has no rows under its header');
  });

  /**
   * The fault this refusal was written for. A short row's missing cells come back undefined, which
   * `parseFigure` answers null to and the index turns into 0 — so before this check a file cut off
   * mid-row was APPLIED, and the fund on the truncated row held nothing at all while every screen
   * redrew around it. The refusal names the row, the column it stops before, and where that column
   * sits in the header.
   */
  it('Position report · a header plus half a row is refused, naming the column it stops before', () => {
    expect(positionReportProblem(csvRows(positionTruncatedAfter(5)))).toBe(
      'row 3 stops before its Quantity VPM column — it carries 5 cells where Quantity VPM is ' +
        'column 8, so the file looks truncated'
    );
    // And a raw byte cut, wherever it happens to land inside the row.
    const lines = POSITION_CSV.split('\n');
    const cut = (lines[2] ?? '').slice(0, Math.floor((lines[2] ?? '').length * 0.7));
    const problem = positionReportProblem(csvRows([lines[0], lines[1], cut].join('\n') + '\n'));
    expect(problem).toMatch(/^row 3 stops before its .+ column — it carries \d+ cells/);
    // A blank line in the middle of a file is not a truncation.
    expect(positionReportProblem(csvRows(POSITION_CSV.replace('\n', '\n\n')))).toBeNull();
  });
});

/* ================================================================= duplicate fund codes */

describe('duplicate fund codes in one file', () => {
  /**
   * A repeated figure is still tolerated — a pivot's subtotal of a one-fund group restates that
   * fund's own NAV, and reading it twice cannot change an answer. Two rows that DISAGREE are refused
   * with the row and both figures, where first-value-wins used to pick whichever the export wrote
   * first: for a fund with two share-class rows that published a price off one class, not their sum.
   */
  it('NAV report · a restated figure is read, a contradicted one is refused by name', () => {
    const repeated = readNavReportText(NAV_CSV + `"${PRODUCT}","ASCHON",${REPRICING.navByFund.ASCHON}\n`);
    expect(repeated.kind).toBe('applied');
    if (repeated.kind === 'applied') expect(repeated.navByFund).toEqual(REPRICING.navByFund);

    const contradicted = readNavReportText(NAV_CSV + `"${PRODUCT}","ASCHON",1\n`);
    expect(contradicted).toEqual({
      kind: 'duplicate-fund',
      code: 'ASCHON',
      first: 266441285.01,
      second: 1,
      row: 23,
    });
  });

  /**
   * The position report is the opposite case, and it is stated here rather than left implied: two
   * rows for the same holder and investee are two LOTS of one position and legitimately sum, and the
   * file carries no lot identifier that could tell a second lot from a duplicated row. So a genuine
   * duplicate is NOT refused, and this is exactly what it costs: units held and units outstanding
   * both double, so the ownership share is untouched, but units outstanding is the denominator of
   * the price — CRIMH's unit price halves, from $1.1395848448377022 to $0.5697924224188511. Refusing
   * it would mean refusing every report with two lots in it, so the honest statement is the measured
   * one, not a guess dressed up as a check.
   */
  it('Position report · a duplicated position row is summed, and halves that fund’s unit price', () => {
    const rows = csvRows(POSITION_CSV);
    const edge = rows.findIndex((r) => r[2] === 'CRIMT' && r[3] === 'CRIMH');
    expect(edge).toBeGreaterThan(0);
    expect(positionReportProblem([...rows, rows[edge]!])).toBeNull();
    const index = positionIndexFromRows([...rows, rows[edge]!]);
    expect(index.globalUnits.get('CRIMH')).toBe(REPRICING.gqByFund.CRIMH! * 2);
    const tree = lookthroughFromPositions(index, PRODUCT, TREE.asof);
    const crimh = tree.nodes.find((n) => n.code === 'CRIMH');
    expect(crimh?.ownpct).toBe(1);
    const shipped = REPRICING.funds.find((f) => f.code === 'CRIMH');
    expect(shipped?.curPx).toBe(1.1395848448377022);
    expect(shipped!.ltv / index.globalUnits.get('CRIMH')!).toBe(0.5697924224188511);
  });
});

/* ================================================================= codes and columns */

describe('a fund code the product does not hold', () => {
  it('NAV report · is named as unmatched and cannot move a figure', () => {
    const withAlien = readNavReportText(NAV_CSV + `"${PRODUCT}","NOTOURS",999999999\n`);
    if (withAlien.kind !== 'applied') throw new Error(`expected applied, got ${withAlien.kind}`);
    expect(withAlien.codes).toContain('NOTOURS');
    const joined = navJoinToModel(withAlien.navByFund, KNOWN);
    expect(joined.unmatched).toEqual(['NOTOURS']);
    expect(joined.navByFund).toEqual(REPRICING.navByFund);
    // $999,999,999 in the file, and the book is repriced to the cent it was already on.
    const next = applyNavOnly(REPRICING, structureFromTree(TREE.nodes), joined.navByFund);
    expect(next.N).toBe(REPRICING.N);
    expect(next.R).toBe(REPRICING.R);
  });

  it('NAV report · a file of nothing but foreign codes matches nothing at all', () => {
    const foreign = readNavReportText(
      navWithRow((row, code) => [row[0] ?? '', `X${code}`, row[2] ?? ''])
    );
    if (foreign.kind !== 'applied') throw new Error(`expected applied, got ${foreign.kind}`);
    expect(foreign.codes.length).toBe(21);
    const joined = navJoinToModel(foreign.navByFund, KNOWN);
    expect(joined.matched).toEqual([]);
    expect(joined.unmatched.length).toBe(21);
    expect(joined.navByFund).toEqual({});
  });
});

describe('a numeric column containing text', () => {
  /**
   * Text in ENDING_NAV is refused, naming the fund, the row and the cell. Skipping the row instead —
   * which is what happened before — drops that fund's NAV out of Σ apex NAV and out of every price
   * derived from it, with nothing on screen to say so: dropping DUNK alone moves the published NAV
   * from $2,062,198,835.86 to $2,062,196,050.07, and the drawer would still have reported that every
   * fund in the file was applied.
   */
  it('NAV report · refuses text where a net asset value belongs', () => {
    const result = readNavReportText(
      navWithRow((row, code) => (code === 'DUNK' ? [row[0] ?? '', code, 'not available'] : row))
    );
    expect(result).toEqual({ kind: 'non-numeric-nav', code: 'DUNK', cell: 'not available', row: 5 });

    const dropped = { ...REPRICING.navByFund };
    delete (dropped as Record<string, number>).DUNK;
    const next = applyNavOnly(REPRICING, structureFromTree(TREE.nodes), dropped);
    expect(REPRICING.N).toBe(2062198835.86);
    expect(next.N).toBe(2062196050.07);
  });

  it('NAV report · still reads a blank, a dash and #N/A as “this fund reports no NAV”', () => {
    for (const blank of ['', '-', '—', '#N/A', 'nan']) {
      const result = readNavReportText(
        navWithRow((row, code) => (code === 'DUNK' ? [row[0] ?? '', code, blank] : row))
      );
      if (result.kind !== 'applied') throw new Error(`“${blank}” was refused as ${result.kind}`);
      expect(result.codes).not.toContain('DUNK');
      expect(result.codes.length).toBe(20);
    }
  });

  it('Position report · refuses text where a quantity or a market value belongs', () => {
    const rows = csvRows(POSITION_CSV);
    const at = rows.findIndex((r) => r[2] === 'ASCHON' && r[3] === 'ASCON');
    const withText = rows.map((r, i) => (i === at ? r.map((c, j) => (j === 7 ? 'n/a' : c)) : r));
    expect(positionReportProblem(withText)).toBe(
      `row ${at + 1} has “n/a” in its Quantity VPM column, which is not a figure`
    );
    const withTextMv = rows.map((r, i) => (i === at ? r.map((c, j) => (j === 8 ? 'unknown' : c)) : r));
    expect(positionReportProblem(withTextMv)).toBe(
      `row ${at + 1} has “unknown” in its MV USD column, which is not a figure`
    );
    // A blank quantity is still a stated zero, which is a real thing in a position file.
    const blank = rows.map((r, i) => (i === at ? r.map((c, j) => (j === 7 ? '' : c)) : r));
    expect(positionReportProblem(blank)).toBeNull();
  });
});

/* ================================================================= yesterday's NAV */

describe('a NAV column that is not this period’s', () => {
  it('refuses a report whose only NAV column is PREV_DAY_ENDING_NAV', () => {
    const feed = navWithRow((row, code) => [row[0] ?? '', code, row[2] ?? '']);
    expect(readNavReportText(feed.replace('ENDING_NAV', 'PREV_DAY_ENDING_NAV')).kind).toBe('no-nav-column');
    for (const header of ['BEGINNING_NAV', 'PRIOR_DAY_ENDING_NAV', 'OPENING_ENDING_NAV', 'START_ENDING_NAV']) {
      const text = feed.replace('ENDING_NAV', header);
      expect(readNavReportText(text).kind, header).toBe('no-nav-column');
    }
  });

  it('refuses a per-fund feed with no PRODUCT column and only yesterday’s NAV', () => {
    const rows = [['As Of Date', 'Fund Code', 'PREV_DAY_ENDING_NAV']];
    for (const [code, nav] of Object.entries(REPRICING.navByFund)) rows.push([TREE.asof, code, String(nav)]);
    expect(readNavReportText(csvText(rows)).kind).toBe('no-layout');
  });
});

/* ================================================================= a different product */

describe('a report for a different product', () => {
  const rows = csvRows(POSITION_CSV).map((row, i) =>
    i === 0 ? row : row.map((cell, j) => (j === 0 ? 'Apollo Credit Strategies' : cell))
  );

  /**
   * The report says this is now refused, and it is — in the drawer, because the domain cannot refuse
   * it: `positionEntities` FALLS BACK to the first entity in the file when the preferred one is
   * absent, which is what let the original replace every figure on screen with another product's,
   * under the heading of the product you thought you were looking at. That fallback is asserted here
   * so it is on the record as the reason the drawer's guard is load-bearing rather than defensive.
   */
  it('parses as a valid report, and names a fund entity that is not this product', () => {
    expect(positionReportProblem(rows)).toBeNull();
    const index = positionIndexFromRows(rows);
    const { entities, product } = positionEntities(index, PRODUCT);
    expect(entities).toEqual(['Apollo Credit Strategies']);
    expect(entities).not.toContain(PRODUCT);
    expect(product).toBe('Apollo Credit Strategies');
  });

  it('builds nothing for this product, so there is no hierarchy to swap in', () => {
    const tree = lookthroughFromPositions(positionIndexFromRows(rows), PRODUCT, TREE.asof);
    expect(tree.nodes.length).toBe(1);
    expect(tree.nodes[0]?.kind).toBe('product');
    expect(tree.grand).toBe(0);
    expect(tree.prodNAV).toBe(0);
  });

  it('is refused by the drawer, on the entity list rather than on the fallback', () => {
    const drawer = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../src/ui/drawers/sources-upload.ts'),
      'utf8'
    );
    expect(drawer).toContain('if (!entities.includes(product))');
    expect(drawer).toContain('Nothing was replaced');
    // The guard must stand between the parse and the two setters, or it guards nothing.
    expect(drawer.indexOf('if (!entities.includes(product))')).toBeLessThan(drawer.indexOf('store.setModel'));
  });
});
