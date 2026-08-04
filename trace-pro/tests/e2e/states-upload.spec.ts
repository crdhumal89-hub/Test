/**
 * Rubric R4 for the two upload slots — and the proof that they upload.
 *
 * The slots used to be inert descriptions that pointed at the Reconciliation screen: "the recompute is
 * wired on the Reconciliation screen — upload there", with each slot reading "Accepted on the
 * Reconciliation screen". No file input existed anywhere in the app, so the instruction could not be
 * followed. These tests assert the opposite of that: that both slots take a file HERE, in the drawer,
 * and that each of them has all three R4 states.
 *
 * The uploaded files are generated from the SHIPPED fixtures at test time rather than committed, so
 * the fund codes really are this product's codes and the join is a real join. Nothing about the
 * default state of the app changes — the parity harness never uploads — so the frozen status string
 * "Loaded base dataset. Upload either file to recompute every tab." is still what the footer says on
 * load, and is now also true.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { recordProblems, settled, expectClean } from './helpers.js';
import { statesShot } from './states-helpers.js';

const UPLOAD_DIR = path.resolve(import.meta.dirname, '../../test-results/uploads');
const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../data/apollo-sports-capital/2026-06-30'
);

interface UploadRepricing {
  navByFund: Record<string, number>;
}

function uploadWrite(name: string, text: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(file, text);
  return file;
}

function uploadNavByFund(): Record<string, number> {
  const repricing = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'repricing.json'), 'utf8')
  ) as UploadRepricing;
  return repricing.navByFund;
}

/** A NAV report in the pivot layout, every fund lifted by 1%, so the recompute is visible. */
function uploadNavPivot(name: string, factor: number): string {
  const rows = ['PRODUCT,FUND_CODE,ENDING_NAV,SYMBOL,UNITS,CARRIED'];
  for (const [code, nav] of Object.entries(uploadNavByFund())) {
    rows.push(`"Apollo Sports Capital","${code}",${(nav * factor).toFixed(2)},,,`);
  }
  return uploadWrite(name, rows.join('\n') + '\n');
}

/**
 * A per-fund feed with a PREV_DAY_ENDING_NAV column standing in front of the real one. If the reader
 * ever picked the first column whose name contains "ending nav", every price in the app would come
 * from yesterday — the trap `docs/redesign-spec.md` §6 Q3 names.
 */
function uploadNavFeedWithTrap(name: string): string {
  const rows = ['As Of Date,Fund Code,PREV_DAY_ENDING_NAV,ENDING_NAV'];
  for (const [code, nav] of Object.entries(uploadNavByFund())) {
    // The code arrives lower-cased and with a non-breaking space, as a hand-edited feed does.
    rows.push(`2026-06-30,"\u00A0${code.toLowerCase()} ",${(nav * 0.5).toFixed(2)},${nav.toFixed(2)}`);
  }
  return uploadWrite(name, rows.join('\n') + '\n');
}

/** A position report rebuilt from the shipped hierarchy: holder, investee, units, market value. */
function uploadPositionReport(name: string): string {
  const lookthrough = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'lookthrough.json'), 'utf8')) as {
    prodNAV: number;
    nodes: { id: number; path: string; kind: string; code: string; name: string; issuer: string; units: number; carried: number; mv100: number }[];
  };
  const byId = new Map(lookthrough.nodes.map((n) => [n.id, n]));
  const holderOf = (node: { path: string }): string => {
    const trail = node.path.split('/').filter(Boolean).map(Number);
    const parent = trail.length > 1 ? byId.get(trail[trail.length - 2] as number) : undefined;
    return parent?.code ?? '';
  };
  const entity = 'Apollo Sports Capital';
  const nav = lookthrough.prodNAV;
  const rows = [
    'Fund Entity,Fund,Fund Code,SPV Fund Code,Security Code,Security,Issuer,Quantity VPM,MV USD,NAV End USD',
  ];
  for (const node of lookthrough.nodes) {
    if (node.kind === 'vehicle') {
      const holder = holderOf(node);
      rows.push(`"${entity}","${holder}","${holder}","${node.code}","${node.code}","${node.name}",,${node.units},${node.carried},${nav}`);
    } else if (node.kind === 'leaf') {
      const holder = holderOf(node);
      rows.push(`"${entity}","${holder}","${holder}",,"${node.code}","${node.name}","${node.issuer}",${node.units},${node.mv100},${nav}`);
    } else if (node.kind === 'apex') {
      rows.push(`"${entity}","${node.code}","${node.code}",,"CASH-${node.code}","Feeder residual","",0,0,${nav}`);
    }
  }
  return uploadWrite(name, rows.join('\n') + '\n');
}

async function uploadOpenDrawer(page: Page): Promise<void> {
  await page.goto('/#/reconciliation', { waitUntil: 'load' });
  await settled(page);
  await page.locator('#open-sources').click();
  await expect(page.locator('#sources-drawer')).toBeVisible();
}

/* ------------------------------------------------------------------ the resting state */

test('upload slots · both are real file inputs, in the drawer that describes them', async ({ page }) => {
  const { problems } = recordProblems(page);
  await uploadOpenDrawer(page);

  // The measurement the critic made — file inputs anywhere in the app — must no longer be zero.
  expect(await page.locator('input[type="file"]').count(), 'the drawer must accept files').toBe(2);
  await expect(page.locator('#sources-file-position')).toHaveAttribute('accept', /xlsx/);
  await expect(page.locator('#sources-file-nav')).toHaveAttribute('accept', /csv/);
  // And no sentence may send the reader somewhere else to do it.
  const note = await page.locator('#sources-upload-note').innerText();
  expect(note).toContain('Both slots are live here, in this drawer');
  expect(note).not.toContain('Reconciliation screen');
  const drawer = await page.locator('#sources-drawer').innerText();
  expect(drawer).not.toContain('Accepted on the Reconciliation screen');
  // The frozen status string is untouched until something is actually uploaded.
  await expect(page.locator('#ubstatus')).toHaveText(
    'Loaded base dataset. Upload either file to recompute every tab.'
  );
  // Each slot states where it stands before anything is chosen — never blank.
  await expect(page.locator('#sources-state-nav')).toContainText('No nav report uploaded');
  await expect(page.locator('#sources-state-position')).toContainText('No position report uploaded');
  await statesShot(page, 'upload-slots-resting', 'the Data sources drawer opened on load', '#sources-drawer .sources-slots');
  expectClean(problems);
});

/* ------------------------------------------------------------------ the NAV slot */

test('NAV slot · LOADING while a large report is being read', async ({ page }) => {
  const { problems } = recordProblems(page);
  // 30,000 rows: the reader works in chunks and yields between them, so the state is on screen for
  // long enough to be read rather than being a frame nobody sees.
  const rows = ['PRODUCT,FUND_CODE,ENDING_NAV'];
  for (let i = 0; i < 30_000; i += 1) rows.push(`"Apollo Sports Capital","ZZ${i}",${1000 + i}`);
  for (const [code, nav] of Object.entries(uploadNavByFund())) {
    rows.push(`"Apollo Sports Capital","${code}",${nav.toFixed(2)}`);
  }
  const file = uploadWrite('nav-large.csv', rows.join('\n') + '\n');

  await uploadOpenDrawer(page);
  await page.locator('#sources-file-nav').setInputFiles(file);
  const state = page.locator('#sources-state-nav .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('nav-large.csv');
  await expect(state).toContainText('reading');
  await statesShot(page, 'upload-nav-loading', 'a 30,000-row NAV report chosen in the NAV slot; the reader yields between chunks', '#sources-state-nav .state-loading');

  // Transient, not a dead end.
  await expect(page.locator('#sources-state-nav')).toContainText('applied', { timeout: 30_000 });
  expectClean(problems);
});

test('NAV slot · EMPTY when the report has no fund rows to apply', async ({ page }) => {
  const { problems } = recordProblems(page);
  const file = uploadWrite('nav-headers-only.csv', 'PRODUCT,FUND_CODE,ENDING_NAV\n');
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-nav').setInputFiles(file);

  const state = page.locator('#sources-state-nav .state-empty');
  await expect(state).toBeVisible();
  await expect(state).toContainText('no fund rows under its header');
  await expect(state).toContainText('shipped figures are still on display');
  await expect(state.locator('button')).toHaveText('Choose a different file');
  // The panel is empty; the screen is not. Every figure behind the drawer is unchanged.
  await expect(page.locator('#ubstatus')).toContainText('Loaded base dataset');
  await statesShot(page, 'upload-nav-empty', 'a NAV report with a header row and nothing under it', '#sources-state-nav .state-empty');
  expectClean(problems);
});

test('NAV slot · ERROR when the file is not a NAV report, announced with what was wanted', async ({ page }) => {
  const { problems } = recordProblems(page);
  const file = uploadWrite('minutes.csv', 'Some,Meeting,Minutes\n1,2,3\n');
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-nav').setInputFiles(file);

  const state = page.locator('#sources-state-nav .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('No net asset values could be read');
  await expect(state).toContainText('ENDING_NAV');
  await expect(state).toContainText('Nothing on any screen has changed');
  expect(await state.getAttribute('role'), 'a failure must be announced').toBe('alert');
  await expect(state.locator('button')).toHaveText('Choose a different file');
  await statesShot(page, 'upload-nav-error', 'a file with none of a NAV report’s columns chosen in the NAV slot', '#sources-state-nav .state-error');
  expectClean(problems);
});

test('NAV slot · a position report in the NAV slot is named, not silently ignored', async ({ page }) => {
  const { problems } = recordProblems(page);
  const file = uploadPositionReport('position-in-nav-slot.csv');
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-nav').setInputFiles(file);

  const state = page.locator('#sources-state-nav .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('looks like a Position Report, not a NAV report');
  await expect(state).toContainText('Upload it in the Position Report slot');
  expectClean(problems);
});

test('NAV slot · an applied report reprices the reconciliation, and yesterday’s NAV column is ignored', async ({ page }) => {
  const { problems } = recordProblems(page);
  await uploadOpenDrawer(page);
  const nav = page.locator('[data-parity="reconciliation.waterfall.nav"]');
  await expect(nav).toHaveText('$2,062,198,836');

  // Every fund lifted 1%: the published NAV must move by 1%, which proves the recompute is real.
  await page.locator('#sources-file-nav').setInputFiles(uploadNavPivot('nav-plus-one-percent.csv', 1.01));
  await expect(page.locator('#sources-state-nav')).toContainText('applied', { timeout: 20_000 });
  await expect(page.locator('#ubstatus')).toContainText('NAV report “nav-plus-one-percent.csv” applied');
  await page.locator('#sources-close').click();
  await settled(page);
  await expect(nav).toHaveText('$2,082,820,824');
  await statesShot(page, 'upload-nav-applied', 'a NAV report with every fund lifted 1% applied in the drawer', '#reconciliation-waterfall');

  // Now the same report as a per-fund feed carrying a PREV_DAY_ENDING_NAV column in front of the real
  // one, with dirty codes. The published NAV must land back on the shipped figure to the cent.
  await page.locator('#open-sources').click();
  await page.locator('#sources-file-nav').setInputFiles(uploadNavFeedWithTrap('nav-feed-with-prev-day.csv'));
  await expect(page.locator('#sources-state-nav')).toContainText('applied', { timeout: 20_000 });
  await page.locator('#sources-close').click();
  await settled(page);
  await expect(nav).toHaveText('$2,062,198,836');
  expectClean(problems);
});

/* ------------------------------------------------------------------ the Position slot */

test('position slot · LOADING while the spreadsheet library is still arriving', async ({ page }) => {
  const { problems } = recordProblems(page);
  // A workbook is read through the vendored library, which is fetched on demand — so holding that
  // request is how this loading state is reached deterministically.
  await page.route('**/vendor/xlsx.full.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue();
  });
  const file = uploadWrite('positions.xlsx', 'Fund Code,SPV Fund Code,Quantity VPM,MV USD\nA,B,1,2\n');
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-position').setInputFiles(file);

  const state = page.locator('#sources-state-position .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('positions.xlsx');
  await statesShot(page, 'upload-position-loading', 'a workbook chosen while vendor/xlsx.full.min.js is held open by page.route', '#sources-state-position .state-loading');
  expectClean(problems);
});

test('position slot · EMPTY when the report describes no holdings for this product', async ({ page }) => {
  const { problems } = recordProblems(page);
  const file = uploadWrite(
    'positions-other-entity.csv',
    'Fund Entity,Fund Code,SPV Fund Code,Quantity VPM,MV USD\n' +
      '"Some Other Product","AAA","","0","0"\n'
  );
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-position').setInputFiles(file);

  const state = page.locator('#sources-state-position .state-empty');
  await expect(state).toBeVisible();
  await expect(state).toContainText('describes no holdings');
  await expect(state).toContainText('shipped structure is still on display');
  await expect(state.locator('button')).toHaveText('Choose a different file');
  await statesShot(page, 'upload-position-empty', 'a position report whose only row is for a different fund entity', '#sources-state-position .state-empty');
  expectClean(problems);
});

test('position slot · ERROR when the columns it needs are missing', async ({ page }) => {
  const { problems } = recordProblems(page);
  const file = uploadWrite('not-positions.csv', 'Ticker,Price\nABC,1.23\n');
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-position').setInputFiles(file);

  const state = page.locator('#sources-state-position .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('could not be read as a Position Report');
  await expect(state).toContainText('Fund Code');
  await expect(state).toContainText('Quantity VPM');
  expect(await state.getAttribute('role'), 'a failure must be announced').toBe('alert');
  await expect(state.locator('button')).toHaveText('Choose a different file');
  await statesShot(page, 'upload-position-error', 'a two-column file with none of a position report’s columns', '#sources-state-position .state-error');
  expectClean(problems);
});

test('position slot · an applied report rebuilds the hierarchy the tree draws', async ({ page }) => {
  const { problems } = recordProblems(page);
  await uploadOpenDrawer(page);
  await page.locator('#sources-file-position').setInputFiles(uploadPositionReport('positions-rebuilt.csv'));
  await expect(page.locator('#sources-state-position')).toContainText('applied', { timeout: 30_000 });
  const applied = await page.locator('#sources-state-position').innerText();
  expect(applied).toContain('hierarchy rows rebuilt');
  await expect(page.locator('#ubstatus')).toContainText('Position report “positions-rebuilt.csv” applied');

  await page.locator('#sources-close').click();
  await settled(page);
  // The tree redrew from the uploaded file, with its expansion recomputed rather than left pointing
  // at node ids from the file it replaced.
  await expect(page.locator('#reconciliation-tree table')).toBeVisible();
  expect(await page.locator('#tree tbody tr').count()).toBeGreaterThan(0);
  expect(await page.locator('#reconciliation-tree .state-error').count(), 'a rebuilt tree must still render').toBe(0);
  await statesShot(page, 'upload-position-applied', 'a position report rebuilt from the shipped hierarchy, applied in the drawer', '#reconciliation-tree');
  expectClean(problems);
});
