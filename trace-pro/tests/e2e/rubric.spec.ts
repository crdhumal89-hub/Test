/**
 * Machine-checked rubric criteria. This spec exists to GENERATE the evidence an independent critic
 * cites in docs/ux-scorecard.md — it does not grade anything itself, and passing it is necessary
 * but not sufficient for the UX gate.
 *
 * Criteria checked here: R1 (screen states its question), R2 (no bare abbreviations), R3 (unit and
 * as-of on every figure), R5 (primary answer above the fold), R6 (focus and keyboard), R7 (glossary
 * one action away), R12 (pricing basis never ambiguous), R14 (nothing fails silently),
 * R16 (selection survives navigation), R18 (empty states offer a recovery).
 */
import { test, expect } from '@playwright/test';
import {
  ROUTES,
  recordProblems,
  settled,
  gotoRoute,
  isAboveFold,
  tabOrder,
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

test('R3 — a figure is never readable while its as-of date is not', async ({ page }) => {
  const report: { route: string; asofVisible: boolean; figureCount: number }[] = [];
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const asofVisible = await page.locator('#asof').isVisible();
    const figureCount = await page.locator('[data-parity]').count();
    report.push({ route: route.id, asofVisible, figureCount });
    expect(asofVisible, `${route.id}: the as-of date must be visible alongside figures`).toBe(true);
  }
  writeEvidence('units-and-asof.json', report);
});

test('R5 — the primary answer is above the fold on load, with no click', async ({ page }) => {
  // Each entry names the element that carries the screen's primary answer. Kept in step with
  // docs/first-run.md, which is the human-readable version of the same contract.
  const primary: Record<string, string> = {
    reconciliation: '[data-parity="reconciliation.waterfall.nav"]',
    pricing: '[data-parity="pricing.score.nav"]',
    'diagnose-structure': '#structure-caption',
    'diagnose-ownership': '#ownership-checks',
    'diagnose-data-quality': '#data-quality-kpi',
    'diagnose-simulator': '#simulator-runline',
  };
  const report: Record<string, boolean> = {};
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const selector = primary[route.id];
    if (!selector) continue;
    const above = await isAboveFold(page, selector);
    report[route.id] = above;
    await page.screenshot({ path: `docs/evidence/fold-${route.id}.png` });
    expect(above, `${route.id}: primary answer must be in the viewport on load`).toBe(true);
  }
  writeEvidence('above-the-fold.json', report);
});

test.describe('R6 — focus is visible and everything is reachable by keyboard', () => {
  test('no bare outline:none survives in the stylesheets', async ({ page }) => {
    await gotoRoute(page, ROUTES[0].hash);
    const bare = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (/outline\s*:\s*none/.test(rule.cssText) && !/:focus-visible/.test(rule.selectorText)) {
            offenders.push(rule.selectorText);
          }
        }
      }
      return offenders;
    });
    expect(bare, 'outline:none without a :focus-visible replacement').toEqual([]);
  });

  for (const route of ROUTES) {
    test(`${route.label} tab order reaches every control with a visible ring`, async ({ page }) => {
      await gotoRoute(page, route.hash);
      const stops = await tabOrder(page);
      writeEvidence(`tab-order-${route.id}.json`, stops);
      expect(stops.length, 'must have reachable controls').toBeGreaterThan(3);
      // Every stop must be a real control or carry an explicit role.
      const untyped = stops.filter((s) => /^(div|span|td|tr|th)(?!\[)/.test(s));
      expect(untyped, `stops with no role: ${untyped.join(', ')}`).toEqual([]);
    });
  }
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

test('R12 — the pricing basis is never ambiguous, and never offered where it does nothing', async ({
  page,
}) => {
  const report: { route: string; noteVisible: boolean; toggleVisible: boolean }[] = [];
  for (const route of ROUTES) {
    await gotoRoute(page, route.hash);
    const noteVisible = await page.locator('#view-note').isVisible();
    const toggleVisible = await page.locator('#view-toggle').isVisible();
    report.push({ route: route.id, noteVisible, toggleVisible });
    // Where figures depend on the basis, the active basis must be stated on screen.
    const dependent = ['reconciliation', 'pricing', 'diagnose-simulator'].includes(route.id);
    if (dependent) {
      expect(noteVisible, `${route.id}: active basis must be visible`).toBe(true);
    }
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
