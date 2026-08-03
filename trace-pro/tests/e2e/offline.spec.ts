/**
 * Rubric R15 / Definition-of-Done item 9: the app works with the network disabled.
 *
 * Every request that is not to our own origin is aborted and recorded. xlsx 0.18.5 and d3 7.8.5 are
 * served from vendor/, and the 614 KiB of fixtures from data/, so a correct build attempts nothing
 * off-origin at all.
 */
import { test, expect } from '@playwright/test';
import { ROUTES, recordProblems, gotoRoute, settled, writeEvidence } from './helpers.js';

test('the whole app runs with every off-origin request blocked', async ({ page, baseURL }) => {
  const blocked: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const own =
      url.startsWith(baseURL ?? 'http://127.0.0.1:4178') ||
      url.startsWith('data:') ||
      url.startsWith('blob:');
    if (own) return route.continue();
    blocked.push(url);
    return route.abort();
  });

  const { problems } = recordProblems(page);
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    await expect(page.locator('.screen-question, .lens-question').first()).toBeVisible();
    await page.locator('#open-glossary').click();
    await settled(page);
    await page.keyboard.press('Escape');
    await settled(page);
  }

  writeEvidence('offline.json', { blockedRequests: blocked, consoleProblems: problems });
  expect(blocked, `the app attempted off-origin requests:\n${blocked.join('\n')}`).toEqual([]);
  expect(problems, `console problems offline:\n${problems.join('\n')}`).toEqual([]);
});
