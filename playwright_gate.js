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
// These are transcribed from the Definition of Done, one assertion per page
// condition it states. The DOM contract they imply is deliberate: the page must
// expose the audit trail as queryable attributes rather than as prose, because a
// gate that reads prose cannot tell a real as-of date from the word "as-of".
//
//   [data-testid="strategy-section"]  one per strategy screened, always rendered
//     [data-strategy-name]            non-empty strategy name
//     [data-testid="shortlist-row"]   one per shortlisted company (may be zero)
//       [data-criterion]              one per criterion, with data-pass="true|false"
//         [data-figure]               the figure that satisfied or failed it
//         [data-figure-as-of]         that figure's as-of date, ISO yyyy-mm-dd
//         [data-figure-source]        non-empty provenance string
//       [data-proxy="true"]           set only on spec-authorised fallback proxies,
//                                     which must show the [E] tag and a component count
//     [data-testid="empty-result"]    rendered when a strategy shortlists nobody
//       [data-empty-reason]           non-empty reason
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ASSERTIONS = [
  {
    name: 'screen page returns HTTP 200',
    check: async (page) => page.evaluate(
      () => fetch(location.href, { method: 'GET' }).then((r) => r.status === 200)
    ),
  },
  {
    name: 'page renders a heading',
    check: async (page) => (await page.locator('h1').count()) > 0,
  },
  {
    name: 'all five in-scope strategies are rendered',
    check: async (page) => {
      const names = await page.locator('[data-strategy-name]').evaluateAll(
        (nodes) => nodes.map((n) => n.getAttribute('data-strategy-name'))
      );
      return [
        'Deep Value (Graham Net-Net)',
        'Piotroski-Enhanced Value',
        'Magic Formula',
        'Quality Compounders',
        'Coffee Can',
      ].every((expected) => names.includes(expected));
    },
  },
  {
    name: 'every strategy section names the strategy it screened',
    check: async (page) => page.evaluate(() => {
      const sections = [...document.querySelectorAll('[data-testid="strategy-section"]')];
      return sections.length > 0 && sections.every((s) => {
        const named = s.querySelector('[data-strategy-name]');
        return named && named.getAttribute('data-strategy-name').trim().length > 0;
      });
    }),
  },
  {
    name: 'every shortlisted row carries at least one pass/fail criterion',
    check: async (page) => page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="shortlist-row"]')];
      return rows.every((row) => {
        const criteria = [...row.querySelectorAll('[data-criterion]')];
        return criteria.length > 0
          && criteria.every((c) => ['true', 'false'].includes(c.getAttribute('data-pass')));
      });
    }),
  },
  {
    name: 'every criterion shows the figure used, its as-of date, and its source',
    check: async (page) => page.evaluate((isoSource) => {
      const iso = new RegExp(isoSource);
      const criteria = [...document.querySelectorAll('[data-criterion]')];
      return criteria.every((c) => {
        const figure = c.querySelector('[data-figure]');
        const asOf = c.querySelector('[data-figure-as-of]');
        const source = c.querySelector('[data-figure-source]');
        return figure && asOf && source
          && figure.getAttribute('data-figure').trim().length > 0
          && iso.test(asOf.getAttribute('data-figure-as-of').trim())
          && source.getAttribute('data-figure-source').trim().length > 0;
      });
    }, ISO_DATE.source),
  },
  {
    name: 'no figure post-dates the as-of date the screen was run for',
    check: async (page) => page.evaluate(() => {
      const asOfNode = document.querySelector('[data-screen-as-of]');
      if (!asOfNode) return false;
      const screenAsOf = asOfNode.getAttribute('data-screen-as-of').trim();
      return [...document.querySelectorAll('[data-figure-as-of]')]
        .every((n) => n.getAttribute('data-figure-as-of').trim() <= screenAsOf);
    }),
  },
  {
    name: 'every fallback proxy carries the [E] tag and a component count',
    check: async (page) => page.evaluate(() => {
      const proxies = [...document.querySelectorAll('[data-proxy="true"]')];
      return proxies.every((p) => {
        const count = p.getAttribute('data-component-count');
        return p.textContent.includes('[E]')
          && count !== null
          && /^\d+$/.test(count.trim());
      });
    }),
  },
  {
    name: 'no untagged proxy, imputed, or estimated value appears',
    check: async (page) => page.evaluate(() => {
      const suspect = /\b(imputed|estimated|sector average|placeholder|n\/a fallback)\b/i;
      return [...document.querySelectorAll('[data-figure]')].every((n) => {
        const untagged = !n.closest('[data-proxy="true"]');
        return !(untagged && suspect.test(n.textContent));
      });
    }),
  },
  {
    name: 'a strategy with no candidates renders an explicit reason',
    check: async (page) => page.evaluate(() => {
      const sections = [...document.querySelectorAll('[data-testid="strategy-section"]')];
      return sections.every((s) => {
        if (s.querySelector('[data-testid="shortlist-row"]')) return true;
        const empty = s.querySelector('[data-testid="empty-result"]');
        return Boolean(empty)
          && (empty.getAttribute('data-empty-reason') || '').trim().length > 0;
      });
    }),
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
