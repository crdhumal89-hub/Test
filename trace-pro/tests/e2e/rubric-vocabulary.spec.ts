/**
 * R2, graded against the rubric's OWN denylist and its OWN scope.
 *
 * This file replaces the R2 test that used to live in `rubric.spec.ts`, which was unsound in the
 * most specific way a test can be. The rubric names 26 tokens. That test carried 26 tokens — and 11
 * of them were not the rubric's. It had dropped `MV`, `px`, `qty`, `apex`, `NAV`, `bps`, `SPV`,
 * `VPM`, `Δ`, `FR` and `DC` and added 11 multi-word phrases (`Derived MV`, `Publish px`,
 * `Δ Pricing`, `Repricing P&L`, `Immediate %`, …) that the rubric never lists. The matching COUNT
 * was right, which is exactly why nobody noticed: the list looked complete against the rubric's
 * "26" while omitting every token that would actually have failed.
 *
 * The denylist below is transcribed from `docs/ux-rubric.md` §R2 and nothing else, and
 * `rubricDenylist()` reads it back out of the frozen rubric at runtime, so the two cannot drift
 * again: dropping a token fails the test against the rubric rather than quietly grading less.
 *
 * SCOPE is the rubric's too. Its bar is "every screen, lens, DRAWER, table header, chip, tooltip
 * and empty state". Two earlier revisions of this file were narrower than that in two different
 * ways, both found by someone other than me and both fixed here:
 *   - `px` and `qty` sat in WORDLIKE, so they were excused unless they were an element's entire
 *     text. Neither is an English word and neither ever appears as prose; they are labels wherever
 *     they occur, including ~20 SVG captions reading "px 1.122812".
 *   - Only `#masthead` and `#screen` were crawled, so drawer prose was never graded — and the Data
 *     sources drawer describes an .xlsx column layout in the densest abbreviations in the app.
 *
 * DISPOSITION, in the rubric's words: "An occurrence passes only if it is (a) expanded on first use
 * on that screen, or (b) rendered as a glossary-linked term that opens the definition in one
 * action." Route (a) is positional, because "first use" is a claim about order.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ROUTES, gotoRoute, writeEvidence } from './helpers.js';

/** Transcribed from docs/ux-rubric.md §R2, in its order. */
const DENYLIST = [
  'lt', 'rfx', 'str', 'sim', 'iss', 'own', 'gls', 'MV', 'LTV', 'px', 'qty', 'gq', 'apex',
  'nonav', 'in tol', 'scen a', 'scen b', 'mv100', 'dcN', 'NAV', 'bps', 'SPV', 'VPM', 'Δ',
  'FR', 'DC',
];

/**
 * Short codes that are, or read as, ordinary English words: flagged only when the token is the
 * ENTIRE text of an element — a tab called `own`, a column headed `lt`. Flagging them mid-prose
 * would fire on "the product's own NAV", and a crawler that cries wolf on English is worse than no
 * crawler. This refines MATCHING, not the denylist: every rubric token is checked on every screen.
 */
const WORDLIKE = new Set(['lt', 'own', 'str', 'sim', 'iss', 'gls', 'rfx', 'apex']);

/** Multi-word rubric entries; these are never anything but labels, so substring matching is right. */
const PHRASES = new Set(['in tol', 'scen a', 'scen b']);

interface Occurrence {
  text: string;
  linked: boolean;
  whole: boolean;
  where: string;
  host: string;
}

/**
 * Read the denylist back out of the frozen rubric. The rubric writes the tokens as inline code
 * spans in the R2 section, so they can be recovered exactly rather than paraphrased.
 */
function rubricDenylist(): string[] {
  const text = readFileSync(new URL('../../docs/ux-rubric.md', import.meta.url), 'utf8');
  const section = /### R2[^]*?\n\*\*Evidence:\*\*/.exec(text)?.[0] ?? '';
  const bar = section.slice(section.indexOf('denylist'));
  return [...bar.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t): t is string => Boolean(t));
}

/**
 * Every text node under `selector` that carries visible words, in document order. The glossary's own
 * definition cards are skipped — they are where abbreviations are ALLOWED to appear.
 */
async function collect(page: Page, selector: string, host: string): Promise<Occurrence[]> {
  return page.evaluate(
    ({ sel, hostName }) => {
      const root = document.querySelector(sel);
      if (!root) return [];
      const out: {
        text: string;
        linked: boolean;
        whole: boolean;
        where: string;
        host: string;
      }[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const raw = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!raw) continue;
        const parent = node.parentElement;
        if (parent?.closest('.glscard, .glssec')) continue;
        const ownText = (parent?.textContent ?? '').replace(/\s+/g, ' ').trim();
        out.push({
          text: raw,
          linked: !!parent?.closest('.gterm, [data-glossary-term]'),
          whole: ownText === raw,
          where: (parent?.id && '#' + parent.id) || parent?.className || parent?.tagName || '?',
          host: hostName,
        });
      }
      return out;
    },
    { sel: selector, hostName: host }
  );
}

/** Open a drawer if its control exists, and return the selector of the panel that appeared. */
async function openDrawer(page: Page, opener: string): Promise<string | null> {
  const button = page.locator(opener);
  if (!(await button.count())) return null;
  await button.click();
  const panel = page.locator('#drawer-host [role="dialog"], #drawer-host .drawer, #drawer-host').first();
  await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  return '#drawer-host';
}

async function closeDrawer(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
}

function escapeRe(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Grade one ordered occurrence list. Returns a finding per token that appears bare — neither
 * glossary-linked (route b) nor preceded by the screen's own expansion of it (route a).
 */
function grade(occurrences: readonly Occurrence[]): {
  found: { token: string; context: string; where: string; host: string }[];
  dispositions: Record<string, string>;
} {
  let all = '';
  const offsets: number[] = [];
  for (const o of occurrences) {
    offsets.push(all.length);
    all += o.text + ' ';
  }

  /** Character offset of the token's expansion, or -1 if it is never expanded. */
  const expansionAt = (token: string): number => {
    const t = escapeRe(token);
    const hits = [
      // "NAV = net asset value" — a vocabulary line.
      new RegExp(t + '\\s*(?:=|—|–|:)\\s*[a-z]'),
      // "net asset value (NAV)" — gloss first.
      new RegExp('[a-z][a-z ]{3,}\\s*\\(' + t + '\\)'),
      // "Quantity VPM (units held)", "MV USD (market value, US dollars)" — abbreviation first, gloss
      // in parentheses. This is the commonest form in real prose and the first two patterns missed
      // it entirely, so drawer text that DID explain itself was being reported bare. Bounded to 24
      // characters and a lower-case opening so it means "glossed right here", not "a bracket appears
      // somewhere later in the document".
      new RegExp(t + '[^()]{0,24}\\(\\s*[a-z]'),
    ]
      // Expansion detection is case-INSENSITIVE, while bare-occurrence matching stays case-sensitive
      // as the rubric writes each token. "SIM (simulator)" really does define `sim` for the reader;
      // requiring the case to agree made the test report a token the app had just explained.
      .map((re) => new RegExp(re.source, 'i'))
      .map((re) => all.search(re))
      .filter((i) => i >= 0);
    return hits.length ? Math.min(...hits) : -1;
  };

  const found: { token: string; context: string; where: string; host: string }[] = [];
  const dispositions: Record<string, string> = {};

  for (const token of DENYLIST) {
    const isPhrase = PHRASES.has(token);
    const isWordlike = WORDLIKE.has(token.toLowerCase());
    const matches = (o: Occurrence): boolean => {
      if (isPhrase) return o.text.toLowerCase().includes(token.toLowerCase());
      if (isWordlike) return o.whole && o.text.toLowerCase() === token.toLowerCase();
      // Whole-word, case-sensitive as the rubric writes it.
      return new RegExp('(?<![A-Za-z0-9])' + escapeRe(token) + '(?![A-Za-z0-9])').test(o.text);
    };

    const at = expansionAt(token);
    const bare = occurrences.filter(
      (o, i) => !o.linked && matches(o) && !(at >= 0 && at <= (offsets[i] ?? 0))
    );

    if (bare.length === 0) {
      dispositions[token] = at >= 0 ? 'expanded before first use' : 'absent or glossary-linked';
      continue;
    }
    dispositions[token] =
      at >= 0 ? `BARE ×${bare.length} (expansion comes too late)` : `BARE ×${bare.length}`;
    const first = bare[0];
    if (first) {
      found.push({ token, context: first.text.slice(0, 100), where: first.where, host: first.host });
    }
  }
  return { found, dispositions };
}

test.describe('R2 — no bare abbreviation survives outside the glossary', () => {
  test('the denylist is the rubric’s, token for token', () => {
    const fromRubric = rubricDenylist();
    expect(fromRubric.length, 'the rubric’s R2 list must be recoverable').toBeGreaterThan(20);
    const missing = fromRubric.filter((t) => !DENYLIST.includes(t));
    expect(missing, `denylist is missing rubric tokens: ${missing.join(', ')}`).toEqual([]);
  });

  for (const route of ROUTES) {
    test(`${route.label} leaves no denylist token bare`, async ({ page }) => {
      await gotoRoute(page, route.hash);

      // Reading order: the chrome and the screen, then each drawer, because a drawer opens over a
      // screen the reader has already met. One drawer at a time — they are mutually exclusive, so
      // crawling after opening both would only ever see the second.
      const occurrences: Occurrence[] = [
        ...(await collect(page, '#masthead', 'masthead')),
        ...(await collect(page, '#screen', 'screen')),
      ];
      for (const opener of ['#open-sources', '#open-glossary']) {
        const panel = await openDrawer(page, opener);
        if (panel) {
          occurrences.push(...(await collect(page, panel, opener.replace('#open-', 'drawer:'))));
          await closeDrawer(page);
        }
      }

      const { found, dispositions } = grade(occurrences);
      writeEvidence(`abbreviations-${route.id}.json`, {
        route: route.id,
        denylist: DENYLIST,
        dispositions,
        findings: found,
        textNodes: occurrences.length,
        hosts: [...new Set(occurrences.map((o) => o.host))],
      });

      expect(
        found,
        `bare denylist tokens on ${route.label} — each must be expanded on first use or ` +
          `rendered as a glossary-linked term:\n${JSON.stringify(found, null, 1)}`
      ).toEqual([]);
    });
  }
});
