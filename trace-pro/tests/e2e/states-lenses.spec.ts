/**
 * Rubric R4 for two of the four Diagnose lenses: Structure and Simulator.
 *
 * These two are the lenses that draw a picture from a file, so their three states are: the vendored
 * graph library still arriving (loading, reached by holding `vendor/d3.min.js` open — the same trick
 * the other suites use on a fixture, applied to the dependency this lens actually waits for), a file
 * that describes nothing (empty), and a file that describes something impossible (error).
 *
 * The Ownership and Data quality lenses live in `states-universe.spec.ts`, because their three states
 * are all states of the 472 KiB universe fetch they share.
 *
 * Two of these tests are regression tests for named defects:
 *   · the Structure lens used to render its caption as "0 entities joined by 0 ownership links" while
 *     the library was still loading — a figure of zero standing in for a figure not yet known;
 *   · the Simulator lens used to throw `TypeError: … reduce is not a function` out of its own mount on
 *     a malformed `simulator.json`, leaving an empty panel and putting the only explanation in the
 *     developer console.
 */
import { test, expect } from '@playwright/test';
import { recordProblems, settled, expectClean } from './helpers.js';
import { statesPatchFixture, statesShot, STATES_HOLD_MS } from './states-helpers.js';

/** Hold the vendored graph library, which is what both graph lenses are waiting for. */
async function lensesHoldGraphLibrary(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/vendor/d3.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, STATES_HOLD_MS));
    await route.continue();
  });
}

/* ------------------------------------------------------------------ Structure */

test('structure lens · LOADING while the graph library is still arriving', async ({ page }) => {
  const { problems } = recordProblems(page);
  await lensesHoldGraphLibrary(page);
  await page.goto('/#/diagnose/structure', { waitUntil: 'load' });

  const state = page.locator('#structure-stage [data-stage-state="loading"] .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the ownership structure graph');
  // The caption must not publish counts it does not have yet. This is the regression.
  const caption = page.locator('#structure-caption');
  await expect(caption).toContainText('still loading');
  await expect(caption).not.toContainText('0 entities');
  await statesShot(page, 'structure-lens-loading', 'vendor/d3.min.js held open by page.route while the Structure lens mounted', '#structure-stage [data-stage-state="loading"]');

  // Transient, not a dead end: once the library lands the graph draws and the counts appear.
  await expect(page.locator('#structure-stage svg .strnode').first()).toBeVisible({ timeout: 20_000 });
  await expect(caption).toContainText('46 entities');
  expect(await page.locator('#structure-stage [data-stage-state="loading"]').count()).toBe(0);
  expectClean(problems);
});

test('structure lens · EMPTY when the look-through file lists no entities', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/lookthrough.json', (body) => {
    Object.assign(body, { nodes: [] });
  });
  await page.goto('/#/diagnose/structure', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#structure-empty .state-empty');
  await expect(state).toBeVisible();
  await expect(state).toContainText('lists no entities');
  await expect(state).toContainText('Nothing has failed');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  // The question survives every state (R1), and no error is claimed where nothing failed.
  await expect(page.locator('#structure-question')).toContainText('How is this product wired');
  expect(await page.locator('#screen .state-error').count(), 'empty is not an error').toBe(0);
  await statesShot(page, 'structure-lens-empty', 'lookthrough.json served with nodes: []', '#structure-empty .state-empty');
  // An empty tree used to reach d3.stratify and throw "no root". Nothing may be thrown here.
  expectClean(problems);
});

/* ------------------------------------------------------------------ Simulator */

test('simulator lens · LOADING while the graph library is still arriving', async ({ page }) => {
  const { problems } = recordProblems(page);
  await lensesHoldGraphLibrary(page);
  await page.goto('/#/diagnose/simulator', { waitUntil: 'load' });

  const state = page.locator('#simulator-stage [data-stage-state="loading"] .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the ownership graph this lens shocks');
  await statesShot(page, 'simulator-lens-loading', 'vendor/d3.min.js held open by page.route while the Simulator lens mounted', '#simulator-stage [data-stage-state="loading"]');

  await expect(page.locator('#simulator-stage svg rect.body').first()).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('#simulator-stage [data-stage-state="loading"]').count()).toBe(0);
  expectClean(problems);
});

test('simulator lens · EMPTY when the simulator file lists no funds', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/simulator.json', (body) => {
    Object.assign(body, { funds: {} });
  });
  await page.goto('/#/diagnose/simulator', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#simulator-empty .state-empty');
  await expect(state).toBeVisible();
  await expect(state).toContainText('no funds to shock');
  await expect(state).toContainText('Nothing has failed');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  await expect(page.locator('#simulator-question')).toContainText('what happens to product NAV');
  expect(await page.locator('#screen .state-error').count(), 'empty is not an error').toBe(0);
  await statesShot(page, 'simulator-lens-empty', 'simulator.json served with funds: {}', '#simulator-empty .state-empty');
  expectClean(problems);
});

test('simulator lens · ERROR when the simulator file is malformed, announced and re-thrown', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(String(error)));

  // `apex` removed: the lens used to run `fixture.apex.reduce(...)` during mount and throw
  // `TypeError: e.apex.reduce is not a function`, rendering nothing at all.
  await statesPatchFixture(page, '**/simulator.json', (body) => {
    delete (body as unknown as Record<string, unknown>).apex;
  });
  await page.goto('/#/diagnose/simulator', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#simulator-error .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('shock simulator could not be built');
  await expect(state).toContainText('no top-level feeders');
  await expect(state).toContainText('other three lenses read different files and are unaffected');
  await expect(state.locator('button')).toHaveText('Reload this product’s data');
  expect(await state.getAttribute('role'), 'a screen reader must be told').toBe('alert');
  // The operator gets a sentence, not a TypeError, and not a blank panel.
  const rendered = await page.locator('#lens-body').innerText();
  expect(rendered.length, 'the lens must not render blank').toBeGreaterThan(80);
  expect(rendered).not.toContain('TypeError');
  await statesShot(page, 'simulator-lens-error', 'simulator.json served with its apex list deleted', '#simulator-error .state-error');

  // Surfaced AND recorded AND re-thrown, so R14's console listener still sees a real failure.
  const recorded = await page.evaluate(
    () => (globalThis as { __simulatorFailures?: string[] }).__simulatorFailures ?? []
  );
  expect(recorded.length, 'the failure must be recorded on the page').toBeGreaterThan(0);
  await expect
    .poll(() => failures.length, { message: 'the caught fault must reach the console listener' })
    .toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ R14: the caught graph error */

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
