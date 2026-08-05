/**
 * playwright_gate.js - a headless verification gate for rendered output.
 *
 * Why this ships as an asset: a model cannot see its own render, so Style B loops
 * need eyes. Without a bundled gate, every run writes this file from scratch and
 * each version traps a slightly different set of failures. This one is stable, so
 * the only thing a compile has to supply is the ASSERTIONS array.
 *
 * Install:  npm i -D playwright && npx playwright install chromium
 * Run:      node playwright_gate.js [url-or-file-path]
 * Exit:     0 when every assertion passes and no console error fired, 1 otherwise.
 *
 * Wire the loop prompt to the exit code, never to a description of the output.
 */

const { chromium } = require('playwright');
const path = require('path');

const TARGET = process.argv[2] || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// FILL THIS IN. Each assertion gets a name (so failures are readable in the loop's
// ledger) and a check that returns true, false, or a promise of either.
// Assert on measurable properties. "Looks good" is not a check; "the total row is
// visible and reads 1,240" is.
// ---------------------------------------------------------------------------
const ASSERTIONS = [
  {
    name: 'page renders a heading',
    check: async (page) => (await page.locator('h1').count()) > 0,
  },
  {
    name: 'primary table has at least one data row',
    check: async (page) => (await page.locator('table tbody tr').count()) > 0,
  },
  {
    name: 'no element overflows the viewport horizontally',
    check: async (page) => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
  },
];

// A page can look correct and still be broken underneath, so any console error or
// page exception fails the gate on its own.
const FAIL_ON_CONSOLE_ERROR = true;

async function main() {
  // This container ships Chromium at a fixed path; pointing at it directly avoids
  // a browser download and keeps the gate runnable offline.
  const browser = await chromium.launch({
    executablePath: process.env.GATE_CHROMIUM
      || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const url = /^https?:|^file:/.test(TARGET)
    ? TARGET
    : 'file://' + path.resolve(TARGET);

  const results = [];
  let loadFailure = null;

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (error) {
    loadFailure = error.message;
  }

  if (!loadFailure) {
    for (const assertion of ASSERTIONS) {
      try {
        const passed = await assertion.check(page);
        results.push({ name: assertion.name, passed: Boolean(passed) });
      } catch (error) {
        results.push({ name: assertion.name, passed: false, error: error.message });
      }
    }
  }

  await browser.close();

  console.log(`GATE TARGET: ${url}\n`);
  if (loadFailure) {
    console.log(`[FAIL] page did not load: ${loadFailure}`);
  }
  for (const result of results) {
    const tag = result.passed ? '[PASS]' : '[FAIL]';
    console.log(`${tag} ${result.name}${result.error ? ` (${result.error})` : ''}`);
  }
  if (consoleErrors.length) {
    console.log(`\n[CONSOLE] ${consoleErrors.length} error(s):`);
    consoleErrors.forEach((text) => console.log(`  ${text}`));
  }

  const assertionsFailed = results.filter((result) => !result.passed).length;
  const blocked = Boolean(loadFailure)
    || assertionsFailed > 0
    || (FAIL_ON_CONSOLE_ERROR && consoleErrors.length > 0);

  console.log(
    `\n${blocked ? 'BLOCKED' : 'PASS'}: ${results.length - assertionsFailed}/${results.length} `
    + `assertions passed, ${consoleErrors.length} console error(s)`
  );
  process.exit(blocked ? 1 : 0);
}

// An unrunnable gate is a failure, never a pass. Exiting nonzero here is what keeps
// a broken harness from reading as a green run.
main().catch((error) => {
  console.error(`gate could not run: ${error.message}`);
  process.exit(1);
});
