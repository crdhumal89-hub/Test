/**
 * R2 on the EMPTY and ERROR states — the half of the rubric's scope the crawler had never visited.
 *
 * R2's bar ends "… table header, chip, tooltip and empty state". Every earlier revision of the R2
 * crawler walked the healthy path only, so not one empty or error sentence in this app had ever been
 * graded, even though those sentences are the densest prose it renders and the ones a controller reads
 * when they are already confused. They exist only under a fault, so they are DRIVEN here with the same
 * `page.route` technique `states-helpers.ts` uses for R4: a fixture re-served with a field emptied, a
 * fixture re-served malformed, a fetch aborted, a filter that matches nothing.
 *
 * Each state proves it actually rendered — a visible selector containing a sentence from that state —
 * before anything is graded. A crawl of a state that never arrived reports no findings and means
 * nothing, which is the failure mode this whole file exists to avoid.
 *
 * The two upload slots are in `rubric-vocabulary-uploads.spec.ts`, because their states need files.
 */
import { test, expect, type Page } from '@playwright/test';
import { settled } from './helpers.js';
import { statesFailFixture, statesPatchFixture } from './states-helpers.js';
import { VOCAB_ATTRIBUTES, vocabCrawl, vocabRecordState } from './vocabulary-crawler.js';
import { vocabGrade } from './vocabulary-grade.js';

interface VocabState {
  /** Evidence key, and the test name. */
  id: string;
  hash: string;
  /** How the fault is arranged, before the page loads. */
  arrange?: (page: Page) => Promise<void>;
  /** Anything that has to happen after load — a filter typed, a subview chosen. */
  act?: (page: Page) => Promise<void>;
  /** The selector that proves the state is on screen. */
  proof: string;
  /** A phrase only that state renders. */
  says: string;
  /** What was done to the app, recorded with the evidence. */
  reached: string;
}

const VOCAB_WALK = '#pricing-walk-table';

async function vocabShowWalk(page: Page): Promise<void> {
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settled(page);
}

async function vocabFilterToNothing(page: Page): Promise<void> {
  await page.locator('#pricing-filter').fill('zzzz');
  await settled(page);
}

const VOCAB_STATES: readonly VocabState[] = [
  {
    id: 'tree-empty',
    hash: '#/reconciliation',
    arrange: (page) => statesPatchFixture(page, '**/lookthrough.json', (body) => Object.assign(body, { nodes: [] })),
    proof: '#reconciliation-tree .state-empty',
    says: 'no look-through rows',
    reached: 'lookthrough.json served with nodes: []',
  },
  {
    id: 'tree-error',
    hash: '#/reconciliation',
    arrange: (page) =>
      statesPatchFixture(page, '**/lookthrough.json', (body) => {
        for (const node of body.nodes as unknown as Record<string, unknown>[]) delete node.path;
      }),
    proof: '#reconciliation-tree .state-error',
    says: 'could not be laid out',
    reached: 'lookthrough.json served with every row’s path deleted',
  },
  {
    id: 'price-table-empty',
    hash: '#/pricing',
    act: vocabFilterToNothing,
    proof: '#pricing-price-table .state-empty',
    says: 'No fund matches',
    reached: 'the Pricing filter typed as zzzz, which matches none of the 26 funds',
  },
  {
    id: 'price-table-error',
    hash: '#/pricing',
    arrange: (page) =>
      statesPatchFixture(page, '**/repricing.json', (body) => {
        for (const fund of body.funds as unknown as Record<string, unknown>[]) {
          fund.ltv = 'n/a';
          fund.rev = 'n/a';
        }
      }),
    proof: '#pricing-price-table .state-error',
    says: 'could not be built',
    reached: 'repricing.json served with every fund’s ltv and rev as a non-number',
  },
  {
    id: 'repricing-walk-empty',
    hash: '#/pricing',
    act: async (page) => {
      await vocabShowWalk(page);
      await vocabFilterToNothing(page);
    },
    proof: `${VOCAB_WALK} .state-empty`,
    says: 'No fund matches',
    reached: 'the walk subview chosen, then the filter typed as zzzz',
  },
  {
    id: 'repricing-walk-error',
    hash: '#/pricing',
    arrange: (page) =>
      statesPatchFixture(page, '**/repricing.json', (body) => {
        for (const fund of body.funds as unknown as Record<string, unknown>[]) {
          fund.ltv = 'n/a';
          fund.rev = 'n/a';
        }
      }),
    act: vocabShowWalk,
    proof: `${VOCAB_WALK} .state-error`,
    says: 'repricing walk could not be built',
    reached: 'repricing.json malformed, then the walk subview chosen',
  },
  {
    id: 'structure-lens-empty',
    hash: '#/diagnose/structure',
    arrange: (page) => statesPatchFixture(page, '**/lookthrough.json', (body) => Object.assign(body, { nodes: [] })),
    proof: '#structure-empty .state-empty',
    says: 'lists no entities',
    reached: 'lookthrough.json served with nodes: []',
  },
  {
    id: 'structure-graph-error',
    hash: '#/diagnose/structure',
    arrange: (page) =>
      statesPatchFixture(page, '**/lookthrough.json', (body) => {
        const nodes = body.nodes as unknown as Record<string, unknown>[];
        const apex = nodes.find((n) => n.kind === 'apex');
        if (apex) apex.path = `${String(apex.id)}/`;
      }),
    proof: '#structure-graph-error .state-error',
    says: 'could not be drawn',
    reached: 'lookthrough.json served with a second root, so the layout cannot build one tree',
  },
  {
    id: 'simulator-lens-empty',
    hash: '#/diagnose/simulator',
    arrange: (page) => statesPatchFixture(page, '**/simulator.json', (body) => Object.assign(body, { funds: {} })),
    proof: '#simulator-empty .state-empty',
    says: 'no funds to shock',
    reached: 'simulator.json served with funds: {}',
  },
  {
    id: 'simulator-lens-error',
    hash: '#/diagnose/simulator',
    arrange: (page) =>
      statesPatchFixture(page, '**/simulator.json', (body) => {
        delete (body as unknown as Record<string, unknown>).apex;
      }),
    proof: '#simulator-error .state-error',
    says: 'could not be built',
    reached: 'simulator.json served with its top-level feeder list deleted',
  },
  {
    id: 'ownership-lens-empty',
    hash: '#/diagnose/ownership',
    arrange: (page) =>
      statesPatchFixture(page, '**/universe.json', (body) =>
        Object.assign(body, { edges: [], entities: [], search: [] })
      ),
    proof: '#screen .state-empty',
    says: 'Nothing in the firm-wide universe holds',
    reached: 'universe.json served with its edges, entities and search index emptied',
  },
  {
    id: 'ownership-lens-error',
    hash: '#/diagnose/ownership',
    arrange: (page) => statesFailFixture(page, '**/universe.json'),
    proof: '#screen .state-error',
    says: 'could not be loaded',
    reached: 'every universe.json request aborted',
  },
  {
    id: 'data-quality-empty',
    hash: '#/diagnose/data-quality',
    arrange: (page) => statesPatchFixture(page, '**/universe.json', (body) => Object.assign(body, { issues: [] })),
    proof: '#screen .state-empty',
    says: 'No data-quality issue',
    reached: 'universe.json served with issues: []',
  },
  {
    id: 'data-quality-error',
    hash: '#/diagnose/data-quality',
    arrange: (page) => statesFailFixture(page, '**/universe.json'),
    proof: '#screen .state-error',
    says: 'could not be loaded',
    reached: 'every universe.json request aborted',
  },
  {
    id: 'combobox-empty',
    hash: '#/diagnose/structure',
    act: async (page) => {
      await page.locator('#diagnose-entity').fill('zzzznothing');
      await settled(page);
    },
    proof: '#diagnose-entity-list .combo-empty',
    says: 'No entity matches that',
    reached: 'the Diagnose entity search typed as zzzznothing',
  },
  {
    id: 'combobox-error',
    hash: '#/diagnose/ownership',
    arrange: (page) => statesFailFixture(page, '**/universe.json', 1),
    act: async (page) => {
      await page.locator('#diagnose-entity').fill('');
      await settled(page);
    },
    proof: '#diagnose-entity-list .combo-notice-error',
    says: 'could not be loaded',
    reached: 'universe.json aborted once, then the Diagnose entity list opened',
  },
];

test.describe('R2 — the empty and error states leave no denylist token bare', () => {
  for (const state of VOCAB_STATES) {
    test(`${state.id} · ${state.reached}`, async ({ page }) => {
      await state.arrange?.(page);
      await page.goto('/' + state.hash, { waitUntil: 'load' });
      await settled(page);
      await state.act?.(page);

      // The state must be ON SCREEN before it is graded; otherwise a green result means nothing.
      const proof = page.locator(state.proof).first();
      await expect(proof, `${state.id}: the state never rendered`).toBeVisible();
      await expect(proof).toContainText(state.says);
      const rendered = (await proof.innerText()).replace(/\s+/g, ' ').trim();

      const occurrences = await vocabCrawl(page);
      const { found, dispositions } = vocabGrade(occurrences);
      const attributes = occurrences.filter((o) => o.attribute !== null);
      vocabRecordState(state.id, {
        route: state.hash,
        reached: state.reached,
        proof: state.proof,
        rendered,
        dispositions,
        findings: found,
        occurrences: occurrences.length,
        attributeValues: attributes.length,
        attributesRead: VOCAB_ATTRIBUTES,
      });

      expect(
        found,
        `bare denylist tokens in the ${state.id} state:\n${JSON.stringify(found, null, 1)}`
      ).toEqual([]);
    });
  }
});
