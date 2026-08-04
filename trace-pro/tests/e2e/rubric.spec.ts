/**
 * Machine-checked rubric criteria. This spec exists to GENERATE the evidence an independent critic
 * cites in docs/ux-scorecard.md — it does not grade anything itself, and passing it is necessary
 * but not sufficient for the UX gate.
 *
 * Criteria checked here: R1 (screen states its question), R2 (no bare abbreviations), R3 (unit and
 * as-of on every figure), R5 (primary answer above the fold), R7 (glossary one action away),
 * R12 (pricing basis never ambiguous), R14 (nothing fails silently), R16 (selection survives
 * navigation), R18 (empty states offer a recovery). R6 is measured in rubric-focus.spec.ts.
 */
import { test, expect } from '@playwright/test';
import {
  ROUTES,
  recordProblems,
  settled,
  gotoRoute,
  writeEvidence,
  expectClean,
} from './helpers.js';

/**
 * Tokens that must never appear as bare, unexplained user-visible text outside the glossary.
 *
 * The criterion is about an abbreviation presented AS A LABEL — a tab called `own`, a column headed
 * `gq`. It is not about the English word "own" inside "the product's own NAV". So a short code is
 * flagged only when it is the ENTIRE text of an element; whole-word matching is not enough, because
 * `own`, `lt` and `sim` are or resemble ordinary words and a crawler that cries wolf on English
 * prose is worse than no crawler at all.
 *
 * Multi-word labels are matched as substrings, because those are never anything but labels.
 */
const CODE_TOKENS = ['lt', 'rfx', 'gls', 'iss', 'str', 'sim', 'own', 'gq', 'ltv', 'dcN', 'mv100', 'nonav'];
const PHRASE_TOKENS = [
  'in tol', 'scen a', 'scen b', 'Derived MV', 'Revised MV', 'Publish px', 'Current px',
  'Revised px', 'Applied px', 'Δ Pricing', 'Δ Non-position', 'Repricing P&L', 'Immediate %',
  'Applied %',
];
const ABBREVIATION_DENYLIST = [...CODE_TOKENS, ...PHRASE_TOKENS];

test.describe('R1 — every screen states the question it answers', () => {
  for (const route of ROUTES) {
    test(`${route.label} opens with one question`, async ({ page }) => {
      const { problems } = recordProblems(page);
      await gotoRoute(page, route.hash);
      const question = page.locator('.screen-question, .lens-question').first();
      await expect(question).toBeVisible();
      const text = ((await question.textContent()) ?? '').trim();
      expect(text.length, 'question must not be empty').toBeGreaterThan(10);
      expect(text.length, 'question must be one line, not a paragraph').toBeLessThanOrEqual(140);
      expect(text, 'must be phrased as a question').toMatch(/\?$/);
      expect(text.toLowerCase(), 'must not merely restate the screen title').not.toBe(
        route.label.toLowerCase()
      );
      expectClean(problems);
    });
  }
});

test('R2 — no bare abbreviation survives outside the glossary', async ({ page }) => {
  const findings: { route: string; token: string; context: string }[] = [];
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const visible = await page.evaluate(() => {
      const main = document.getElementById('screen');
      const chrome = document.getElementById('masthead');
      const parts: string[] = [];
      for (const host of [chrome, main]) {
        if (!host) continue;
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
          const parent = node.parentElement;
          const inGlossary = !!parent?.closest('.glscard, .glssec, #drawer-host');
          if (text && !inGlossary) parts.push(text);
          node = walker.nextNode();
        }
      }
      return parts;
    });
    for (const token of PHRASE_TOKENS) {
      const hit = visible.find((t) => t.includes(token));
      if (hit) findings.push({ route: route.id, token, context: hit.slice(0, 90) });
    }
    for (const token of CODE_TOKENS) {
      const hit = visible.find((t) => t.toLowerCase() === token.toLowerCase());
      if (hit) findings.push({ route: route.id, token, context: hit.slice(0, 90) });
    }
  }
  writeEvidence('abbreviations.json', { denylist: ABBREVIATION_DENYLIST, findings });
  expect(findings, `bare abbreviations found:\n${JSON.stringify(findings, null, 1)}`).toEqual([]);
});

/**
 * R3's bar is that every panel of figures "resolves to a visible as-of date … on the figure's panel
 * or on a persistent chrome element visible SIMULTANEOUSLY with it". Asserting `#asof` is visible on
 * load is weaker than that by the height of the document: unpinned, scrolling 563px on Pricing left
 * 146 figures on screen with the as-of 541px above the viewport. So this walks each route top to
 * bottom in viewport-sized steps and, at every step where a figure is readable, requires the as-of
 * to be readable at the same moment.
 */
test('R3 — a figure is never readable while its as-of date is not', async ({ page }) => {
  const report: Record<string, unknown>[] = [];
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const steps = await page.evaluate(() =>
      Math.ceil(document.documentElement.scrollHeight / window.innerHeight)
    );
    for (let step = 0; step <= steps; step++) {
      await page.evaluate((n) => window.scrollTo(0, n * window.innerHeight * 0.9), step);
      const seen = await page.evaluate(() => {
        const asof = document.getElementById('asof');
        const box = asof?.getBoundingClientRect();
        const asofVisible = !!box && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight;
        const figures = Array.from(document.querySelectorAll('#screen [data-parity]')).filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
        }).length;
        return {
          scrollY: Math.round(scrollY),
          asofVisible,
          asofText: (asof?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          figures,
          mastheadPosition: getComputedStyle(document.querySelector('.masthead') as Element).position,
        };
      });
      report.push({ route: route.id, ...seen });
      expect(seen.asofText, `${route.id}: the as-of must carry a date`).toMatch(/\d{4}-\d{2}-\d{2}/);
      const where = `${route.id}: ${seen.figures} figures readable at scrollY ${seen.scrollY}, as-of not`;
      if (seen.figures > 0) expect(seen.asofVisible, where).toBe(true);
    }
  }
  // The walk must actually have read figures while scrolled away from the top, or it proves nothing.
  const scrolled = report.filter((r) => (r.scrollY as number) > 200 && (r.figures as number) > 0);
  expect(scrolled.length, 'no route was measured with figures on screen while scrolled').toBeGreaterThan(3);
  writeEvidence('units-and-asof.json', report);
});

/**
 * One row per selector docs/first-run.md names as part of that screen's primary answer, in the same
 * order as the tables in that file. `[label, selector, howManyMustBeAboveTheFold]`.
 * Changing this list means changing the contract document — not the other way round.
 */
const FIRST_RUN: Record<string, [string, string, number?][]> = {
  reconciliation: [
    ['question', '#reconciliation-question'],
    ['tie verdict', '#reconciliation-waterfall .wf-tie-pill'],
    ['all five waterfall steps', '#reconciliation-waterfall .wf-step, #reconciliation-waterfall .wf-op', 5],
    ['NAV', '[data-parity="reconciliation.waterfall.nav"]'],
    ['NAV basis', '#reconciliation-waterfall .wf-basis'],
    ['pricing difference $', '[data-parity="reconciliation.waterfall.delta_pricing_usd"]'],
    ['pricing difference bps', '[data-parity="reconciliation.waterfall.delta_pricing_bps"]'],
    ['non-position difference $', '[data-parity="reconciliation.waterfall.delta_nonposition_usd"]'],
    ['non-position difference bps', '[data-parity="reconciliation.waterfall.delta_nonposition_bps"]'],
    ['exception chips', '#reconciliation-exceptions .chip', 3],
  ],
  pricing: [
    ['question', '#pricing-question'],
    ['repricing P&L', '[data-parity="pricing.score.delta_pricing_usd"]'],
    ['repricing P&L bps', '[data-parity="pricing.score.delta_pricing_detail"]'],
    ['NAV', '[data-parity="pricing.score.nav"]'],
    ['flagged-fund count', '[data-parity="pricing.score.nav_detail"]'],
    ['first five price rows', '#pricing-price-table tbody tr', 5],
    ['first five publish prices', '[data-parity^="pricing.fund."][data-parity$=".publish_px"]', 5],
    ['which basis', '#view-note'],
  ],
  'diagnose-structure': [
    ['question', '#structure-question'],
    ['graph, laid out', '#structure-stage svg'],
    ['concentration in words', '#structure-caption'],
    ['layout and legend controls', '#structure-controls'],
  ],
  'diagnose-ownership': [
    ['what is being decomposed', '#ownership-identity'],
    ['conservation verdict', '#ownership-checks'],
    ['proportional ribbon', '#ownership-ribbon'],
    ['count line', '#ownership-status'],
    ['first five owner rows', '#ownership-tree tbody tr', 5],
  ],
  'diagnose-data-quality': [
    ['question', '#data-quality-question'],
    ['the four counts', '#data-quality-kpi'],
    ['active scope', '#data-quality-scope'],
    ['all five buckets', '#data-quality-buckets'],
  ],
  'diagnose-simulator': [
    ['product NAV unshocked, with its basis', '#simulator-baseline'],
    ["the subject's value and unit price", '#simulator-subject'],
    ['the three shock inputs and Run, no panel to open', '#simulator-shock'],
    ['market value input', '#simulator-shock-mv'],
    ['units input', '#simulator-shock-qty'],
    ['NAV input', '#simulator-shock-nav'],
    ['Run', '#simulator-run'],
    ['the stage', '#simulator-stage'],
  ],
};

/** Shared chrome, required in the viewport on every screen by docs/first-run.md. */
const CHROME_ROWS: [string, string, number?][] = [
  ['masthead', '#masthead'],
  ['active product', '#active-product'],
  ['as-of', '#asof'],
  ['screen nav', '#screen-nav'],
];
/** The Diagnose shell, required on every lens. */
const DIAGNOSE_ROWS: [string, string, number?][] = [
  ['diagnose question', '#diagnose-question'],
  ['entity under examination', '#diagnose-subject'],
  ['entity combobox, already populated', '#diagnose-entity'],
  ['the four lenses', '#lens-tabs [role="tab"]', 4],
];

test('R5 — the primary answer is above the fold on load, with no click', async ({ page }) => {
  const report: Record<string, unknown[]> = {};
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const spec = [
      ...CHROME_ROWS,
      ...(route.id.startsWith('diagnose') ? DIAGNOSE_ROWS : []),
      ...(FIRST_RUN[route.id] ?? []),
    ];
    const rows = await page.evaluate((entries: [string, string, number?][]) =>
      entries.map(([label, selector, want]) => {
        const nodes = Array.from(document.querySelectorAll(selector));
        const need = want ?? 1;
        const boxes = nodes.slice(0, need).map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), h: Math.round(rect.height) };
        });
        return {
          label,
          selector,
          found: nodes.length,
          need,
          boxes,
          aboveFold:
            boxes.length === need &&
            boxes.every((b) => b.top >= 0 && b.bottom <= window.innerHeight && b.h > 0),
        };
      }),
    spec);
    report[route.id] = rows;
    await page.screenshot({ path: `docs/evidence/fold-${route.id}.png` });
    for (const row of rows) {
      const at = `${route.id}: ${row.label} (${row.selector})`;
      expect(row.found, `${at} — only ${row.found} of ${row.need} rendered`).toBeGreaterThanOrEqual(row.need);
      expect(row.aboveFold, `${at} is outside the 1600x1000 viewport on load — ${JSON.stringify(row.boxes)}`).toBe(true);
    }
    // No click, no keypress, and nothing was scrolled to get here.
    expect(await page.evaluate(() => window.scrollY), `${route.id}: read without scrolling`).toBe(0);
  }
  writeEvidence('above-the-fold.json', report);
});


test('R7 — the glossary is one action from every screen, and keeps state', async ({ page }) => {
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    await page.locator('#open-glossary').click();
    await settled(page);
    const drawer = page.locator('#drawer-host .drawer');
    await expect(drawer, `${route.id}: glossary must open in one action`).toBeVisible();
    const terms = await page.locator('.glscard').count();
    expect(terms, 'all 35 terms must be present').toBe(35);
    await page.keyboard.press('Escape');
    await settled(page);
    await expect(drawer).toBeHidden();
    // The screen behind it is untouched.
    await expect(page.locator('.screen-question, .lens-question').first()).toBeVisible();
  }
});

test('R7 — the keyboard route to the glossary works too', async ({ page }) => {
  await gotoRoute(page, ROUTES[0].hash);
  await page.keyboard.press('g');
  await settled(page);
  await expect(page.locator('#drawer-host .drawer')).toBeVisible();
});

/**
 * R12 has two halves and the shipped test asserted neither: the basis must be VISIBLE wherever a
 * figure depends on it, and the control must be ABSENT where nothing does. "Nothing does" is not an
 * opinion — it is measurable, so this flips the basis on every one of the six routes and compares
 * `#screen`'s text before and after. The text must change on exactly the routes where the control is
 * offered, and on no others.
 *
 * The flip happens on Pricing and the route is then entered by hash, without a reload, because the
 * basis is application state rather than part of the URL. `textContent`, not `innerText`: it reads
 * the graph node captions too, which is where the Simulator's basis-sensitivity lives.
 */
test('R12 — the basis is stated where it matters and absent where it does nothing', async ({ page }) => {
  const DEPENDENT = ['reconciliation', 'pricing', 'diagnose-simulator'];
  const setBasis = async (view: 'before' | 'after'): Promise<void> => {
    await page.evaluate(() => (location.hash = '#/pricing'));
    await settled(page);
    await page.locator(`#view-toggle button[data-view="${view}"]`).click();
    await settled(page);
  };
  const textAt = async (hash: string, view: 'before' | 'after'): Promise<string> => {
    await setBasis(view);
    await page.evaluate((h) => (location.hash = h), hash);
    await settled(page);
    return page.evaluate(() => document.getElementById('screen')?.textContent ?? '');
  };

  const report: Record<string, unknown>[] = [];
  await gotoRoute(page, '#/pricing');
  for (const route of ROUTES) {
    const before = await textAt(route.hash, 'before');
    const after = await textAt(route.hash, 'after');
    const state = await page.evaluate(() => {
      const toggle = document.getElementById('view-toggle');
      const note = document.getElementById('view-note');
      const box = (n: Element | null): number => (n ? Math.round(n.getBoundingClientRect().height) : -1);
      return {
        toggleVisible: !!toggle && getComputedStyle(toggle).display !== 'none' && box(toggle) > 0,
        toggleHiddenAttr: !!toggle?.hasAttribute('hidden'),
        noteVisible: !!note && getComputedStyle(note).display !== 'none' && box(note) > 0,
        noteHeight: box(note),
        noteTag: note?.querySelector('.view-tag')?.textContent ?? '',
      };
    });
    const dependent = DEPENDENT.includes(route.id);
    report.push({ route: route.id, dependent, screenChangedByToggle: before !== after, ...state });

    // (a) the control is offered exactly where a figure moves with it.
    expect(state.toggleVisible, `${route.id}: basis control visible must equal basis-dependent`).toBe(dependent);
    // (b) `hidden` must actually hide — CSS `display:flex` used to defeat it and leave a 19px band.
    expect(state.noteVisible, `${route.id}: basis note visible must equal basis-dependent`).toBe(dependent);
    if (!dependent) expect(state.noteHeight, `${route.id}: the hidden note still occupies space`).toBe(0);
    else expect(state.noteTag.length, `${route.id}: the active basis must be named`).toBeGreaterThan(3);
    // (c) and the measurement that makes (a) honest: flipping it changes something, or nothing.
    expect(
      before !== after,
      `${route.id}: flipping the basis ${dependent ? 'changed nothing' : 'changed the screen'}`
    ).toBe(dependent);
  }
  writeEvidence('pricing-basis.json', report);
});

test('R12 — switching the basis relabels or moves every basis-sensitive figure', async ({ page }) => {
  await gotoRoute(page, '#/reconciliation');
  const before = await page.locator('[data-parity="reconciliation.waterfall.start_label"]').textContent();
  await page.locator('#view-toggle button[data-view="after"]').click();
  await settled(page);
  const after = await page.locator('[data-parity="reconciliation.after.start_label"]').textContent();
  expect(after).not.toBe(before);
  const pricing = await page.locator('[data-parity="reconciliation.after.delta_pricing_usd"]').textContent();
  expect(pricing?.trim()).toBe('$0');
});

test('R14 — nothing fails silently across a full walk of the app', async ({ page }) => {
  const { problems } = recordProblems(page);
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    await page.locator('#open-glossary').click();
    await settled(page);
    await page.keyboard.press('Escape');
    await settled(page);
  }
  writeEvidence('console-problems.json', problems);
  expectClean(problems);
});

test('R16 — the Diagnose entity selection survives every lens switch', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/structure');
  const input = page.locator('#diagnose-entity');
  await input.click();
  await input.fill('SPORTHFC');
  await page.locator('.combo-option').first().click();
  await settled(page);
  const chosen = await input.inputValue();
  expect(chosen.length).toBeGreaterThan(0);

  for (const lens of ['ownership', 'data-quality', 'simulator', 'structure']) {
    await page.locator(`.lens-tab[data-lens="${lens}"]`).click();
    await settled(page);
    expect(await input.inputValue(), `selection lost on the ${lens} lens`).toBe(chosen);
  }

  // And across a drawer opening and closing, and a basis flip.
  await page.locator('#open-glossary').click();
  await settled(page);
  await page.keyboard.press('Escape');
  await settled(page);
  expect(await input.inputValue()).toBe(chosen);
});

test('R18 — an empty result offers a way out, not a dead end', async ({ page }) => {
  await gotoRoute(page, '#/diagnose/structure');
  const input = page.locator('#diagnose-entity');
  await input.click();
  await input.fill('zzzzz-no-such-entity');
  await settled(page);
  const empty = page.locator('.combo-empty');
  await expect(empty).toBeVisible();
  const text = ((await empty.textContent()) ?? '').toLowerCase();
  expect(text, 'the empty state must name a recovery action').toMatch(/clear|try|widen|every/);
});
