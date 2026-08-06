/**
 * Critic-3, R2: the SAME crawler and the SAME grader the app ships, pointed at surfaces the shipped
 * suite never visits — the Pricing walk subview, the After pricing view, the reconciliation detail
 * panel, an expanded ownership tree with its inspector, every data-quality bucket body, the simulator
 * after a shock has been run, and the glossary term card.
 *
 * Two verdicts per scene:
 *   theirs — tests/e2e/vocabulary-grade.ts, unchanged;
 *   mine   — the same rules with matching made CASE-INSENSITIVE for every token, because the rubric
 *            writes `qty`/`px`/`mv` in lower case and says nothing about case, and "Qty held" is a
 *            bare abbreviation to a reader whatever case it is spelled in.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  VOCAB_DENYLIST,
  VOCAB_PHRASES,
  VOCAB_WORDLIKE,
  vocabCollect,
  vocabCrawl,
  type VocabOccurrence,
} from '../../../tests/e2e/vocabulary-crawler.js';
import { vocabGrade, vocabExpansionAt } from '../../../tests/e2e/vocabulary-grade.js';

const OUT = path.resolve(import.meta.dirname, '..');

async function settled(page: Page, quiet = 300): Promise<void> {
  await page.evaluate(
    (q) =>
      new Promise<void>((res) => {
        let last = Date.now();
        const mo = new MutationObserver(() => {
          last = Date.now();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        const tick = (): void => {
          if (Date.now() - last >= q) {
            mo.disconnect();
            res();
          } else setTimeout(tick, 40);
        };
        setTimeout(tick, 40);
      }),
    quiet
  );
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settled(page);
}

/* ---------------------------------------------------------------- my stricter grader */

const LEFT = '(?<![A-Za-z0-9])';
const RIGHT = '(?![A-Za-z0-9])';
function esc(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function bounded(t: string): RegExp {
  return new RegExp(LEFT + esc(t) + RIGHT, 'i');
}

interface Finding {
  token: string;
  count: number;
  context: string;
  where: string;
  host: string;
  attribute: string | null;
}

/** Their crediting rules, their expansion shapes — but matching is case-insensitive throughout. */
function gradeCaseInsensitive(occurrences: readonly VocabOccurrence[]): {
  found: Finding[];
  dispositions: Record<string, string>;
} {
  let corpus = '';
  const offsets: number[] = [];
  for (const o of occurrences) {
    offsets.push(corpus.length);
    if (o.attribute) continue;
    corpus += o.text + ' ';
  }
  const found: Finding[] = [];
  const dispositions: Record<string, string> = {};
  for (const token of VOCAB_DENYLIST) {
    const isWordlike = VOCAB_WORDLIKE.has(token.toLowerCase());
    const isPhrase = VOCAB_PHRASES.has(token);
    const matches = (o: VocabOccurrence): boolean => {
      if (isPhrase) return bounded(token).test(o.text);
      if (isWordlike) return o.whole && o.text.toLowerCase() === token.toLowerCase();
      return bounded(token).test(o.text);
    };
    const expansion = vocabExpansionAt(corpus, token);
    const at = expansion ? expansion.at : -1;
    const bare: VocabOccurrence[] = [];
    let seen = 0;
    let byLink = 0;
    let byExp = 0;
    let byPlace = 0;
    occurrences.forEach((o, i) => {
      if (!matches(o)) return;
      seen += 1;
      if (o.linked) byLink += 1;
      else if (at >= 0 && at <= (offsets[i] ?? 0)) byExp += 1;
      else {
        const self = vocabExpansionAt(o.text, token);
        const first = o.text.search(bounded(token));
        if (self && first >= 0 && self.at <= first) byPlace += 1;
        else bare.push(o);
      }
    });
    dispositions[token] = bare.length
      ? `BARE x${bare.length} of ${seen} (link ${byLink}, expansion ${byExp}, in-place ${byPlace})`
      : seen === 0
        ? 'absent'
        : `clean (link ${byLink}, expansion ${byExp}, in-place ${byPlace})${expansion ? ` [shape ${expansion.shape}: ${JSON.stringify(expansion.snippet)}]` : ''}`;
    const first = bare[0];
    if (first) {
      found.push({
        token,
        count: bare.length,
        context: first.text.slice(0, 140),
        where: first.where,
        host: first.host,
        attribute: first.attribute,
      });
    }
  }
  return { found, dispositions };
}

/* ---------------------------------------------------------------- the scenes */

interface Scene {
  id: string;
  hash: string;
  act?: (page: Page) => Promise<void>;
  /** Extra hosts to crawl in addition to the five chrome hosts. */
  extra?: readonly (readonly [string, string])[];
  openers?: readonly string[];
}

const SCENES: readonly Scene[] = [
  { id: 'pricing-walk-healthy', hash: '#/pricing', act: async (p) => {
      await p.locator('#pricing-subview button[data-subview="walk"]').click();
      await settled(p);
    } },
  { id: 'pricing-after-view', hash: '#/pricing', act: async (p) => {
      await p.locator('#view-toggle button[data-view="after"]').click();
      await settled(p);
    } },
  { id: 'pricing-after-walk', hash: '#/pricing', act: async (p) => {
      await p.locator('#view-toggle button[data-view="after"]').click();
      await p.locator('#pricing-subview button[data-subview="walk"]').click();
      await settled(p);
    } },
  { id: 'pricing-fund-detail', hash: '#/pricing', act: async (p) => {
      await p.locator('#rectable tbody tr.row').first().click();
      await settled(p);
    } },
  { id: 'reconciliation-expanded-detail', hash: '#/reconciliation', act: async (p) => {
      await p.locator('#expand-all').click();
      await settled(p);
      const rows = p.locator('#tree tbody tr');
      const n = await rows.count();
      await rows.nth(Math.min(3, n - 1)).click();
      await settled(p);
    } },
  { id: 'reconciliation-after-view', hash: '#/reconciliation', act: async (p) => {
      await p.locator('#view-toggle button[data-view="after"]').click();
      await settled(p);
    } },
  { id: 'ownership-expanded-inspector', hash: '#/diagnose/ownership', act: async (p) => {
      const rows = p.locator('#revtree tbody tr');
      if (await rows.count()) {
        await rows.first().click();
        await settled(p);
      }
      const more = p.locator('#revtree tbody tr');
      const n = await more.count();
      if (n > 1) {
        await more.nth(1).click();
        await settled(p);
      }
    } },
  { id: 'data-quality-buckets-open', hash: '#/diagnose/data-quality', act: async (p) => {
      const heads = p.locator('#data-quality-buckets [role="button"], #data-quality-buckets button, #data-quality-buckets .bucket-head');
      const n = await heads.count();
      for (let i = 0; i < n; i += 1) {
        await heads.nth(i).click({ timeout: 5000 }).catch(() => undefined);
      }
      await settled(p);
    } },
  { id: 'simulator-after-run', hash: '#/diagnose/simulator', act: async (p) => {
      await p.locator('#simulator-run').click();
      await settled(p, 600);
    } },
  { id: 'structure-node-focused', hash: '#/diagnose/structure', act: async (p) => {
      const node = p.locator('#structure-stage svg .strnode').first();
      if (await node.count()) {
        await node.click({ force: true });
        await settled(p);
      }
    } },
  { id: 'glossary-term-card', hash: '#/pricing', act: async (p) => {
      await p.locator('#screen .gterm').first().click();
      await settled(p);
    }, extra: [['#drawer-host', 'drawer:glossary-card']] },
];

const RESULTS_FILE = path.join(OUT, 'critic3-r2-wider.json');

/** Read-modify-write, so a worker restart after a failure cannot discard earlier scenes. */
function record(id: string, entry: unknown): void {
  const seen = fs.existsSync(RESULTS_FILE)
    ? (JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) as Record<string, unknown>)
    : {};
  seen[id] = entry;
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(seen, null, 1) + '\n');
}

test.describe('critic3 R2 — wider surface', () => {
  for (const scene of SCENES) {
    test(scene.id, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
      page.on('pageerror', (e) => problems.push(String(e)));
      await page.goto('/' + scene.hash, { waitUntil: 'load' });
      await ready(page);
      await scene.act?.(page);

      const occurrences: VocabOccurrence[] = await vocabCrawl(page, scene.openers ?? []);
      for (const [sel, host] of scene.extra ?? []) {
        occurrences.push(...(await vocabCollect(page, sel, host)));
      }
      const theirs = vocabGrade(occurrences);
      const mine = gradeCaseInsensitive(occurrences);
      record(scene.id, {
        hash: scene.hash,
        occurrences: occurrences.length,
        attributeValues: occurrences.filter((o) => o.attribute).length,
        theirFindings: theirs.found,
        myFindings: mine.found,
        theirDispositions: theirs.dispositions,
        myDispositions: mine.dispositions,
        consoleProblems: problems,
      });
      await page.screenshot({ path: path.join(OUT, `critic3-r2-${scene.id}.png`), fullPage: false });
      // Reported, not asserted: this probe is a measurement, and the report is the deliverable.
      expect(true).toBe(true);
    });
  }
});
