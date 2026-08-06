/**
 * R2 on the two upload slots' empty and error states.
 *
 * Separate from `rubric-vocabulary-states.spec.ts` for one reason: these four states are reached by
 * choosing a FILE, so they need files written and a drawer opened, and one file holding both suites
 * would be past the 400-line limit.
 *
 * These are the four sentences in the app most likely to put a raw column name in front of a reader —
 * they have to, because the reader is being told which column was missing from the file they just
 * chose: "ENDING_NAV", "Fund Code", "Quantity VPM". So they are exactly the prose R2's bar means by
 * "empty state", and none of it had ever been crawled.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { settled } from './helpers.js';
import { VOCAB_ATTRIBUTES, vocabCrawlWithOpenDrawer, vocabRecordState } from './vocabulary-crawler.js';
import { vocabGrade } from './vocabulary-grade.js';

const VOCAB_UPLOAD_DIR = path.resolve(import.meta.dirname, '../../test-results/vocabulary-uploads');

function vocabWriteFile(name: string, text: string): string {
  fs.mkdirSync(VOCAB_UPLOAD_DIR, { recursive: true });
  const file = path.join(VOCAB_UPLOAD_DIR, name);
  fs.writeFileSync(file, text);
  return file;
}

async function vocabOpenSources(page: Page): Promise<void> {
  await page.goto('/#/reconciliation', { waitUntil: 'load' });
  await settled(page);
  await page.locator('#open-sources').click();
  await expect(page.locator('#sources-drawer')).toBeVisible();
}

interface VocabUploadState {
  id: string;
  /** Which slot the file goes in. */
  input: string;
  file: () => string;
  proof: string;
  says: string;
  reached: string;
}

const VOCAB_UPLOAD_STATES: readonly VocabUploadState[] = [
  {
    id: 'upload-nav-empty',
    input: '#sources-file-nav',
    file: () => vocabWriteFile('vocab-nav-headers-only.csv', 'PRODUCT,FUND_CODE,ENDING_NAV\n'),
    proof: '#sources-state-nav .state-empty',
    says: 'no fund rows under its header',
    reached: 'a NAV report with a header row and nothing under it',
  },
  {
    id: 'upload-nav-error',
    input: '#sources-file-nav',
    file: () => vocabWriteFile('vocab-minutes.csv', 'Some,Meeting,Minutes\n1,2,3\n'),
    proof: '#sources-state-nav .state-error',
    says: 'No net asset values could be read',
    reached: 'a file with none of a NAV report’s columns chosen in the NAV slot',
  },
  {
    id: 'upload-position-empty',
    input: '#sources-file-position',
    file: () =>
      vocabWriteFile(
        'vocab-positions-other-entity.csv',
        'Fund Entity,Fund Code,SPV Fund Code,Quantity VPM,MV USD\n' +
          '"Some Other Product","AAA","","0","0"\n'
      ),
    proof: '#sources-state-position .state-empty',
    says: 'Nothing was replaced',
    reached: 'a position report whose only row is for a different fund entity',
  },
  {
    id: 'upload-position-error',
    input: '#sources-file-position',
    file: () => vocabWriteFile('vocab-not-positions.csv', 'Ticker,Price\nABC,1.23\n'),
    proof: '#sources-state-position .state-error',
    says: 'could not be read as a Position Report',
    reached: 'a two-column file with none of a position report’s columns',
  },
];

test.describe('R2 — the upload slots’ empty and error states leave no denylist token bare', () => {
  for (const state of VOCAB_UPLOAD_STATES) {
    test(`${state.id} · ${state.reached}`, async ({ page }) => {
      const file = state.file();
      await vocabOpenSources(page);
      await page.locator(state.input).setInputFiles(file);

      const proof = page.locator(state.proof).first();
      await expect(proof, `${state.id}: the state never rendered`).toBeVisible();
      await expect(proof).toContainText(state.says);
      const rendered = (await proof.innerText()).replace(/\s+/g, ' ').trim();

      // The drawer stays open: it IS the panel under test, so it is crawled where it is.
      const occurrences = await vocabCrawlWithOpenDrawer(page, 'drawer:sources');
      const { found, dispositions } = vocabGrade(occurrences);
      const attributes = occurrences.filter((o) => o.attribute !== null);
      vocabRecordState(state.id, {
        route: '#/reconciliation',
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
