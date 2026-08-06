/**
 * The upload path's parity net: the shipped fixtures, written back out as the two files the
 * uploaders read, parsed by the REAL parsers and recomputed by the REAL recompute — and asserted
 * back onto the fixtures they came from, to the last bit.
 *
 * WHY. `parity-map.json` is frozen and contains ZERO upload entries, so the parity gate — the thing
 * that protects every number in this app — never looks at a figure that came from an uploaded file.
 * `src/domain/ingest/` and the two drawer slots can therefore recompute the whole book off a file
 * and be wrong in silence. The fixtures in `data/apollo-sports-capital/2026-06-30/` are themselves
 * parity-verified, which makes them a legitimate oracle: serialise them out, read them in, and the
 * figures must land back on themselves. `report-serialise.ts` is the write half.
 *
 * WHAT IT MEASURED. The round trip did NOT reproduce the fixture when it was first run, and the
 * defect was in `structureFromTree`: see its own comment for the two faults and their sizes. With
 * those fixed, every figure below matches the shipped fixture EXACTLY — not to the cent, to the last
 * bit of the double — through both the CSV reader and a real `.xlsx`. Three fields cannot round trip
 * and are asserted at their exact size at the bottom of this file rather than excused.
 *
 * WHICH LAYERS THIS DOES NOT COVER, so nothing here implies coverage it does not have:
 *   · `loadSpreadsheetLibrary` — the `<script src="vendor/xlsx.full.min.js">` fetch. These tests
 *     inject the npm `xlsx` package, which is SheetJS 0.18.5, the SAME version the vendored build
 *     reports, into `globalThis.XLSX`; `readWorkbookRows` then takes its early return and every
 *     other line of it runs for real, including SheetJS's own binary parse. The script tag itself
 *     needs a document and is covered by `tests/e2e/states-upload.spec.ts`.
 *   · `src/ui/drawers/sources-upload.ts` — the mapping from a parser result to the sentence on
 *     screen. It builds DOM, the unit environment is `node`, and that mapping is e2e's.
 */
import { describe, expect, it } from 'vitest';
import * as sheetjs from 'xlsx';
import { csvRows } from '../../src/domain/ingest/cells.js';
import { navJoinToModel, readNavReportText } from '../../src/domain/ingest/nav-report.js';
import {
  lookthroughFromPositions,
  positionEntities,
  positionIndexFromRows,
  positionReportProblem,
} from '../../src/domain/ingest/position-report.js';
import { applyNavOnly, recomputeRepricedValues, structureFromTree } from '../../src/domain/repricing.js';
import { repriceFromPositions } from '../../src/domain/repricing-positions.js';
import { readWorkbookRows } from '../../src/export/excel.js';
import type { LookthroughFixture, RepricingFixture, RepricingFund } from '../../src/domain/types.js';
import { loadFixtures } from './fixtures.js';
import {
  EXTERNAL_HOLDER,
  navPivotCsv,
  positionReportCsv,
  positionReportRows,
} from './report-serialise.js';

const FIXTURES = loadFixtures();
const SHIPPED_REPRICING = FIXTURES.repricing;
const SHIPPED_TREE = FIXTURES.lookthrough;

/** Read a value by name whether or not the declared type admits it, for the absence checks. */
function fields(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

/** The per-fund figures the task names, plus the ones they are computed from. */
function fundFigures(fund: RepricingFund): Record<string, unknown> {
  const { holdings, holders, nHolders, ...rest } = fund as RepricingFund & Record<string, unknown>;
  void holdings;
  void holders;
  void nHolders;
  delete rest.secs;
  delete rest.nSecs;
  return rest;
}

function fundHoldings(fund: RepricingFund): Record<string, unknown>[] {
  return fund.holdings.map((h) => {
    const { ...rest } = h as typeof h & Record<string, unknown>;
    delete rest.carried;
    return rest;
  });
}

/** Every figure of a repricing except the per-fund rows, which are compared separately. */
function repricingTotals(repricing: RepricingFixture): Record<string, unknown> {
  const { funds, breaks, ...rest } = repricing;
  void funds;
  void breaks;
  return rest;
}

/** A tree node without `holder`, which the shipped `lookthrough.json` does not carry at all. */
function treeNodes(tree: LookthroughFixture): Record<string, unknown>[] {
  return tree.nodes.map((node) => {
    const { holder, ...rest } = node;
    void holder;
    return rest;
  });
}

/* ================================================================= the NAV report */

describe('NAV report round trip', () => {
  const known = Object.keys(SHIPPED_REPRICING.gqByFund);

  /**
   * The two faults the round trip exposed, pinned on a tree small enough to check by hand rather
   * than only against a 149-node fixture. A holds half of V, B holds a quarter of the same V, and V
   * holds one security worth 100. So V's securities are 100 — once — and both edges are keyed by the
   * holder's CODE. `holder` is set to a lie on every node here, because the shipped tree does not
   * carry the field and the rebuild must not be reading it.
   */
  it('reads parentage from the path and counts a repeated fund’s securities once', () => {
    const node = (id: number, path: string, kind: string, code: string, extra: Record<string, number> = {}) => ({
      id, path, kind, code, holder: 'A LIE', ownpct: 1, isLeaf: 0 as 0 | 1, mv100: 0, ...extra,
    });
    const structure = structureFromTree([
      node(0, '0/', 'product', 'P'),
      node(1, '0/1/', 'apex', 'A'),
      node(2, '0/1/2/', 'vehicle', 'V', { ownpct: 0.5 }),
      { ...node(3, '0/1/2/3/', 'leaf', 'SEC', { mv100: 100 }), isLeaf: 1 as 0 | 1 },
      node(4, '0/4/', 'apex', 'B'),
      node(5, '0/4/5/', 'vehicle', 'V', { ownpct: 0.25 }),
      { ...node(6, '0/4/5/6/', 'leaf', 'SEC', { mv100: 100 }), isLeaf: 1 as 0 | 1 },
    ]);
    expect(structure.apex).toEqual(['A', 'B']);
    expect([...structure.scope].sort()).toEqual(['A', 'B', 'V']);
    expect(structure.children.get('A')).toEqual([{ code: 'V', share: 0.5 }]);
    expect(structure.children.get('B')).toEqual([{ code: 'V', share: 0.25 }]);
    expect(structure.children.get('A LIE')).toBeUndefined();
    expect(structure.securitiesValue.get('V')).toBe(100);
    // And the price that falls out of it: V at a NAV of 400 makes A worth 200 and B worth 100.
    const revised = recomputeRepricedValues(structure, { V: 400 });
    expect(revised.get('A')).toBe(200);
    expect(revised.get('B')).toBe(100);
  });

  it('reads back the 21 shipped ENDING_NAVs, code for code and cent for cent', () => {
    const result = readNavReportText(navPivotCsv(SHIPPED_TREE.product, SHIPPED_REPRICING.navByFund));
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.layout).toBe('pivot');
    expect(result.navByFund).toEqual(SHIPPED_REPRICING.navByFund);
    const joined = navJoinToModel(result.navByFund, known);
    expect(joined.unmatched).toEqual([]);
    expect(joined.matched.length).toBe(21);
    expect(joined.navByFund).toEqual(SHIPPED_REPRICING.navByFund);
  });

  /**
   * The whole point of the NAV slot: the file sets every price. Repricing the shipped structure with
   * the shipped NAVs has to land on the shipped revised figures, or an upload of the very file the
   * app was built from would move the book.
   */
  it('reprices the shipped structure back onto the shipped revised figures', () => {
    const result = readNavReportText(navPivotCsv(SHIPPED_TREE.product, SHIPPED_REPRICING.navByFund));
    if (result.kind !== 'applied') throw new Error(`expected applied, got ${result.kind}`);
    const structure = structureFromTree(SHIPPED_TREE.nodes);
    // The structure is read from the tree's paths: 16 holders with children, 23 with securities.
    expect(structure.apex).toEqual(SHIPPED_REPRICING.apex);
    expect([...structure.children.keys()].some((code) => code === '' || code == null)).toBe(false);
    expect(structure.scope.size).toBe(SHIPPED_REPRICING.nFunds);

    const next = applyNavOnly(
      SHIPPED_REPRICING,
      structure,
      navJoinToModel(result.navByFund, known).navByFund
    );
    expect(next.N).toBe(SHIPPED_REPRICING.N);
    expect(next.R).toBe(SHIPPED_REPRICING.R);
    expect(next.D).toBe(SHIPPED_REPRICING.D);
    expect(next.dPricing).toBe(SHIPPED_REPRICING.dPricing);
    expect(next.dNonPos).toBe(SHIPPED_REPRICING.dNonPos);
    expect(next.tie).toBe(SHIPPED_REPRICING.tie);
    expect(next.revByFund).toEqual(SHIPPED_REPRICING.revByFund);
    expect(next.navByFund).toEqual(SHIPPED_REPRICING.navByFund);
    expect(next.funds.map(fundFigures)).toEqual(SHIPPED_REPRICING.funds.map(fundFigures));
  });

  /**
   * The trap `docs/redesign-spec.md` §6 Q3 names, at full scale rather than on one fund: yesterday's
   * NAV in a column standing in FRONT of this period's, every code hand-dirtied with a non-breaking
   * space and lower-cased. If the reader took the first header containing "ending nav", or if the
   * join stopped matching, every price in the app would come from the wrong column — and the figures
   * below would move. They do not move at all.
   */
  it('ignores a PREV_DAY_ENDING_NAV column standing in front of this period’s', () => {
    const rows = ['As Of Date,Fund Code,PREV_DAY_ENDING_NAV,BEGINNING_NAV,ENDING_NAV'];
    for (const [code, nav] of Object.entries(SHIPPED_REPRICING.navByFund)) {
      // \u00A0 as an ESCAPE, not typed: a non-breaking space is invisible in a diff, and a
      // hand-edited feed arriving with one is exactly what normaliseCode was hardened for.
      rows.push(`2026-06-30,"\u00A0${code.toLowerCase()} ",${nav / 2},${nav / 3},${nav}`);
    }
    const result = readNavReportText(rows.join('\n') + '\n');
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') return;
    expect(result.layout).toBe('feed');
    const joined = navJoinToModel(result.navByFund, known);
    expect(joined.unmatched).toEqual([]);
    expect(joined.navByFund).toEqual(SHIPPED_REPRICING.navByFund);
    const next = applyNavOnly(SHIPPED_REPRICING, structureFromTree(SHIPPED_TREE.nodes), joined.navByFund);
    expect(next.R).toBe(SHIPPED_REPRICING.R);
    expect(next.dNonPos).toBe(SHIPPED_REPRICING.dNonPos);
    expect(next.funds.map(fundFigures)).toEqual(SHIPPED_REPRICING.funds.map(fundFigures));
  });
});

/* ================================================================= the position report */

describe('Position report round trip', () => {
  const rows = csvRows(positionReportCsv(SHIPPED_TREE, SHIPPED_REPRICING));

  it('is a report this product can read, describing this product and one other entity', () => {
    expect(positionReportProblem(rows)).toBeNull();
    const index = positionIndexFromRows(rows);
    const { entities, product } = positionEntities(index, SHIPPED_TREE.product);
    expect(product).toBe(SHIPPED_TREE.product);
    expect(entities).toContain(SHIPPED_TREE.product);
    /*
     * The units of a fund held outside the product are real rows under another fund entity, and the
     * codes holding them must not collide with the product's own — otherwise the rebuilt file would
     * give a fund inside the book a second parent and this oracle would be measuring itself.
     */
    const own = new Set(SHIPPED_REPRICING.funds.map((f) => f.code));
    const external = new Set(
      rows.slice(1).filter((r) => r[0] !== SHIPPED_TREE.product).map((r) => r[2] ?? '')
    );
    expect([...external].filter((code) => own.has(code))).toEqual([]);
    expect(external.size).toBeGreaterThan(1);
  });

  it('rebuilds all 149 hierarchy rows, field for field', () => {
    const index = positionIndexFromRows(rows);
    const tree = lookthroughFromPositions(index, SHIPPED_TREE.product, SHIPPED_TREE.asof);
    expect(tree.nodes.length).toBe(SHIPPED_TREE.nodes.length);
    expect(treeNodes(tree)).toEqual(treeNodes(SHIPPED_TREE));
    expect(tree.prodNAV).toBe(SHIPPED_TREE.prodNAV);
    expect(tree.grand).toBe(SHIPPED_TREE.grand);
    expect(tree.resid).toBe(SHIPPED_TREE.resid);
    expect(tree.bps).toBe(SHIPPED_TREE.bps);
    expect(tree.apexPos).toBe(SHIPPED_TREE.apexPos);
    expect(tree.grandVar).toBe(SHIPPED_TREE.grandVar);
  });

  it('rebuilds all 26 funds and the product totals, field for field', () => {
    const got = repriceFromPositions(
      positionIndexFromRows(rows),
      SHIPPED_REPRICING.navByFund,
      SHIPPED_TREE.product,
      SHIPPED_TREE.asof,
      SHIPPED_REPRICING.productCode
    );
    expect(repricingTotals(got)).toEqual(repricingTotals(SHIPPED_REPRICING));
    expect(got.funds.map((f) => f.code)).toEqual(SHIPPED_REPRICING.funds.map((f) => f.code));
    expect(got.funds.map(fundFigures)).toEqual(SHIPPED_REPRICING.funds.map(fundFigures));
    expect(got.funds.map(fundHoldings)).toEqual(SHIPPED_REPRICING.funds.map(fundHoldings));
  });

  /**
   * The same rows through a real workbook: SheetJS writes the bytes, `readWorkbookRows` reads them
   * back with its own `sheet_to_json`, and the figures still land on the fixture exactly. This is
   * the .xlsx the Position Report slot advertises, minus the script-tag load named at the top.
   */
  it('survives a real .xlsx written and read back through SheetJS', async () => {
    (globalThis as Record<string, unknown>).XLSX = sheetjs;
    const sheet = sheetjs.utils.aoa_to_sheet(positionReportRows(SHIPPED_TREE, SHIPPED_REPRICING));
    const book = sheetjs.utils.book_new();
    sheetjs.utils.book_append_sheet(book, sheet, 'Positions');
    const bytes = sheetjs.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const read = await readWorkbookRows(new Uint8Array(bytes));
    expect(read.length).toBe(rows.length);
    expect(positionReportProblem(read)).toBeNull();
    const got = repriceFromPositions(
      positionIndexFromRows(read),
      SHIPPED_REPRICING.navByFund,
      SHIPPED_TREE.product,
      SHIPPED_TREE.asof,
      SHIPPED_REPRICING.productCode
    );
    expect(repricingTotals(got)).toEqual(repricingTotals(SHIPPED_REPRICING));
    expect(got.funds.map(fundFigures)).toEqual(SHIPPED_REPRICING.funds.map(fundFigures));
  });

  /**
   * Who holds each fund, and in what share — exact for 25 of the 26. SPORTHLD is the exception, and
   * the loss is the FIXTURE's: it records 23 holders and lists 14 of them, because the model caps
   * the list at `TRUNCATE.simHolders`. The 9 it does not name are written back as one balancing row,
   * so the units outstanding stay exact and the share of every named holder is unchanged. The exact
   * size of the difference is asserted rather than tolerated.
   */
  it('rebuilds every holder list, and states the one the fixture truncates', () => {
    const got = repriceFromPositions(
      positionIndexFromRows(rows),
      SHIPPED_REPRICING.navByFund,
      SHIPPED_TREE.product,
      SHIPPED_TREE.asof
    );
    const byCode = new Map(got.funds.map((f) => [f.code, f]));
    for (const fund of SHIPPED_REPRICING.funds) {
      const mine = byCode.get(fund.code);
      if (!mine) throw new Error(`no rebuilt fund ${fund.code}`);
      if (fund.code === 'SPORTHLD') continue;
      expect(mine.nHolders, fund.code).toBe(fund.nHolders);
      expect(mine.holders.map((h) => [h.h, h.units, h.ownpct]), fund.code).toEqual(
        fund.holders.map((h) => [h.h, h.units, h.ownpct])
      );
    }
    const sporthld = byCode.get('SPORTHLD');
    const shipped = SHIPPED_REPRICING.funds.find((f) => f.code === 'SPORTHLD');
    expect(shipped?.nHolders).toBe(23);
    expect(shipped?.holders.length).toBe(14);
    expect(sporthld?.nHolders).toBe(15);
    const residual = sporthld?.holders.find((h) => h.h === EXTERNAL_HOLDER);
    expect(residual?.units).toBe(135113791.48999977);
    const named = new Set(shipped?.holders.map((h) => h.h));
    expect(sporthld?.holders.filter((h) => named.has(h.h)).map((h) => [h.h, h.units])).toEqual(
      shipped?.holders.slice(0, 13).map((h) => [h.h, h.units])
    );
  });
});

/* ================================================================= what cannot round trip */

describe('Position report round trip · the fields this path cannot produce', () => {
  const got = repriceFromPositions(
    positionIndexFromRows(csvRows(positionReportCsv(SHIPPED_TREE, SHIPPED_REPRICING))),
    SHIPPED_REPRICING.navByFund,
    SHIPPED_TREE.product,
    SHIPPED_TREE.asof,
    SHIPPED_REPRICING.productCode
  );
  const tree = lookthroughFromPositions(
    positionIndexFromRows(csvRows(positionReportCsv(SHIPPED_TREE, SHIPPED_REPRICING))),
    SHIPPED_TREE.product,
    SHIPPED_TREE.asof
  );

  /**
   * `dcN` and `recon` are emitted empty on purpose (spec §6 Q2: data nothing reads), and the exact
   * quantity of what is dropped is recorded here so "nothing reads it" stays a claim with a size
   * attached. Both are absent from `src/` — grep for `dcN` finds this path, the type and a comment;
   * `lookthrough.recon` has no reader at all.
   */
  it('drops dcN and recon, by exactly this much', () => {
    expect(SHIPPED_TREE.dcN).toBe(2061528573.1);
    expect(tree.dcN).toBe(0);
    expect(SHIPPED_TREE.recon.length).toBe(23);
    expect(tree.recon).toEqual([]);
  });

  /**
   * Three fields the shipped fixture carries and this path does not emit at all. None is read by any
   * screen — that is why they are recorded here rather than fixed: a figure no screen reads cannot
   * be wrong on screen, but an undeclared absence becomes a defect the moment one does.
   */
  it('emits no per-fund securities list, no holder symbol and no per-holding book value', () => {
    const shipped = fields(SHIPPED_REPRICING.funds[0]);
    const mine = fields(got.funds[0]);
    expect(shipped.code).toBe(mine.code);
    expect(shipped.nSecs).toBe(2);
    expect(Array.isArray(shipped.secs)).toBe(true);
    expect(mine.secs).toBeUndefined();
    expect(mine.nSecs).toBeUndefined();
    const withHolders = SHIPPED_REPRICING.funds.find((f) => f.holders.length) as RepricingFund;
    expect(fields(withHolders.holders[0]).sym).toBeTypeOf('string');
    const rebuilt = got.funds.find((f) => f.code === withHolders.code) as RepricingFund;
    expect(fields(rebuilt.holders[0]).sym).toBeUndefined();
    const holding = (SHIPPED_REPRICING.funds.find((f) => f.holdings.length) as RepricingFund).holdings[0];
    expect(fields(holding).carried).toBeTypeOf('number');
  });

  /**
   * The data faults are found again — same type, same fund, all six of them — but the sentences and
   * their order are this port's, not the original extract's. The wording is not a figure and no
   * parity key holds it; the pairing of fault to fund is what a controller acts on, so that is what
   * is asserted, and the divergence is stated instead of being smoothed over.
   */
  it('finds the same six data breaks, in its own words', () => {
    const pair = (b: { type: string; code: string }): string => `${b.type} ${b.code}`;
    expect([...got.breaks.map(pair)].sort()).toEqual([...SHIPPED_REPRICING.breaks.map(pair)].sort());
    expect(SHIPPED_REPRICING.breaks[0]?.detail).toBe(
      'held (GQ 200000000) but no ENDING_NAV in the NAV report'
    );
    expect(got.breaks.find((b) => b.code === 'APAV')?.detail).toBe('held but no ENDING_NAV');
  });
});
