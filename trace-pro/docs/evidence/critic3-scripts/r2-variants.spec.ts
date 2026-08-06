/**
 * Critic-3, R2 variants. Three graders over the same crawl of all six routes (drawers included) plus
 * the expanded reconciliation tree:
 *
 *   V1 theirs                      — tests/e2e/vocabulary-grade.ts as shipped.
 *   V2 case-insensitive            — the rubric writes `qty`/`px`/`mv` lower case and says nothing
 *                                    about case; "Qty held" is an abbreviation in any case.
 *   V3 V2 + WORDLIKE = {own, apex} — word boundaries already stop `str` firing inside "Structure",
 *                                    so the only tokens that need the whole-element rule to avoid
 *                                    crying wolf on English are the two that ARE English words.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  VOCAB_DENYLIST,
  VOCAB_PHRASES,
  vocabCrawl,
  type VocabOccurrence,
} from '../../../tests/e2e/vocabulary-crawler.js';
import { vocabGrade, vocabExpansionAt } from '../../../tests/e2e/vocabulary-grade.js';

const OUT = path.resolve(import.meta.dirname, '..');
const LEFT = '(?<![A-Za-z0-9])';
const RIGHT = '(?![A-Za-z0-9])';
const esc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bounded = (t: string): RegExp => new RegExp(LEFT + esc(t) + RIGHT, 'i');

function grade(occurrences: readonly VocabOccurrence[], wordlike: Set<string>): unknown[] {
  let corpus = '';
  const offsets: number[] = [];
  for (const o of occurrences) {
    offsets.push(corpus.length);
    if (o.attribute) continue;
    corpus += o.text + ' ';
  }
  const found: unknown[] = [];
  for (const token of VOCAB_DENYLIST) {
    const isWordlike = wordlike.has(token.toLowerCase());
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
    occurrences.forEach((o, i) => {
      if (!matches(o)) return;
      seen += 1;
      if (o.linked) return;
      if (at >= 0 && at <= (offsets[i] ?? 0)) return;
      const self = vocabExpansionAt(o.text, token);
      const first = o.text.search(bounded(token));
      if (self && first >= 0 && self.at <= first) return;
      bare.push(o);
    });
    if (bare.length) {
      found.push({
        token,
        bare: bare.length,
        of: seen,
        samples: bare.slice(0, 3).map((b) => ({ text: b.text.slice(0, 90), attr: b.attribute, where: b.where })),
      });
    }
  }
  return found;
}

const ROUTES = [
  ['reconciliation', '#/reconciliation'],
  ['pricing', '#/pricing'],
  ['structure', '#/diagnose/structure'],
  ['ownership', '#/diagnose/ownership'],
  ['data-quality', '#/diagnose/data-quality'],
  ['simulator', '#/diagnose/simulator'],
] as const;

const V2 = new Set(['lt', 'own', 'str', 'sim', 'iss', 'gls', 'rfx', 'apex']);
const V3 = new Set(['own', 'apex']);

test('R2 three graders over six routes and the expanded tree', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const [id, hash] of ROUTES) {
    await page.goto('/' + hash, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.dataset.fetching);
    await page.waitForTimeout(700);
    if (id === 'reconciliation') {
      await page.locator('#expand-all').click();
      await page.waitForTimeout(700);
    }
    const occ = await vocabCrawl(page, ['#open-sources', '#open-glossary']);
    out[id] = {
      occurrences: occ.length,
      V1_theirs: vocabGrade(occ).found,
      V2_caseInsensitive: grade(occ, V2),
      V3_wordlikeOwnApexOnly: grade(occ, V3),
    };
  }
  fs.writeFileSync(path.join(OUT, 'critic3-r2-variants.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
});
