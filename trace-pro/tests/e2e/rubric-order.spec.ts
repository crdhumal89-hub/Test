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
 * It is a separate file because `scripts/check-limits.mjs` counts test files too, and the two will
 * not fit in one: `rubric.spec.ts` is 347 lines and this is 261, against a ceiling of 400. Splitting
 * by concern was the cheaper of the two honest options; trimming an existing assertion to make room
 * is the dishonest one.
 */
import { test, expect } from '@playwright/test';
import { ROUTES, recordProblems, gotoRoute, writeEvidence, expectClean } from './helpers.js';

interface PaintedText {
  top: number;
  left: number;
  height: number;
  id: string | null;
  tag: string;
  isQuestion: boolean;
  inQuestion: boolean;
  text: string;
}

/**
 * The numbers the "near the top" assertion is derived FROM, all read off the live page rather than
 * chosen. Nothing here is a constant: every field is measured per route, so a change to the chrome
 * moves the threshold with it instead of invalidating it.
 */
interface ContentGeometry {
  /** `window.innerHeight` — the fold. R5 grades "visible on load without scrolling" at 1600×1000. */
  fold: number;
  /** Bottom of the sticky masthead, recorded because it is what pushes the content region down. */
  mastheadBottom: number;
  /** Bottom of the screen nav, i.e. the last chrome edge above `#screen`. */
  navBottom: number;
  /** `#screen`'s border-box top. */
  screenTop: number;
  /**
   * The y at which `#screen`'s FIRST FLOW CHILD paints: its border-box top plus its own top border
   * and padding. This is the highest position any content in the region can legally occupy, so it
   * is the origin the question's position is judged against.
   */
  contentTop: number;
  /** The `.screen-question` / `.lens-question` box itself, so the allowance is its own height. */
  questionTop: number;
  questionHeight: number;
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
        height: Math.round(box.height),
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

/** Read the geometry the threshold is derived from. `null` if the content region is not there. */
async function contentGeometry(
  page: import('@playwright/test').Page
): Promise<ContentGeometry | null> {
  return page.evaluate(() => {
    const screen = document.querySelector('#screen');
    const question = document.querySelector('.screen-question, .lens-question');
    if (!screen || !question) return null;
    const box = screen.getBoundingClientRect();
    const style = getComputedStyle(screen);
    const inset = parseFloat(style.borderTopWidth || '0') + parseFloat(style.paddingTop || '0');
    const questionBox = question.getBoundingClientRect();
    const masthead = document.querySelector('#masthead')?.getBoundingClientRect();
    const nav = document.querySelector('.screen-nav')?.getBoundingClientRect();
    return {
      fold: window.innerHeight,
      mastheadBottom: Math.round(masthead?.bottom ?? 0),
      navBottom: Math.round(nav?.bottom ?? 0),
      screenTop: Math.round(box.top),
      contentTop: Math.round(box.top + inset),
      questionTop: Math.round(questionBox.top),
      questionHeight: Math.round(questionBox.height),
    };
  });
}

test.describe('R1 — the question is the first thing painted, not merely first in the DOM', () => {
  const evidence: Record<string, unknown> = {};

  for (const route of ROUTES) {
    test(`${route.label} paints its question above all other text`, async ({ page }) => {
      const { problems } = recordProblems(page);
      await gotoRoute(page, route.hash);

      const painted = await paintedTexts(page);
      const geometry = await contentGeometry(page);

      /*
       * `findIndex` returns -1 when nothing matches, and `slice(0, -1)` means "all but the last
       * element" — so the previous version recorded N-1 rows of "text above the question" on
       * exactly the screens that HAD no question, which is the only time this evidence is read.
       * -1 is therefore handled explicitly: with no question painted, everything painted is above
       * it, and `questionPainted` says so rather than leaving the reader to infer it from a length.
       */
      const questionIndex = painted.findIndex((p) => p.inQuestion);
      const aboveTheQuestion = questionIndex === -1 ? painted : painted.slice(0, questionIndex);
      const question = questionIndex === -1 ? null : painted[questionIndex];

      /*
       * RECORDED BEFORE ANYTHING CAN THROW. The above-the-question list is diagnostic evidence, and
       * every state that makes it interesting is a state that fails an assertion below — so writing
       * it after the assertions would mean the file never contains the case anyone would open it
       * for. (Measured: with the question's classes stripped, the first version of this rewrite
       * threw at the geometry guard and left `painted-order.json` with no entry for the route at
       * all.) `null`s here are facts, not gaps.
       */
      evidence[route.label] = {
        firstPainted: painted[0] ?? null,
        geometry,
        questionPainted: questionIndex !== -1,
        question,
        paintedCount: painted.length,
        aboveTheQuestion: aboveTheQuestion.map((p) => ({ top: p.top, id: p.id, text: p.text })),
      };

      expect(painted.length, 'the screen must render some text').toBeGreaterThan(3);

      /*
       * A screen with no painted text cannot satisfy R1, so it must FAIL here. This used to read
       * `if (!first) return;`. Measured: with `#screen` emptied of text and the two assertions
       * above removed — which is what a later refactor trimming "redundant" assertions leaves
       * behind — that form reports PASS for a screen that renders nothing at all
       * (`1 passed`, zero painted items). `expect(...).toBeDefined()` in front of it is not the
       * fix either: it makes THAT line fail, so the guard's own branch stays green in isolation and
       * the criterion below is never reached. A throw both narrows the type for what follows and
       * cannot be walked past.
       */
      const first = painted[0];
      if (!first) {
        throw new Error(
          `${route.label} painted no text inside #screen. R1 asks which sentence is at the top of ` +
            `the content region; a region with no text does not answer it, and a test that returns ` +
            `early here reports PASS for a blank screen.`
        );
      }

      /*
       * Two distinct failures, in the order that diagnoses them. "There is no question at all" is
       * not the same defect as "there is a question and something is above it", and putting the
       * missing-question check second would report the second wording for the first fault.
       */
      expect(
        questionIndex,
        `no element matching .screen-question / .lens-question is painted on ${route.label}; ` +
          `everything painted (${painted.length} items) is recorded as above-the-question in ` +
          `docs/evidence/painted-order.json`
      ).not.toBe(-1);

      // The whole criterion, in one assertion: nothing is painted above the question.
      expect(
        first.inQuestion,
        `the topmost painted text on ${route.label} is "${first.text}" at y=${first.top} ` +
          `(${first.id ?? first.tag}), which is not the screen question. R1 requires the question ` +
          `at the top of the screen, and "top" is where it is painted, not where it sits in the DOM.`
      ).toBe(true);

      if (!geometry) {
        throw new Error(
          `${route.label} has no #screen content region and/or no .screen-question / .lens-question ` +
            `element, so there is nothing to measure the question's position against. The painted ` +
            `list and the above-the-question list are already in painted-order.json.`
        );
      }

      /*
       * And the question must be near the top of the content region rather than merely first — a
       * question painted at y=900 with nothing above it satisfies the letter and not the bar.
       *
       * The bar is DERIVED, twice over, and both bounds come off this page on this run:
       *
       *   1. FIRST BAND. `geometry.contentTop` is where `#screen`'s first flow child paints
       *      (`#screen`'s box top plus its own top border and padding). The question may sit at
       *      most its own height below that — i.e. it may be displaced by no more than one band of
       *      itself. Measured slack on all six routes today is 0px: contentTop equals questionTop
       *      exactly (Reconciliation/Pricing/Simulator 164+18=182, the other three lenses
       *      126+18=144), so the allowance is spare room, not a fudge factor that hides anything.
       *   2. THE FOLD. The question's whole box must be above `window.innerHeight`, which is R5's
       *      own bar ("visible on load at 1600×1000 without scrolling") applied to the sentence
       *      that names the screen's job.
       *
       * The number this replaces was a literal 400. It appears nowhere in `docs/ux-rubric.md`, it
       * was ~2.2x the largest position it ever had to admit, and being absolute it would have kept
       * passing if the masthead grew by 200px and shoved every question down with it. Both bounds
       * above move with the chrome because they are read from it.
       */
      const firstBand = geometry.contentTop + geometry.questionHeight;
      expect(
        geometry.questionTop,
        `the question on ${route.label} paints at y=${geometry.questionTop}, below the content ` +
          `region's first band (#screen top ${geometry.screenTop} + inset = ${geometry.contentTop}, ` +
          `plus the question's own ${geometry.questionHeight}px = ${firstBand}). Something is ` +
          `pushing it down the page even though no text is painted above it.`
      ).toBeLessThanOrEqual(firstBand);

      expect(
        geometry.questionTop + geometry.questionHeight,
        `the question on ${route.label} ends at y=${geometry.questionTop + geometry.questionHeight}, ` +
          `below the fold at ${geometry.fold}px, so a first-run user has to scroll to read what the ` +
          `screen is for (R5).`
      ).toBeLessThanOrEqual(geometry.fold);

      expectClean(problems);
    });
  }

  test.afterAll(() => {
    writeEvidence('painted-order.json', evidence);
  });
});
