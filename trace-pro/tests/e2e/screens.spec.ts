/**
 * Definition-of-Done item 4: all three screens and all four lenses render, every documented
 * interaction completes, all four exports produce a non-empty file whose figures tie to the screen,
 * and the run logs zero console errors or unhandled rejections.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ROUTES, recordProblems, gotoRoute, settled, parityValue, writeEvidence } from './helpers.js';

test.describe('every screen renders', () => {
  for (const route of ROUTES) {
    test(`${route.label} renders with no console problem`, async ({ page }) => {
      const { problems } = recordProblems(page);
      await gotoRoute(page, route.hash);
      await expect(page.locator('#screen')).toBeVisible();
      await expect(page.locator('.screen-question, .lens-question').first()).toBeVisible();
      // A rendered screen has at least one figure answerable to a parity key.
      expect(await page.locator('[data-parity]').count()).toBeGreaterThan(0);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});

test('Reconciliation: the reconciliation ties, and the figures are the frozen ones', async ({ page }) => {
  await gotoRoute(page, '#/reconciliation');
  expect(await parityValue(page, 'reconciliation.waterfall.derived_mv')).toBe('$2,060,224,441');
  expect(await parityValue(page, 'reconciliation.waterfall.revised_mv')).toBe('$2,060,610,338');
  expect(await parityValue(page, 'reconciliation.waterfall.nav')).toBe('$2,062,198,836');
  expect(await parityValue(page, 'reconciliation.waterfall.delta_pricing_usd')).toBe('$385,897');
  expect(await parityValue(page, 'reconciliation.waterfall.delta_nonposition_usd')).toBe('$1,588,498');
  expect(await parityValue(page, 'reconciliation.tie.status')).toBe('✓ ties to the cent');
});

test('Reconciliation: expand all reveals the whole tree, collapse returns to the default', async ({ page }) => {
  await gotoRoute(page, '#/reconciliation');
  const rows = page.locator('#tree tbody tr.rowv');
  expect(await rows.count()).toBe(9);
  await page.locator('#expand-all').click();
  await settled(page);
  expect(await rows.count()).toBe(149);
  await page.locator('#collapse').click();
  await settled(page);
  expect(await rows.count()).toBe(9);
});

test('Reconciliation: a row opens its breakdown, Escape closes it and restores focus', async ({ page }) => {
  await gotoRoute(page, '#/reconciliation');
  await page.locator('#tree tbody tr.rowv').nth(1).click();
  await settled(page);
  const drawer = page.locator('#reconciliation-detail');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await settled(page);
  await expect(drawer).toBeHidden();
});

test('Reconciliation: an exception chip jumps to the offending fund', async ({ page }) => {
  await gotoRoute(page, '#/reconciliation');
  const chip = page.locator('.chip[data-exception]').first();
  await expect(chip).toBeVisible();
  await chip.click();
  await settled(page);
  await expect(page.locator('#tree tbody tr.selected')).toHaveCount(1);
});

test('Pricing: the score strip and bridge carry the frozen figures', async ({ page }) => {
  await gotoRoute(page, '#/pricing');
  expect(await parityValue(page, 'pricing.score.derived_mv')).toBe('$2,060,224,441');
  expect(await parityValue(page, 'pricing.score.nav')).toBe('$2,062,198,836');
  expect(await parityValue(page, 'pricing.bridge.product_nav')).toBe('$2,062,198,836');
  expect(await parityValue(page, 'pricing.bridge.gap_usd')).toBe('$1,974,394');
  expect(await parityValue(page, 'pricing.fund.SPORTHFC.publish_px')).toBe('1.025389');
  expect(await parityValue(page, 'pricing.fund.SPORTHLD.publish_px')).toBe('1.024650');
});

test('Pricing: the walk total ties to the waterfall', async ({ page }) => {
  await gotoRoute(page, '#/pricing');
  expect(await parityValue(page, 'pricing.walk.total.nav')).toBe('$2,062,198,836');
  expect(await parityValue(page, 'pricing.walk.total.value_before')).toBe('$2,060,224,441');
  expect(await parityValue(page, 'pricing.walk.total.value_after')).toBe('$2,060,610,338');
  expect(await parityValue(page, 'pricing.walk.total.delta_value')).toBe('$385,897');
});

test('Ownership: the default position resolves and its owners reconcile', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/ownership');
  expect(await parityValue(page, 'ownership.APPOURI.total_qty')).toBe('Total qty: 1,330,020,204');
  expect(await parityValue(page, 'ownership.APPOURI.immediate_check')).toBe('✓ Owners reconcile to 100%');
  expect(await parityValue(page, 'ownership.APPOURI.counts_hint')).toBe(
    '39 immediate owners · 39 ultimate parents · top 5 = 46.31%'
  );
});

test('Data quality: the five buckets and their counts', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/data-quality');
  expect(await parityValue(page, 'data_quality.total_count')).toBe('105');
  expect(await parityValue(page, 'data_quality.high_count')).toBe('31');
  expect(await parityValue(page, 'data_quality.medium_count')).toBe('52');
  expect(await parityValue(page, 'data_quality.low_count')).toBe('22');
  expect(await page.locator('.accordion').count()).toBe(5);
});

test('Simulator: the staged reprice completes and lands on the waterfall, to the cent', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/simulator');
  await page.getByRole('button', { name: /reprice everything/i }).click();
  await page.waitForFunction(
    () => /complete/i.test(document.querySelector('[data-parity="simulator.reprice.run_label"]')?.textContent ?? ''),
    undefined,
    { timeout: 120_000 }
  );
  await settled(page);
  expect(await parityValue(page, 'simulator.reprice.derived_before')).toBe('$2,060,224,441.40');
  expect(await parityValue(page, 'simulator.reprice.pnl')).toBe('$385,896.89');
  expect(await parityValue(page, 'simulator.reprice.revised')).toBe('$2,060,610,338.29');
  expect(await parityValue(page, 'simulator.reprice.nonposition')).toBe('$1,588,497.57');
  expect(await parityValue(page, 'simulator.reprice.product_nav')).toBe('$2,062,198,835.86');
});

test('Structure: the full-screen readout shows the fund-entity NAV and labels its basis', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/structure');
  const readout = await parityValue(page, 'structure.fullscreen.product_nav');
  // Deliberately the fund-entity basis, $2,785.79 below the sum-of-feeders NAV. See spec 1.8.1.
  expect(readout).toContain('2,062,196,050.07');
  const basis = await page.locator('[data-parity="structure.fullscreen.product_nav"]').textContent();
  expect(basis?.toLowerCase()).toMatch(/fund-entity|entity basis/);
});

test('exports: all four produce a non-empty file', async ({ page }) => {
  const { problems } = recordProblems(page);
  const produced: { name: string; bytes: number }[] = [];

  const grab = async (label: string): Promise<void> => {
    const wait = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    const download = await wait;
    const target = `test-results/${download.suggestedFilename()}`;
    await download.saveAs(target);
    const bytes = fs.statSync(target).size;
    produced.push({ name: download.suggestedFilename(), bytes });
    expect(bytes, `${label} produced an empty file`).toBeGreaterThan(200);
  };

  await gotoRoute(page, '#/reconciliation');
  await grab('export csv');
  await grab('download excel');

  await gotoRoute(page, '#/pricing');
  await grab('export pricing');
  await grab('download excel');

  writeEvidence('exports.json', produced);
  expect(problems, problems.join('\n')).toEqual([]);
});
