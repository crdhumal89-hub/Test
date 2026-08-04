/**
 * Rubric R4 for the lazily fetched universe fixture, the two lenses that read it, and the combobox
 * result lists that search it.
 *
 * `universe.json` is 472 KiB — 77% of the payload — and is fetched on first use, which makes it the
 * one panel-feeding resource in this app that a controller can genuinely be left waiting on. Its
 * three states are driven here at the source: the fetch held open (loading), re-served with its
 * entity and issue lists emptied (empty), and aborted outright (error, then recovered — the retry
 * used to be a dead button, because the loader cached the rejected promise and handed the same
 * rejection back for the rest of the session).
 *
 * The combobox result list is the third panel here because it is the panel that lies most quietly:
 * the Diagnose entity search is a list over this product's own funds AND the firm-wide universe, so
 * while the universe is missing it can only offer the smaller set, and saying nothing about that is
 * how "no such fund" gets reported for a fund the firm holds elsewhere.
 */
import { test, expect } from '@playwright/test';
import { recordProblems, settled, expectClean } from './helpers.js';
import {
  statesExpectClean,
  statesFailFixture,
  statesHoldUniverse,
  statesPatchFixture,
  statesShot,
} from './states-helpers.js';

/* ------------------------------------------------------------------ the universe fixture */

test('universe fixture · LOADING while the 472 KiB fetch is outstanding', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesHoldUniverse(page);
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });

  const state = page.locator('#screen .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the firm-wide ownership universe');
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-fetching')),
    'the fetch must really be outstanding'
  ).toBe(true);
  await statesShot(page, 'universe-loading', 'universe.json held open by page.route on first use', '#screen .state-loading');

  await expect(page.locator('#ownership-search')).toBeVisible({ timeout: 20_000 });
  expectClean(problems);
});

test('universe fixture · ERROR when the fetch fails, and the retry actually recovers', async ({ page }) => {
  const { problems } = recordProblems(page);
  // Fail once, then let it through: a recovery action that cannot recover is a dead end (R18).
  await statesFailFixture(page, '**/universe.json', 1);
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#screen .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('firm-wide ownership universe could not be loaded');
  await expect(state).toContainText('No ownership figure can be derived without it');
  expect(await state.getAttribute('role')).toBe('alert');
  const retry = state.locator('button', { hasText: 'Try again' });
  await expect(retry).toBeVisible();
  await statesShot(page, 'universe-error', 'universe.json aborted by page.route on the first attempt', '#screen .state-error');

  await retry.click();
  await expect(page.locator('#ownership-search')).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('#screen .state-error').count(), 'the retry must clear the error').toBe(0);
  statesExpectClean(problems);
});

/* ------------------------------------------------------------------ the Ownership lens */

test('ownership lens · EMPTY when the universe knows nothing about the selected position', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/universe.json', (body) => {
    Object.assign(body, { edges: [], entities: [], search: [] });
  });
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#screen .state-empty').first();
  await expect(state).toBeVisible();
  await expect(state).toContainText('Nothing in the firm-wide universe holds');
  await expect(state.locator('button').first()).toBeVisible();
  await expect(page.locator('#ownership-question')).toContainText('Who ultimately owns this position');
  await statesShot(page, 'ownership-lens-empty', 'universe.json served with its edges, entities and search index emptied', '#screen .state-empty');
  expectClean(problems);
});

test('ownership lens · ERROR when the universe it depends on cannot be fetched', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesFailFixture(page, '**/universe.json');
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#screen .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('firm-wide ownership universe could not be loaded');
  await expect(state).toContainText('none are shown rather than partial ones');
  expect(await state.getAttribute('role')).toBe('alert');
  // No half-built ownership figure is left on screen next to the failure.
  expect(await page.locator('#ownership-ribbon').count()).toBe(0);
  await statesShot(page, 'ownership-lens-error', 'every universe.json request aborted by page.route', '#screen .state-error');
  statesExpectClean(problems);
});

test('ownership lens · LOADING states the file it is waiting for, not a bare spinner', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesHoldUniverse(page);
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });

  const state = page.locator('#screen .state-loading');
  await expect(state).toBeVisible();
  await expect(page.locator('#ownership-question')).toContainText('Who ultimately owns this position');
  await statesShot(page, 'ownership-lens-loading', 'universe.json held open by page.route', '#screen .state-loading');
  expectClean(problems);
});

/* ------------------------------------------------------------------ the Data quality lens */

test('data quality lens · LOADING while the universe it scans is in flight', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesHoldUniverse(page);
  await page.goto('/#/diagnose/data-quality', { waitUntil: 'load' });

  const state = page.locator('#screen .state-loading');
  await expect(state).toBeVisible();
  await expect(state).toContainText('Loading the firm-wide ownership universe');
  await expect(page.locator('#data-quality-question')).toContainText('What is wrong with the source data');
  await statesShot(page, 'data-quality-loading', 'universe.json held open by page.route', '#screen .state-loading');
  expectClean(problems);
});

test('data quality lens · EMPTY when the scanned universe reports no issues', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesPatchFixture(page, '**/universe.json', (body) => {
    Object.assign(body, { issues: [] });
  });
  await page.goto('/#/diagnose/data-quality', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#screen .state-empty').first();
  await expect(state).toBeVisible();
  await expect(state).toContainText('No data-quality issue');
  await expect(state.locator('button').first()).toBeVisible();
  await statesShot(page, 'data-quality-empty', 'universe.json served with issues: []', '#screen .state-empty');
  expectClean(problems);
});

test('data quality lens · ERROR when the universe it scans cannot be fetched', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesFailFixture(page, '**/universe.json');
  await page.goto('/#/diagnose/data-quality', { waitUntil: 'load' });
  await settled(page);

  const state = page.locator('#screen .state-error');
  await expect(state).toBeVisible();
  await expect(state).toContainText('firm-wide ownership universe could not be loaded');
  await expect(state).toContainText('an empty list here would be a lie');
  expect(await state.getAttribute('role')).toBe('alert');
  expect(await page.locator('#data-quality-buckets').count(), 'no empty bucket list beside the error').toBe(0);
  await statesShot(page, 'data-quality-error', 'every universe.json request aborted by page.route', '#screen .state-error');
  statesExpectClean(problems);
});

/* ------------------------------------------------------------------ combobox result lists */

test('combobox list · LOADING says which of its two sources has not arrived', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesHoldUniverse(page);
  // The Ownership lens starts the shared fetch; the entity search at the top of the screen is a list
  // over the same universe plus this product's own funds, and stays usable while it waits.
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await expect(page.locator('#screen .state-loading')).toBeVisible();
  // Cleared, so the list is the whole set rather than a filter on the pre-selected entity's label.
  await page.locator('#diagnose-entity').fill('');

  const notice = page.locator('#diagnose-entity-list .combo-notice-loading');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Still loading the firm-wide list');
  await expect(notice).toContainText('26 funds and SPVs in this product');
  // Usable, not blocked: the product's own funds are already in the list under the notice.
  await expect(page.locator('#diagnose-entity-list .combo-option')).not.toHaveCount(0);
  await statesShot(page, 'combobox-loading', 'universe.json held open, then the Diagnose entity list opened', '#diagnose-entity-list .combo-notice-loading');
  expectClean(problems);
});

test('combobox list · EMPTY names the recovery, and the recovery works', async ({ page }) => {
  const { problems } = recordProblems(page);
  await page.goto('/#/diagnose/structure', { waitUntil: 'load' });
  await settled(page);
  await page.locator('#diagnose-entity').fill('zzzznothing');
  await settled(page);

  const empty = page.locator('#diagnose-entity-list .combo-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('No entity matches that');
  await expect(empty).toContainText('Clear the box');
  await statesShot(page, 'combobox-empty', 'the Diagnose entity search typed as zzzznothing', '#diagnose-entity-list .combo-empty');

  await page.locator('#diagnose-entity').fill('');
  await settled(page);
  await expect(page.locator('#diagnose-entity-list .combo-option')).not.toHaveCount(0);
  expectClean(problems);
});

test('combobox list · ERROR is announced in the list and recovers from beside it', async ({ page }) => {
  const { problems } = recordProblems(page);
  await statesFailFixture(page, '**/universe.json', 1);
  await page.goto('/#/diagnose/ownership', { waitUntil: 'load' });
  await settled(page);
  await page.locator('#diagnose-entity').fill('');

  const notice = page.locator('#diagnose-entity-list .combo-notice-error');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('firm-wide list of positions could not be loaded');
  await expect(notice).toContainText('Anything held elsewhere in the firm is missing');
  expect(await notice.locator('[role="alert"]').count(), 'a failure must be announced').toBe(1);
  const recover = page.locator('#diagnose-entity-retry');
  await expect(recover).toBeVisible();
  await statesShot(page, 'combobox-error', 'universe.json aborted once, then the Diagnose entity list opened', '#diagnose-entity-list .combo-notice-error');

  await recover.click();
  await expect(page.locator('#diagnose-entity-retry')).toHaveCount(0, { timeout: 20_000 });
  // Wait for the second attempt to land rather than for a redraw: the list is rebuilt from the
  // universe the moment it arrives, and re-opening it before then would prove nothing.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-fetching')), {
      timeout: 20_000,
    })
    .toBe(false);
  // APPOURI is in the firm-wide universe and NOT among this product's own funds, so finding it is
  // proof that the recovery really restored the source the notice said was missing.
  await page.locator('#diagnose-entity').fill('APPOUR');
  await expect(page.locator('#diagnose-entity-list .combo-option[data-key="APPOURI"]')).toHaveCount(1);
  expect(await page.locator('#diagnose-entity-list .combo-notice').count(), 'no notice once it is here').toBe(0);
  statesExpectClean(problems);
});
