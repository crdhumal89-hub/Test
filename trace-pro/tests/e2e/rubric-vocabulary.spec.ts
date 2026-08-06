/**
 * R2 on the six healthy routes, graded against the rubric's OWN denylist and its OWN scope.
 *
 * This file replaces the R2 test that used to live in `rubric.spec.ts`, which was unsound in the most
 * specific way a test can be. The rubric names 26 tokens. That test carried 26 tokens — and 11 of
 * them were not the rubric's. It had dropped `MV`, `px`, `qty`, `apex`, `NAV`, `bps`, `SPV`, `VPM`,
 * `Δ`, `FR` and `DC` and added 11 multi-word phrases (`Derived MV`, `Publish px`, `Δ Pricing`,
 * `Repricing P&L`, `Immediate %`, …) that the rubric never lists. The matching COUNT was right, which
 * is exactly why nobody noticed: the list looked complete against the rubric's "26" while omitting
 * every token that would actually have failed. `vocabRubricDenylist()` now reads the tokens back out
 * of the frozen rubric at runtime, so the two cannot drift again.
 *
 * SCOPE is the rubric's too — "every screen, lens, drawer, table header, chip, tooltip and empty
 * state" — and it has now been narrower than that in six different ways, each found by someone other
 * than whoever wrote the revision before it:
 *
 *   1. a substituted denylist (above);
 *   2. `px` and `qty` parked in WORDLIKE, so they were excused unless they were an element's entire
 *      text — neither is an English word and neither ever appears as prose;
 *   3. only `#masthead` and `#screen` crawled, so no drawer prose was graded at all;
 *   4. ZERO attributes read, while the bar names tooltips explicitly;
 *   5. `#screen-nav`, `#view-note` and `#app-foot` still uncrawled — the basis note renders
 *      "reported NAV" and "every fund / SPV / holding" on every basis-dependent screen;
 *   6. only the healthy path ever visited, so no empty or error sentence had ever been graded.
 *
 * 4 and 5 are closed by `vocabulary-crawler.ts`, 6 by `rubric-vocabulary-states.spec.ts` and
 * `rubric-vocabulary-uploads.spec.ts`. A seventh looseness — a coincidental gloss standing in for a
 * real expansion — is dealt with in `vocabulary-grade.ts`, which is where "what counts as a
 * definition" now lives.
 */
import { test, expect } from '@playwright/test';
import { ROUTES, gotoRoute, writeEvidence } from './helpers.js';
import {
  VOCAB_ATTRIBUTES,
  VOCAB_DENYLIST,
  VOCAB_HOSTS,
  vocabCrawl,
  vocabRubricDenylist,
} from './vocabulary-crawler.js';
import { vocabGrade, vocabPlausibleGloss } from './vocabulary-grade.js';

test.describe('R2 — no bare abbreviation survives outside the glossary', () => {
  test('the denylist is the rubric’s, token for token', () => {
    const fromRubric = vocabRubricDenylist();
    expect(fromRubric.length, 'the rubric’s R2 list must be recoverable').toBeGreaterThan(20);
    const missing = fromRubric.filter((t) => !VOCAB_DENYLIST.includes(t));
    expect(missing, `denylist is missing rubric tokens: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * The correspondence rule, stated as cases rather than as prose. Written down here because it is
   * what decides whether a parenthesis is a definition or a coincidence, and a rule that exists only
   * inside the thing it grades cannot be argued with.
   */
  test('a gloss is credited only when its letters correspond to the token', () => {
    const credited: readonly (readonly [string, string])[] = [
      ['SPV', 'special purpose vehicle'],
      ['NAV', 'net asset value'],
      ['MV', 'market value'],
      ['bps', 'basis points'],
      ['qty', 'quantity, in units'],
      ['DC', 'double count'],
      ['Δ', 'change'],
    ];
    const refused: readonly (readonly [string, string])[] = [
      ['DC', 'Intermediate Holdings I'],
      ['VPM', 'units held'],
      ['px', 'unit price'],
      ['apex', 'the top-level feeder funds'],
      ['NAV', 'no value at all'],
    ];
    for (const [token, gloss] of credited) {
      expect(vocabPlausibleGloss(token, gloss), `${token} ← "${gloss}" must be credited`).toBe(true);
    }
    for (const [token, gloss] of refused) {
      expect(vocabPlausibleGloss(token, gloss), `${token} ← "${gloss}" must be refused`).toBe(false);
    }
  });

  for (const route of ROUTES) {
    test(`${route.label} leaves no denylist token bare`, async ({ page }) => {
      await gotoRoute(page, route.hash);

      // Reading order: the chrome and the screen, then each drawer, because a drawer opens over a
      // screen the reader has already met.
      const occurrences = await vocabCrawl(page, ['#open-sources', '#open-glossary']);
      const { found, dispositions } = vocabGrade(occurrences);
      const attributes = occurrences.filter((o) => o.attribute !== null);
      const byAttribute: Record<string, number> = {};
      for (const name of VOCAB_ATTRIBUTES) {
        byAttribute[name] = attributes.filter((o) => o.attribute === name).length;
      }

      writeEvidence(`abbreviations-${route.id}.json`, {
        route: route.id,
        denylist: VOCAB_DENYLIST,
        dispositions,
        findings: found,
        occurrences: occurrences.length,
        textNodes: occurrences.length - attributes.length,
        attributeValues: attributes.length,
        attributesRead: VOCAB_ATTRIBUTES,
        byAttribute,
        hosts: VOCAB_HOSTS.map(([, host]) => host),
        drawers: [...new Set(occurrences.map((o) => o.host).filter((h) => h.startsWith('drawer:')))],
      });

      // A crawl that read nothing would report nothing, so prove the new surface was really read.
      expect(attributes.length, 'the tooltip and label surface must actually be read').toBeGreaterThan(20);
      expect(
        found,
        `bare denylist tokens on ${route.label} — each must be expanded on first use or ` +
          `rendered as a glossary-linked term:\n${JSON.stringify(found, null, 1)}`
      ).toEqual([]);
    });
  }
});
