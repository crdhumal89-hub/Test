/**
 * Rubric R4 and R14, driven rather than asserted.
 *
 * Every state in this file is REACHED in the browser: the loading state by holding a fixture fetch
 * open with `page.route`, the empty state by typing a filter that matches nothing or by serving a
 * product with no rows, the error state by serving the panel malformed data. Nothing here inspects
 * source code, and nothing asserts that a state "exists" — each one is rendered, read out of the
 * DOM and screenshot to docs/evidence/states/.
 *
 * Panels covered: the reconciliation tree, the price table, the repricing walk (three states each),
 * plus the structure graph's caught-error path, which is R14's named defect.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE, recordProblems, settled, expectClean } from './helpers.js';

const STATES_DIR = path.join(EVIDENCE, 'states');

/** How long a held fixture fetch stays outstanding. Long enough to read the loading state. */
const STATES_HOLD_MS = 8000;

const STATES_TREE = '#reconciliation-tree';
const STATES_TABLE = '#pricing-price-table';
const STATES_WALK = '#pricing-walk-table';

/**
 * Screenshot the state and record the sentence it actually rendered, so the evidence is the state
 * as the browser drew it rather than a claim about the code. Merged into one file; the suite runs
 * with a single worker, so read-modify-write is safe.
 */
async function statesShot(page: Page, name: string, reached: string, selector?: string): Promise<void> {
  fs.mkdirSync(STATES_DIR, { recursive: true });
  await page.screenshot({ path: path.join(STATES_DIR, `${name}.png`) });
  const log = path.join(STATES_DIR, 'states.json');
  const seen = fs.existsSync(log)
    ? (JSON.parse(fs.readFileSync(log, 'utf8')) as Record<string, unknown>)
    : {};
  seen[name] = {
    reached,
    selector: selector ?? null,
    rendered: selector
      ? (await page.locator(selector).innerText()).replace(/\s+/g, ' ').trim()
      : null,
    screenshot: `docs/evidence/states/${name}.png`,
  };
  fs.writeFileSync(log, JSON.stringify(seen, null, 1) + '\n');
}

/**
 * Serve a real fixture with one field rewritten, so the panel under test gets malformed data while
 * every other panel on the screen keeps working. This is what proves the state is panel-scoped.
 */
async function statesPatchFixture(
  page: Page,
  glob: string,
  patch: (body: Record<string, never>) => void
): Promise<void> {
  await page.route(glob, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, never>;
    patch(body);
    await route.fulfill({ json: body });
  });
}

/** Hold the lazily-fetched universe fixture open, so `data-fetching` stays set on <html>. */
async function statesHoldUniverse(page: Page): Promise<void> {
  await page.route('**/universe.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, STATES_HOLD_MS));
    await route.continue();
  });
}

/**
 * Reach a panel's loading state: open the Ownership lens, which fetches the 472 KiB universe, wait
 * until that fetch is genuinely outstanding, then mount the screen under test while it is in flight.
 */
async function statesMountWhileFetching(page: Page, hash: string): Promise<void> {
  await statesHoldUniverse(page);
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await expect(page.locator('#screen .state-loading')).toContainText('firm-wide ownership universe');
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-fetching')),
    'a fixture fetch must be outstanding for the loading state to be honest'
  ).toBe(true);
  await page.evaluate((next) => {
    location.hash = next;
  }, hash);
}

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

/* ------------------------------------------------------------------ R14: the caught error */

test('structure graph · a caught layout error surfaces outside the SVG and is recorded', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(String(error)));

  // Two roots: d3.stratify cannot build one tree from this, which is the throw the old handler
  // swallowed. The fixture's own circular and dangling mappings make it a live possibility.
  await statesPatchFixture(page, '**/lookthrough.json', (body) => {
    const nodes = body.nodes as unknown as Record<string, unknown>[];
    const apex = nodes.find((n) => n.kind === 'apex');
    if (apex) apex.path = `${String(apex.id)}/`;
  });
  await page.goto('/#/diagnose/structure', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#structure-graph-error .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('ownership structure could not be drawn');
  await expect(state).toContainText('do not form a single tree');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  expect(await state.getAttribute('role'), 'a screen reader must be told').toBe('alert');
  // The words used to be painted inside the SVG, where neither a reader nor a test could use them
  // (an SVG has no innerText at all, which is the point).
  const painted = await page.evaluate(
    () => document.querySelector('#structure-stage svg')?.textContent ?? ''
  );
  expect(painted, 'no error text painted inside the picture').not.toContain('structure unavailable');
  await statesShot(page, 'structure-graph-error', 'lookthrough.json served with a second root, so d3.stratify throws', '#structure-graph-error .state-error');

  // Recorded on the page AND re-thrown, so the headless suite sees a real failure, not silence.
  const recorded = await page.evaluate(
    () => (globalThis as { __structureGraphFailures?: string[] }).__structureGraphFailures ?? []
  );
  expect(recorded.length, 'the failure must be recorded').toBeGreaterThan(0);
  await expect
    .poll(() => failures.length, { message: 'the caught error must reach the console listener' })
    .toBeGreaterThan(0);
});

test('structure graph · the healthy path draws the graph and records nothing', async ({ page }) => {
  const { problems } = recordProblems(page);
  await page.goto('/#/diagnose/structure', { waitUntil: 'load' });
  await settled(page);

  await expect(page.locator('#structure-stage svg .strnode').first()).toBeVisible();
  expect(await page.locator('#structure-graph-error').count(), 'no error box on the healthy path').toBe(0);
  expect(
    await page.evaluate(
      () => (globalThis as { __structureGraphFailures?: string[] }).__structureGraphFailures ?? []
    )
  ).toEqual([]);
  expectClean(problems);
});
