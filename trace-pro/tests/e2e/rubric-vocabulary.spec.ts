/**
 * R2, graded against the rubric's OWN denylist.
 *
 * This file replaces the R2 test that used to live in `rubric.spec.ts`, which was unsound in the
 * most specific way a test can be. The rubric names 26 tokens. That test carried 26 tokens — and 11
 * of them were not the rubric's. It had dropped `MV`, `px`, `qty`, `apex`, `NAV`, `bps`, `SPV`,
 * `VPM`, `Δ`, `FR` and `DC` and added 11 multi-word phrases (`Derived MV`, `Publish px`,
 * `Δ Pricing`, `Repricing P&L`, `Immediate %`, …) that the rubric never lists. The matching COUNT
 * was right, which is exactly why nobody noticed: the list looked complete against the rubric's
 * "26" while omitting every token that would actually have failed.
 *
 * So the denylist below is transcribed from `docs/ux-rubric.md` §R2 and nothing else. It is asserted
 * against the rubric file at runtime by `rubricDenylist()`, so the two cannot drift again: if
 * someone edits this array, the test fails against the frozen rubric rather than quietly grading
 * something weaker.
 *
 * DISPOSITION, in the rubric's words: "An occurrence passes only if it is (a) expanded on first use
 * on that screen, or (b) rendered as a glossary-linked term that opens the definition in one
 * action." Both routes are implemented; neither is assumed.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ROUTES, gotoRoute, writeEvidence } from './helpers.js';

/** Transcribed from docs/ux-rubric.md §R2, in its order. */
const DENYLIST = [
  'lt', 'rfx', 'str', 'sim', 'iss', 'own', 'gls', 'MV', 'LTV', 'px', 'qty', 'gq', 'apex',
  'nonav', 'in tol', 'scen a', 'scen b', 'mv100', 'dcN', 'NAV', 'bps', 'SPV', 'VPM', 'Δ',
  'FR', 'DC',
];

/**
 * Short codes that are, or read as, ordinary English words. These are flagged only when the token is
 * the ENTIRE text of an element — a tab called `own`, a column headed `lt`. Flagging them mid-prose
 * would fire on "the product's own NAV", and a crawler that cries wolf on English is worse than no
 * crawler. This is a refinement of MATCHING, not of the denylist: every rubric token is still
 * checked on every screen.
 */
const WORDLIKE = new Set(['lt', 'own', 'str', 'sim', 'iss', 'gls', 'rfx', 'apex']);
// `px` and `qty` were in the set above and should not have been: neither is an English word, and
// neither ever appears as prose — they are labels wherever they occur ("px 1.122812" on ~20 SVG
// captions, "Qty" as a column head). Excusing them unless they were an element's entire text made
// this test more lenient than the rubric, which lists both unconditionally. They are whole-word
// matched like every other non-word token.

/** Multi-word rubric entries; these are never anything but labels, so substring matching is right. */
const PHRASES = new Set(['in tol', 'scen a', 'scen b']);

/**
 * Read the denylist back out of the frozen rubric and compare. The rubric writes the tokens as
 * inline code spans in the R2 section, so they can be recovered exactly rather than paraphrased.
 */
function rubricDenylist(): string[] {
  const text = readFileSync(new URL('../../docs/ux-rubric.md', import.meta.url), 'utf8');
  const section = /### R2[^]*?\n\*\*Evidence:\*\*/.exec(text)?.[0] ?? '';
  const bar = section.slice(section.indexOf('denylist'));
  return [...bar.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t): t is string => Boolean(t));
}

interface Finding {
  route: string;
  token: string;
  context: string;
  where: string;
}

test.describe('R2 — no bare abbreviation survives outside the glossary', () => {
  const evidence: { denylist: string[]; perRoute: Record<string, unknown>; findings: Finding[] } = {
    denylist: DENYLIST,
    perRoute: {},
    findings: [],
  };

  test('the denylist is the rubric’s, token for token', () => {
    const fromRubric = rubricDenylist();
    expect(fromRubric.length, 'the rubric’s R2 list must be recoverable').toBeGreaterThan(20);
    // Every rubric token must be present here. Extra tokens are allowed (a stricter test is fine);
    // a MISSING one is the defect this file exists to prevent.
    const missing = fromRubric.filter((t) => !DENYLIST.includes(t));
    expect(missing, `denylist is missing rubric tokens: ${missing.join(', ')}`).toEqual([]);
  });

  for (const route of ROUTES) {
    test(`${route.label} leaves no denylist token bare`, async ({ page }) => {
      await gotoRoute(page, route.hash);

      const scan = await page.evaluate(
        ({ tokens, wordlike, phrases }) => {
          const hosts = [document.getElementById('masthead'), document.getElementById('screen')];
          const occurrences: { text: string; linked: boolean; whole: boolean; where: string }[] = [];
          for (const host of hosts) {
            if (!host) continue;
            const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const raw = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
              if (!raw) continue;
              const parent = node.parentElement;
              // The glossary's own definition cards are where abbreviations are ALLOWED to appear.
              if (parent?.closest('.glscard, .glssec')) continue;
              const linked = !!parent?.closest('.gterm, [data-glossary-term]');
              const ownText = (parent?.textContent ?? '').replace(/\s+/g, ' ').trim();
              occurrences.push({
                text: raw,
                linked,
                whole: ownText === raw,
                where: (parent?.id && '#' + parent.id) || parent?.className || parent?.tagName || '?',
              });
            }
          }

          // Route (a) is "expanded on FIRST USE on that screen", so position matters: an expansion
          // in a vocabulary line does not dispose of an earlier bare occurrence further up the page.
          // Without this the masthead tagline's "NAV pricing and look-through" — the first NAV a
          // reader meets on every screen — was excused by a vocabulary line rendered below it.
          let all = '';
          const offsets: number[] = [];
          for (const o of occurrences) {
            offsets.push(all.length);
            all += o.text + ' ';
          }
          /** Character offset of the token's expansion, or -1 if the screen never expands it. */
          const expansionAt = (token: string): number => {
            const t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const forms = [
              new RegExp(t + '\\s*(?:=|—|–|:)\\s*[a-z]'),
              new RegExp('[a-z][a-z ]{3,}\\s*\\(' + t + '\\)'),
            ];
            const hits = forms.map((re) => all.search(re)).filter((i) => i >= 0);
            return hits.length ? Math.min(...hits) : -1;
          };

          const found: { token: string; context: string; where: string }[] = [];
          const dispositions: Record<string, string> = {};
          for (const token of tokens) {
            const isPhrase = phrases.includes(token);
            const isWordlike = wordlike.includes(token.toLowerCase());
            const matches = (o: { text: string; whole: boolean }): boolean => {
              if (isPhrase) return o.text.toLowerCase().includes(token.toLowerCase());
              if (isWordlike) return o.whole && o.text.toLowerCase() === token.toLowerCase();
              // Whole-word, case-sensitive as the rubric writes it.
              const t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return new RegExp('(?<![A-Za-z0-9])' + t + '(?![A-Za-z0-9])').test(o.text);
            };
            const at = expansionAt(token);
            // A bare occurrence is one that is neither glossary-linked (route b) nor preceded by the
            // screen's expansion of that token (route a).
            const bare = occurrences.filter(
              (o, i) => !o.linked && matches(o) && !(at >= 0 && at <= (offsets[i] ?? 0))
            );
            if (bare.length === 0) {
              dispositions[token] =
                at >= 0 ? 'expanded before first use' : 'absent or glossary-linked';
              continue;
            }
            dispositions[token] =
              at >= 0 ? `BARE ×${bare.length} (expansion comes too late)` : `BARE ×${bare.length}`;
            const first = bare[0];
            if (first) found.push({ token, context: first.text.slice(0, 100), where: first.where });
          }
          return { found, dispositions, occurrences: occurrences.length };
        },
        { tokens: DENYLIST, wordlike: [...WORDLIKE], phrases: [...PHRASES] }
      );

      evidence.perRoute[route.id] = { dispositions: scan.dispositions, textNodes: scan.occurrences };
      // Written per route, not in afterAll: a retried failure runs in a fresh worker, so a single
      // afterAll only ever records whichever routes that last worker happened to run.
      writeEvidence('abbreviations-' + route.id + '.json', evidence.perRoute[route.id]);
      for (const f of scan.found) evidence.findings.push({ route: route.id, ...f });

      expect(
        scan.found,
        `bare denylist tokens on ${route.label} — each must be expanded on first use or ` +
          `rendered as a glossary-linked term:\n${JSON.stringify(scan.found, null, 1)}`
      ).toEqual([]);
    });
  }

  test.afterAll(() => {
    writeEvidence('abbreviations.json', evidence);
  });
});
