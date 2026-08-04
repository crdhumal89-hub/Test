/**
 * The machinery the R4 state suites share: how a state is REACHED, and how it is recorded.
 *
 * Every state in those suites is driven in the browser rather than asserted about source code — a
 * fixture fetch held open for loading, a fixture re-served with a field emptied for empty, a fixture
 * re-served malformed for error — so the helpers here are all about intercepting the real network and
 * writing down what the browser actually drew.
 */
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE } from './helpers.js';

export const STATES_DIR = path.join(EVIDENCE, 'states');

/** How long a held fixture fetch stays outstanding. Long enough to read the loading state. */
export const STATES_HOLD_MS = 8000;

/**
 * Screenshot the state and record the sentence it actually rendered, so the evidence is the state as
 * the browser drew it rather than a claim about the code. Merged into one file; the suite runs with a
 * single worker, so read-modify-write is safe.
 */
export async function statesShot(
  page: Page,
  name: string,
  reached: string,
  selector?: string
): Promise<void> {
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
      ? (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim()
      : null,
    screenshot: `docs/evidence/states/${name}.png`,
  };
  fs.writeFileSync(log, JSON.stringify(seen, null, 1) + '\n');
}

/**
 * Serve a real fixture with one field rewritten, so the panel under test gets malformed data while
 * every other panel on the screen keeps working. This is what proves the state is panel-scoped.
 */
export async function statesPatchFixture(
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
export async function statesHoldUniverse(page: Page, ms = STATES_HOLD_MS): Promise<void> {
  await page.route('**/universe.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

/** Fail the fetch of one fixture outright, which is the error state's cause, not a symptom of it. */
export async function statesFailFixture(page: Page, glob: string, times = Number.MAX_SAFE_INTEGER): Promise<void> {
  let failures = 0;
  await page.route(glob, async (route) => {
    if (failures >= times) {
      await route.continue();
      return;
    }
    failures += 1;
    await route.abort('failed');
  });
}

/**
 * Reach a panel's loading state: open the Ownership lens, which fetches the 472 KiB universe, wait
 * until that fetch is genuinely outstanding, then mount the screen under test while it is in flight.
 */
export async function statesMountWhileFetching(page: Page, hash: string): Promise<void> {
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
