/**
 * R13 — exports produce a file, and the file agrees with the screen.
 *
 * The bar is not "a file arrived". It is that at least three spot figures per export tie EXACTLY to
 * the figures rendered on screen at the moment of export, in the Repriced basis as well as at
 * current marks. The shipped check asserted `bytes > 200`, which is the test being fitted to the
 * code: it passed while the look-through CSV was byte-identical in both bases and contradicted the
 * screen under Repriced by ~$385,897 at the product line.
 *
 * So every assertion here goes through the file's own bytes — CSVs parsed as CSV (RFC 4180 quoting,
 * header-name lookup, not column indices), XLSX parsed with the same SheetJS 0.18.5 the app vendors
 * — and is compared against the string the app actually rendered, read out of `[data-parity="…"]`.
 * Nothing is recomputed from the fixtures: a test that recomputes cannot catch a formatter that
 * disagrees with an exporter.
 *
 * The look-through CSV and both workbooks are basis-sensitive and are checked in BOTH bases. The
 * send-to-pricing file is deliberately basis-invariant (a fund's publishable unit price is its own
 * NAV ÷ units whichever basis the screen shows) and that invariance is asserted, not assumed.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { gotoRoute, parityValue, recordProblems, settled, expectClean } from './helpers.js';

/** The three top-level feeders, which are the rows the parity map pins per code. */
const EXP_APEX = ['ASCHON', 'DUNK', 'SPORTHLD'] as const;
/** Funds that reach the send-to-pricing file: NAV reported and units outstanding non-zero. */
const EXP_PRICED = ['ASCHON', 'SPORTHLD', 'APCAXXII'] as const;
const EXP_PRODUCT_NODE = 'Apollo Sports Capital';

type ExpBasis = 'before' | 'after';
const EXP_BASES: ExpBasis[] = ['before', 'after'];

/* ------------------------------------------------------------------ the app's own formatters */
/**
 * Deliberate duplicates of `src/domain/money.ts`, kept here rather than imported: the point of the
 * check is that the file's NUMBER, put through the screen's formatting rule, reproduces the screen's
 * STRING. Importing the app's formatter would let a change to it move both sides at once.
 */
function expUsd(x: number): string {
  return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function expUsdParens(x: number): string {
  const core = Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return x < 0 ? `($${core})` : `$${core}`;
}
function expCount(x: number): string {
  return x ? Math.round(x).toLocaleString('en-US') : '0';
}
function expPrice(x: number): string {
  return x.toFixed(6);
}

/* ------------------------------------------------------------------ parsing */

/** RFC 4180 reader: quoted fields, doubled quotes, embedded commas and newlines. */
function expParseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A table addressed by header name, so adding a column cannot silently re-point an assertion. */
function expTable(header: string[], rows: string[][]) {
  const index = new Map(header.map((h, i) => [h, i]));
  const get = (row: string[], column: string): string => {
    const at = index.get(column);
    expect(at, `column "${column}" is missing; file has: ${header.join(' | ')}`).not.toBeUndefined();
    return (row[at as number] ?? '').trim();
  };
  const find = (predicate: (get: (column: string) => string) => boolean): string[] => {
    const hit = rows.find((r) => predicate((c) => get(r, c)));
    expect(hit, 'no row matched the predicate').toBeTruthy();
    return hit as string[];
  };
  return { header, rows, get, find };
}

function expNumber(cell: string): number {
  const value = Number(cell.replace(/[$,()]/g, ''));
  expect(Number.isFinite(value), `"${cell}" is not a number`).toBe(true);
  return value;
}

/**
 * Read a sheet as rows, exactly as SheetJS hands them over. The workbook is parsed from its own
 * bytes with the same library version the app vendors (0.18.5), so what is asserted is the file an
 * operator opens, not an in-memory structure the app happened to build.
 */
function expSheet(file: string, name: string): unknown[][] {
  const book = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sheet = book.Sheets[name];
  expect(sheet, `workbook has no "${name}" sheet; sheets are ${book.SheetNames.join(', ')}`).toBeTruthy();
  return XLSX.utils.sheet_to_json(sheet as never, { header: 1, raw: true, defval: null });
}

/** The Summary cover sheet is a label/value list, not a table. */
function expSummaryCell(rows: unknown[][], label: string): unknown {
  const row = rows.find((r) => String(r[0] ?? '').trim() === label);
  expect(row, `Summary has no "${label}" row`).toBeTruthy();
  return (row as unknown[])[1];
}

/* ------------------------------------------------------------------ driving the app */

async function expSetBasis(page: Page, basis: ExpBasis): Promise<void> {
  await page.locator(`#view-toggle button[data-view="${basis}"]`).click();
  await settled(page);
  await expect(page.locator(`#view-toggle button[data-view="${basis}"]`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

/** Click an export and return the bytes it produced, saved under test-results/. */
async function expGrab(page: Page, button: string, tag: string): Promise<string> {
  const wait = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(button, 'i') }).first().click();
  const download = await wait;
  const target = `test-results/r13-${tag}-${download.suggestedFilename()}`;
  await download.saveAs(target);
  const bytes = fs.statSync(target).size;
  expect(bytes, `${button} produced an empty file`).toBeGreaterThan(200);
  return target;
}

/** Read the string the app rendered for a parity key; fails rather than returning null. */
async function expScreen(page: Page, key: string): Promise<string> {
  const value = await parityValue(page, key);
  expect(value, `nothing on screen carries data-parity="${key}"`).not.toBeNull();
  return (value as string).trim();
}

/**
 * Assert one tie and count it. `ties` is asserted to reach three per export, which is the bar's
 * own wording — three SPOT FIGURES, not three columns.
 */
async function expTie(
  page: Page,
  ties: string[],
  key: string,
  fileValue: number,
  format: (x: number) => string
): Promise<void> {
  const onScreen = await expScreen(page, key);
  expect(format(fileValue), `${key}: file says ${fileValue}, screen says ${onScreen}`).toBe(onScreen);
  ties.push(`${key} = ${onScreen}`);
}

/* ------------------------------------------------------------------ 1. look-through CSV */

test('R13 · look-through CSV ties to the tree, in both bases', async ({ page }) => {
  const { problems } = recordProblems(page);
  const files: Record<ExpBasis, string> = { before: '', after: '' };

  for (const basis of EXP_BASES) {
    await gotoRoute(page, '#/reconciliation');
    await expSetBasis(page, basis);
    const file = await expGrab(page, 'export csv', `lookthrough-${basis}`);
    files[basis] = file;

    const parsed = expParseCsv(fs.readFileSync(file, 'utf8'));
    // Row 0 states the basis the figures were taken in; row 1 is the header.
    expect(parsed[0]?.[0]).toBe('Pricing basis');
    const activeToggle = (await page.locator('#view-toggle button.on').textContent())?.trim();
    expect(parsed[0]?.[1], 'the file must name the basis the screen was showing').toBe(activeToggle);

    const table = expTable(parsed[1] as string[], parsed.slice(2));
    const lookthrough = basis === 'after'
      ? 'Look-through value at repriced marks USD'
      : 'Look-through value USD';
    // The tree relabels the same column the same way, so the words must match too.
    const treeHeader = await expScreen(page, 'reconciliation.tree.column_headers');
    expect(treeHeader).toContain(basis === 'after' ? 'at repriced marks' : 'current marks');

    const ties: string[] = [];

    // The product line, against the tree's TOTALS row.
    const product = table.find((get) => get('Kind') === 'product' && get('Code') === EXP_PRODUCT_NODE);
    await expTie(page, ties, 'reconciliation.totals.derived_mv', expNumber(table.get(product, lookthrough)), expUsd);
    await expTie(page, ties, 'reconciliation.totals.revised_mv', expNumber(table.get(product, 'Repriced value USD')), expUsd);
    await expTie(page, ties, 'reconciliation.totals.nav', expNumber(table.get(product, 'NAV USD')), expUsd);

    // Every top-level feeder, against its own pinned row.
    for (const code of EXP_APEX) {
      const row = table.find((get) => get('Kind') === 'apex' && get('Code') === code);
      await expTie(page, ties, `reconciliation.apex.${code}.derived_mv`, expNumber(table.get(row, lookthrough)), expUsd);
      await expTie(page, ties, `reconciliation.apex.${code}.revised_mv`, expNumber(table.get(row, 'Repriced value USD')), expUsd);
      await expTie(page, ties, `reconciliation.apex.${code}.nav`, expNumber(table.get(row, 'NAV USD')), expUsd);
    }

    expect(ties.length, `only ${ties.length} figures tied in the ${basis} basis`).toBeGreaterThanOrEqual(3);
  }

  // The regression that R13 actually caught: one file for both bases. The look-through column is
  // basis-sensitive, so the two downloads must differ.
  expect(
    fs.readFileSync(files.before, 'utf8') === fs.readFileSync(files.after, 'utf8'),
    'the look-through CSV is byte-identical in both bases, so one of them disagrees with its screen'
  ).toBe(false);

  expectClean(problems);
});

/* ------------------------------------------------------------------ 2. reconciliation workbook */

test('R13 · reconciliation workbook ties to the waterfall, in both bases', async ({ page }) => {
  const { problems } = recordProblems(page);

  for (const basis of EXP_BASES) {
    await gotoRoute(page, '#/reconciliation');
    await expSetBasis(page, basis);
    const file = await expGrab(page, 'download excel', `recon-${basis}`);

    const summary = expSheet(file, 'Summary');
    const activeToggle = (await page.locator('#view-toggle button.on').textContent())?.trim();
    expect(String(expSummaryCell(summary, 'Pricing basis')).trim()).toBe(activeToggle);

    const after = basis === 'after';
    const startLabel = after ? 'Look-through value at repriced marks' : 'Look-through value';
    // The waterfall's first step answers to a different parity key per basis, and so do its words;
    // the file's first row has to move with both.
    const wf = (slot: string): string =>
      after ? `reconciliation.after.${slot}` : `reconciliation.waterfall.${slot}`;
    expect(await expScreen(page, wf('start_label'))).toBe(startLabel);

    const ties: string[] = [];
    const summaryRows: [string, string, (x: number) => string][] = [
      [startLabel, after ? 'repriced_mv' : 'derived_mv', expUsd],
      ['= Repriced value', 'revised_mv', expUsd],
      ['= NAV', 'nav', expUsd],
      ['+ Pricing difference', 'delta_pricing_usd', expUsdParens],
      ['+ Non-position difference', 'delta_nonposition_usd', expUsdParens],
    ];
    for (const [label, slot, format] of summaryRows) {
      await expTie(page, ties, wf(slot), Number(expSummaryCell(summary, label)), format);
    }
    expect(ties.length).toBeGreaterThanOrEqual(3);

    /**
     * R9's fix, seen from the outside. The Exception column used to invent its own wording
     * ("Material non-position difference") from its own private copy of the threshold, so the file
     * and the screen disagreed in words as well as in provenance. Both now come from
     * `groupExceptions`, which means the file's vocabulary must be exactly the chips' vocabulary —
     * including the rename the repriced basis applies — and its gloss must be the chips' tooltip.
     */
    const chips = await page.$$eval('#reconciliation-exceptions [data-exception]', (nodes) =>
      nodes.map((n) => ({
        title: n.getAttribute('data-exception') ?? '',
        tip: n.getAttribute('title') ?? '',
        count: Number(n.querySelector('.chip-count')?.textContent ?? '0'),
      }))
    );
    expect(chips.length, 'the exception strip should be showing categories').toBeGreaterThan(0);

    const recon = expSheet(file, 'Reconciliation');
    const header = (recon[0] ?? []).map((h) => String(h ?? ''));
    const at = (column: string): number => {
      const i = header.indexOf(column);
      expect(i, `Reconciliation sheet has no "${column}" column`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const rows = recon.slice(1);
    const titlesOf = (row: unknown[]): string[] =>
      String(row[at('Exception')] ?? '').split('; ').filter(Boolean);

    const onScreen = new Map(chips.map((c) => [c.title, c]));
    for (const row of rows) {
      for (const title of titlesOf(row)) {
        expect(
          onScreen.has(title),
          `the file says "${title}" but no chip on screen does; chips are ${[...onScreen.keys()].join(' | ')}`
        ).toBe(true);
      }
      const meaning = String(row[at('What the exception means')] ?? '');
      const expected = titlesOf(row)
        .map((t) => onScreen.get(t)?.tip ?? '')
        .filter(Boolean)
        .join('; ');
      expect(meaning).toBe(expected);
    }

    // And per category, the file flags exactly as many funds as the chip counts.
    for (const chip of chips) {
      const flagged = rows.filter((r) => titlesOf(r).includes(chip.title)).length;
      // A chip may also count a structural break keyed to an entity that is not one of the 26 funds
      // (a dangling SPV, say), so the file's count is a lower bound on the chip's, never higher.
      expect(
        flagged,
        `"${chip.title}": chip says ${chip.count}, file flags ${flagged} funds`
      ).toBeLessThanOrEqual(chip.count);
    }
    const anyFlagged = rows.filter((r) => titlesOf(r).length > 0).length;
    expect(anyFlagged, 'no fund carried an exception into the file').toBeGreaterThan(0);
  }

  expectClean(problems);
});

/* ------------------------------------------------------------------ 3. pricing workbook */

test('R13 · pricing workbook ties to the pricing screen, in both bases', async ({ page }) => {
  const { problems } = recordProblems(page);

  for (const basis of EXP_BASES) {
    await gotoRoute(page, '#/pricing');
    await expSetBasis(page, basis);
    const file = await expGrab(page, 'download excel', `pricing-${basis}`);

    const summary = expSheet(file, 'Summary');
    const activeToggle = (await page.locator('#view-toggle button.on').textContent())?.trim();
    expect(String(expSummaryCell(summary, 'Pricing basis')).trim()).toBe(activeToggle);

    const sheet = expSheet(file, 'Pricing');
    const table = expTable(
      (sheet[0] ?? []).map((h) => String(h ?? '')),
      sheet.slice(1).map((r) => r.map((c) => (c == null ? '' : String(c))))
    );

    const ties: string[] = [];
    for (const code of EXP_PRICED) {
      const row = table.find((get) => get('Code') === code);
      const walk = (slot: string): string => `pricing.walk.fund.${code}.${slot}`;
      // The Repricing walk is the Pricing screen's other arrangement of the same 26 funds — it is
      // rendered on this screen, in both bases, which is why the workbook's units and NAV columns
      // have somewhere on screen to tie to.
      await expTie(page, ties, walk('global_qty'), expNumber(table.get(row, 'Units outstanding')), expCount);
      await expTie(page, ties, walk('nav'), expNumber(table.get(row, 'NAV')), expUsd);
      await expTie(page, ties, walk('price_after'), expNumber(table.get(row, 'Repriced unit price')), expPrice);
      await expTie(page, ties, walk('value_before'), expNumber(table.get(row, 'Look-through value')), expUsd);
      await expTie(page, ties, walk('value_after'), expNumber(table.get(row, 'Repriced value')), expUsd);
    }
    expect(ties.length).toBeGreaterThanOrEqual(3);
  }

  expectClean(problems);
});

/* ------------------------------------------------------------------ 4. send-to-pricing CSV */

test('R13 · send-to-pricing CSV ties to the pricing screen and is basis-invariant', async ({ page }) => {
  const { problems } = recordProblems(page);

  await gotoRoute(page, '#/pricing');
  await expSetBasis(page, 'before');
  const before = await expGrab(page, 'export pricing', 'sendto-before');

  const parsed = expParseCsv(fs.readFileSync(before, 'utf8'));
  const table = expTable(parsed[0] as string[], parsed.slice(1));
  expect(table.header).toEqual(['Symbol', 'Respective Qty', 'Local Price', 'Local MV']);

  const ties: string[] = [];
  for (const code of EXP_PRICED) {
    // The symbol the screen shows for this fund is the key the downstream system is addressed by.
    const symbol = await expScreen(page, `pricing.fund.${code}.symbol`);
    const row = table.find((get) => get('Symbol') === symbol);

    // Every one of the three numeric columns is a figure the Pricing screen renders: the publish
    // price in the price table, the quantity and the market value in the Repricing walk beside it.
    await expTie(page, ties, `pricing.fund.${code}.publish_px`, expNumber(table.get(row, 'Local Price')), expPrice);
    await expTie(page, ties, `pricing.walk.fund.${code}.global_qty`, expNumber(table.get(row, 'Respective Qty')), expCount);
    await expTie(page, ties, `pricing.walk.fund.${code}.nav`, expNumber(table.get(row, 'Local MV')), expUsd);
  }
  expect(ties.length).toBeGreaterThanOrEqual(3);

  // A fund's publishable unit price is its own NAV ÷ units outstanding, which does not move with the
  // basis the screen is showing. So this file MUST be identical in both bases — the opposite
  // requirement to the look-through CSV, and asserted rather than left as a claim.
  await expSetBasis(page, 'after');
  const after = await expGrab(page, 'export pricing', 'sendto-after');
  expect(fs.readFileSync(after, 'utf8')).toBe(fs.readFileSync(before, 'utf8'));

  expectClean(problems);
});
