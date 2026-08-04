/**
 * R1, measured where the user actually reads it: PAINTED position.
 *
 * This file exists because R1 was green for the entire project while being false on one screen.
 * The R1 test in `rubric.spec.ts` takes `.screen-question` with Playwright's `.first()`, which is
 * DOM order — and the defect was a CSS one. `#screen:has(> #pricing-price-table)` is a flex column
 * in which every child is given an explicit `order`; a child that is not listed keeps the initial
 * `order: 0` and paints before all of them. When the glossary vocabulary line arrived on Pricing it
 * was that unlisted child, so Pricing opened with "Terms on this screen: NAV = net asset value …"
 * at y=180 and its question at y=215. DOM order was still question-first, so the test still passed.
 *
 * The criterion says the screen states its question "in one line AT THE TOP". Top is a geometric
 * claim. So this test sorts every element in `#screen` that contributes its own visible text by
 * painted position and asserts the first one is the question, or something inside it — which is the
 * criterion's own words rather than a proxy for them.
 *
 * It is a separate file only because `rubric.spec.ts` is at 399 of its 400 permitted lines and
 * `scripts/check-limits.mjs` counts test files too. Splitting was the cheaper of the two honest
 * options; trimming an existing assertion to make room is the dishonest one.
 */
import { test, expect } from '@playwright/test';
import { ROUTES, recordProblems, gotoRoute, writeEvidence, expectClean } from './helpers.js';

interface PaintedText {
  top: number;
  left: number;
  id: string | null;
  tag: string;
  isQuestion: boolean;
  inQuestion: boolean;
  text: string;
}

/**
 * Every element in `#screen` carrying its OWN text (a direct text-node child), sorted by where it
 * is painted. Own text, not `textContent`, so an ancestor wrapper does not shadow the element that
 * actually renders the words; and geometry from `getBoundingClientRect`, so `order`, `flex-direction:
 * column-reverse`, absolute positioning and `transform` are all accounted for rather than assumed
 * absent.
 */
async function paintedTexts(page: import('@playwright/test').Page): Promise<PaintedText[]> {
  return page.evaluate(() => {
    const screen = document.querySelector('#screen');
    if (!screen) return [];
    const items = [];
    for (const el of screen.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
        .join(' ');
      if (!own) continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.width === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const question = el.closest('.screen-question, .lens-question');
      items.push({
        top: Math.round(box.top),
        left: Math.round(box.left),
        id: el.id || null,
        tag: el.tagName,
        isQuestion: el.matches('.screen-question, .lens-question'),
        inQuestion: question !== null,
        text: own.slice(0, 120),
      });
    }
    // Painted reading order: down the page, then across. Ties matter — a glossary term inside the
    // question shares its `top`, and it is inside the question, so either winning is correct.
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    return items;
  });
}

test.describe('R1 — the question is the first thing painted, not merely first in the DOM', () => {
  const evidence: Record<string, unknown> = {};

  for (const route of ROUTES) {
    test(`${route.label} paints its question above all other text`, async ({ page }) => {
      const { problems } = recordProblems(page);
      await gotoRoute(page, route.hash);

      const painted = await paintedTexts(page);
      expect(painted.length, 'the screen must render some text').toBeGreaterThan(3);

      const first = painted[0];
      expect(first, 'painted text list must not be empty').toBeDefined();
      if (!first) return;

      evidence[route.label] = {
        firstPainted: first,
        question: painted.find((p) => p.isQuestion) ?? null,
        aboveTheQuestion: painted
          .slice(0, painted.findIndex((p) => p.inQuestion))
          .map((p) => ({ top: p.top, id: p.id, text: p.text })),
      };

      // The whole criterion, in one assertion: nothing is painted above the question.
      expect(
        first.inQuestion,
        `the topmost painted text on ${route.label} is "${first.text}" at y=${first.top} ` +
          `(${first.id ?? first.tag}), which is not the screen question. R1 requires the question ` +
          `at the top of the screen, and "top" is where it is painted, not where it sits in the DOM.`
      ).toBe(true);

      // And the question must be near the top of the content region rather than merely first — a
      // question painted at y=900 with nothing above it satisfies the letter and not the bar.
      const question = painted.find((p) => p.inQuestion);
      expect(question, 'a question element must be painted').toBeDefined();
      expect(question?.top ?? Infinity, 'the question must be in the first screenful').toBeLessThan(400);

      expectClean(problems);
    });
  }

  test.afterAll(() => {
    writeEvidence('painted-order.json', evidence);
  });
});
