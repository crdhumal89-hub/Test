/**
 * Critic-3: pin down the 12 bare `DC` occurrences the shipped R2 crawl never reaches, and check
 * whether they are rendered text, attributes, or both.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { vocabCrawl } from '../../../tests/e2e/vocabulary-crawler.js';

const OUT = path.resolve(import.meta.dirname, '..');
const BOUND = /(?<![A-Za-z0-9])DC(?![A-Za-z0-9])/;

test('DC on the reconciliation tree, collapsed vs expanded', async ({ page }) => {
  const out: Record<string, unknown> = {};
  await page.goto('/#/reconciliation', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await page.waitForTimeout(600);

  const collapsed = await vocabCrawl(page, []);
  out.collapsedRows = await page.locator('#tree tbody tr').count();
  out.collapsedDC = collapsed.filter((o) => BOUND.test(o.text)).map((o) => ({ text: o.text.slice(0, 90), attr: o.attribute, where: o.where, linked: o.linked }));

  await page.locator('#expand-all').click();
  await page.waitForTimeout(800);
  const expanded = await vocabCrawl(page, []);
  out.expandedRows = await page.locator('#tree tbody tr').count();
  out.expandedDC = expanded.filter((o) => BOUND.test(o.text)).map((o) => ({ text: o.text.slice(0, 90), attr: o.attribute, where: o.where, linked: o.linked }));
  out.vocabularyStrip = await page.locator('#reconciliation-vocabulary').innerText();
  await page.screenshot({ path: path.join(OUT, 'critic3-r2-dc-expanded.png') });
  fs.writeFileSync(path.join(OUT, 'critic3-r2-dc.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
});
