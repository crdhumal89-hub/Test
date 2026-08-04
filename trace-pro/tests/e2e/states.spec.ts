/**
 * Rubric R4 and R14, driven rather than asserted — the reconciliation tree, the price table and the
 * repricing walk.
 *
 * Every state in this file is REACHED in the browser: the loading state by holding a fixture fetch
 * open with `page.route`, the empty state by typing a filter that matches nothing or by serving a
 * product with no rows, the error state by serving the panel malformed data. Nothing here inspects
 * source code, and nothing asserts that a state "exists" — each one is rendered, read out of the
 * DOM and screenshot to docs/evidence/states/.
 *
 * The other R4 panels the rubric enumerates are driven the same way in their own files, because one
 * file for ten panels would be past the length limit: `states-lenses.spec.ts` (the four Diagnose
 * lenses), `states-universe.spec.ts` (the lazily fetched universe and the combobox result lists) and
 * `states-upload.spec.ts` (the two upload slots).
 */
import { test, expect, type Page } from '@playwright/test';
import { recordProblems, settled, expectClean } from './helpers.js';
import { statesPatchFixture, statesMountWhileFetching, statesShot } from './states-helpers.js';

const STATES_TREE = '#reconciliation-tree';
const STATES_TABLE = '#pricing-price-table';
const STATES_WALK = '#pricing-walk-table';

/* ------------------------------------------------------------------ the reconciliation tree */

test('tree · LOADING while a fixture fetch is outstanding', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesMountWhileFetching(page, '#/reconciliation');

  const state = page.locator(`${STATES_TREE} .state-loading`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the look-through hierarchy');
  expect(await page.locator('#tree').count(), 'no half-built table under the loading state').toBe(0);
  await statesShot(page, 'tree-loading', 'universe.json held open by page.route, then the Reconciliation screen mounted while data-fetching was set', `${STATES_TREE} .state-loading`);

  // The state is transient, not a dead end: when the fetch settles the rows come back.
  await expect(page.locator('#tree tbody tr.rowv')).toHaveCount(9, { timeout: 20_000 });
  expectClean(problems);
});

test('tree · EMPTY when the product has no look-through rows', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/lookthrough.json', (body) => {
    Object.assign(body, { nodes: [] });
  });
  await page.goto('/#/reconciliation', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator(`${STATES_TREE} .state-empty`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('no look-through rows');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  expect(await page.locator(`${STATES_TREE} table`).count(), 'no bare empty table').toBe(0);
  await statesShot(page, 'tree-empty', 'lookthrough.json served with nodes: []', `${STATES_TREE} .state-empty`);
  expectClean(problems);
});

test('tree · ERROR when the hierarchy arrives malformed', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/lookthrough.json', (body) => {
    for (const node of body.nodes as unknown as Record<string, unknown>[]) delete node.path;
  });
  await page.goto('/#/reconciliation', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator(`${STATES_TREE} .state-error`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('could not be laid out');
  await expect(state).toContainText('carry no position in the hierarchy');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  // The panel failed; the screen did not. The waterfall above it still answers the question.
  await expect(page.locator('[data-parity="reconciliation.waterfall.nav"]')).toContainText('$2,062,198,836');
  expect(await page.locator(`${STATES_TREE}`).innerText()).not.toBe('—');
  await statesShot(page, 'tree-error', 'lookthrough.json served with every row’s path deleted', `${STATES_TREE} .state-error`);
  expectClean(problems);
});

/* ------------------------------------------------------------------ the price table */

test('price table · LOADING while a fixture fetch is outstanding', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesMountWhileFetching(page, '#/pricing');

  const state = page.locator(`${STATES_TABLE} .state-loading`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the prices to publish');
  expect(await page.locator('#rectable').count(), 'no price is readable while it may change').toBe(0);
  await statesShot(page, 'price-table-loading', 'universe.json held open by page.route, then the Pricing screen mounted while data-fetching was set', `${STATES_TABLE} .state-loading`);

  await expect(page.locator('#rectable tbody tr.row')).toHaveCount(26, { timeout: 20_000 });
  expectClean(problems);
});

test('price table · EMPTY when the filter matches nothing, and the recovery works', async ({ page }) => {
  const { problems } = recordProblems(page);
  await page.goto('/#/pricing', { waitUntil: 'load' });
  await settled(page);
  await page.locator('#pricing-filter').fill('zzzz');
  await settled(page);

  const state = page.locator(`${STATES_TABLE} .state-empty`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('No fund matches “zzzz”');
  await expect(state).toContainText('All 26 funds are still here');
  await statesShot(page, 'price-table-empty', 'the filter typed as zzzz, which matches none of the 26 funds', `${STATES_TABLE} .state-empty`);

  await state.locator('button', { hasText: 'Clear the filter' }).click();
  await settled(page);
  await expect(page.locator('#rectable tbody tr.row')).toHaveCount(26);
  expectClean(problems);
});

test('price table · ERROR when the fund rows arrive malformed', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/repricing.json', (body) => {
    for (const fund of body.funds as unknown as Record<string, unknown>[]) {
      fund.ltv = 'n/a';
      fund.rev = 'n/a';
    }
  });
  await page.goto('/#/pricing', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator(`${STATES_TABLE} .state-error`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('table of prices to publish could not be built');
  await expect(state).toContainText('26 fund rows carry no usable value to price from');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  expect(await page.locator(`${STATES_TABLE}`).innerText(), 'never a bare em-dash').not.toContain('$NaN');
  await statesShot(page, 'price-table-error', 'repricing.json served with every fund’s ltv and rev as a non-number', `${STATES_TABLE} .state-error`);
  expectClean(problems);
});

/* ------------------------------------------------------------------ the repricing walk */

/** The walk shares the Pricing screen with the price table, behind a named subview control. */
async function statesShowWalk(page: Page): Promise<void> {
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settled(page);
}

test('repricing walk · LOADING while a fixture fetch is outstanding', async ({ page }) => {
  const { problems } = recordProblems(page);
  await page.goto('/#/pricing', { waitUntil: 'load' });
  await settled(page);
  await statesShowWalk(page);
  // The subview lives in the store, so it survives leaving the screen and coming back (R16).
  await statesMountWhileFetching(page, '#/pricing');

  const state = page.locator(`${STATES_WALK} .state-loading`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the repricing walk');
  await statesShot(page, 'repricing-walk-loading', 'universe.json held open by page.route, then the Pricing screen mounted on the walk subview while data-fetching was set', `${STATES_WALK} .state-loading`);

  await expect(page.locator(`${STATES_WALK} tbody tr.row`)).toHaveCount(27, { timeout: 20_000 });
  expectClean(problems);
});

test('repricing walk · EMPTY when the filter matches nothing, and the recovery works', async ({ page }) => {
  const { problems } = recordProblems(page);
  await page.goto('/#/pricing', { waitUntil: 'load' });
  await settled(page);
  await statesShowWalk(page);
  await page.locator('#pricing-filter').fill('zzzz');
  await settled(page);

  const state = page.locator(`${STATES_WALK} .state-empty`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('No fund matches “zzzz”');
  await statesShot(page, 'repricing-walk-empty', 'the filter typed as zzzz, which matches none of the 26 funds', `${STATES_WALK} .state-empty`);

  await state.locator('button', { hasText: 'Clear the filter' }).click();
  await settled(page);
  await expect(page.locator(`${STATES_WALK} tbody tr.row`)).toHaveCount(27);
  expectClean(problems);
});

test('repricing walk · ERROR when the fund rows arrive malformed', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/repricing.json', (body) => {
    for (const fund of body.funds as unknown as Record<string, unknown>[]) {
      fund.ltv = 'n/a';
      fund.rev = 'n/a';
    }
  });
  await page.goto('/#/pricing', { waitUntil: 'load' });
  await settled(page);
  await statesShowWalk(page);

  const state = page.locator(`${STATES_WALK} .state-error`);
  await expect(state).toBeVisible();
  await expect(state).toContainText('repricing walk could not be built');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  await statesShot(page, 'repricing-walk-error', 'repricing.json served with every fund’s ltv and rev as a non-number', `${STATES_WALK} .state-error`);
  expectClean(problems);
});
