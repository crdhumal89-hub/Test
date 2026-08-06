/**
 * R2 on the surfaces you only reach by USING the app.
 *
 * The default render of a screen is not the screen. Every prior revision of the R2 crawl visited each
 * route once, in its arrival state, and graded that — so any abbreviation that appears only after a
 * click was ungraded by construction. That is not hypothetical: four entity names in this product's
 * look-through tree carry a literal "(DC)" — "AP Deuce Intermediate Holdings I (DC), L.P." and three
 * more — and they are invisible until the tree is expanded. Reconciliation was the one screen showing
 * DC without disclosing it, and it stayed that way through six widenings of this crawl because none of
 * them pressed a button.
 *
 * So this file drives each screen into the states a controller actually reads and re-crawls: the tree
 * expanded, the walk subview, the repriced basis, a row's detail panel, the data-quality buckets
 * opened, the simulator after a shock. Same crawler, same grader, same frozen denylist as
 * `rubric-vocabulary.spec.ts` — only the state differs.
 */
import { test, expect } from '@playwright/test';
import { gotoRoute, writeEvidence } from './helpers.js';
import { VOCAB_DENYLIST, vocabCrawl } from './vocabulary-crawler.js';
import { vocabGrade } from './vocabulary-grade.js';

interface InteractedState {
  /** Evidence key, and the sentence describing what a reader did to get here. */
  name: string;
  route: string;
  reached: string;
  /** Drive the screen into the state. Must be idempotent enough to run on a fresh page. */
  act: (page: import('@playwright/test').Page) => Promise<void>;
}

const CLICK_SETTLE = 400;

async function clickIfPresent(page: import('@playwright/test').Page, selector: string): Promise<boolean> {
  const target = page.locator(selector).first();
  if (!(await target.count())) return false;
  if (!(await target.isVisible())) return false;
  await target.click();
  await page.waitForTimeout(CLICK_SETTLE);
  return true;
}

const STATES: readonly InteractedState[] = [
  {
    name: 'reconciliation-expanded',
    route: '#/reconciliation',
    reached: 'the look-through tree fully expanded — the state that reveals the "(DC)" entity names',
    act: async (page) => {
      await clickIfPresent(page, '#expand-all');
    },
  },
  {
    name: 'reconciliation-expanded-repriced',
    route: '#/reconciliation',
    reached: 'the tree expanded under the repriced basis, where several column sub-labels change',
    act: async (page) => {
      await clickIfPresent(page, '#expand-all');
      await clickIfPresent(page, '[data-view="after"]');
    },
  },
  {
    name: 'reconciliation-row-detail',
    route: '#/reconciliation',
    reached: 'a tree row opened into its derivation panel',
    act: async (page) => {
      await clickIfPresent(page, '#expand-all');
      await clickIfPresent(page, '[data-node-id="0"]');
    },
  },
  {
    name: 'pricing-walk',
    route: '#/pricing',
    reached: 'the repricing walk subview, which carries its own column set',
    act: async (page) => {
      await clickIfPresent(page, '[data-subview="walk"]');
    },
  },
  {
    name: 'pricing-repriced',
    route: '#/pricing',
    reached: 'the price table under the repriced basis',
    act: async (page) => {
      await clickIfPresent(page, '[data-view="after"]');
    },
  },
  {
    name: 'data-quality-expanded',
    route: '#/diagnose/data-quality',
    reached: 'the data-quality buckets opened, showing per-entity detail rows',
    act: async (page) => {
      const buckets = page.locator('#screen [aria-expanded="false"]');
      const count = Math.min(await buckets.count(), 6);
      for (let i = 0; i < count; i += 1) {
        const bucket = buckets.nth(0);
        if (await bucket.count()) await bucket.click().catch(() => undefined);
      }
      await page.waitForTimeout(CLICK_SETTLE);
    },
  },
  {
    name: 'simulator-after-shock',
    route: '#/diagnose/simulator',
    reached: 'the simulator after a full bottom-up reprice, which renders the run ledger',
    act: async (page) => {
      await clickIfPresent(page, '#simulator-reprice');
      await page.waitForTimeout(1200);
    },
  },
];

test.describe('R2 — no bare abbreviation survives on a state you reach by using the app', () => {
  for (const state of STATES) {
    test(`${state.name} leaves no denylist token bare`, async ({ page }) => {
      await gotoRoute(page, state.route);
      await state.act(page);

      const occurrences = await vocabCrawl(page, []);
      const { found, dispositions } = vocabGrade(occurrences);

      writeEvidence(`abbreviations-interacted-${state.name}.json`, {
        state: state.name,
        route: state.route,
        reached: state.reached,
        denylist: VOCAB_DENYLIST,
        dispositions,
        findings: found,
        occurrences: occurrences.length,
      });

      // The state must actually have been reached — a failed click would otherwise re-grade the
      // arrival render and pass for the wrong reason, which is the whole fault this file exists for.
      expect(
        occurrences.length,
        `the ${state.name} crawl read suspiciously little; the interaction probably did not land`
      ).toBeGreaterThan(40);

      expect(
        found,
        `bare denylist tokens on ${state.name} (${state.reached}) — each must be expanded on first ` +
          `use or rendered as a glossary-linked term:\n${JSON.stringify(found, null, 1)}`
      ).toEqual([]);
    });
  }
});
