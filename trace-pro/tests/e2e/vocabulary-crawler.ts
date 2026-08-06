/**
 * The R2 crawler itself: WHAT it reads, and WHAT counts as a definition.
 *
 * Split out of `rubric-vocabulary.spec.ts` because that file now has three callers — the six routes,
 * the empty/error states of every data-dependent panel, and the two upload slots — and one file
 * holding the machinery plus all three suites would be past `scripts/check-limits.mjs`'s 400 lines.
 *
 * ── SCOPE (rubric R2: "every screen, lens, drawer, table header, chip, TOOLTIP and EMPTY STATE") ──
 *
 * 1. Rendered text, in document order, as before.
 * 2. `title`, `aria-label`, `aria-description` and `placeholder` on every element in scope. The bar
 *    names tooltips explicitly and the crawler read ZERO attributes, so ~10 `title:` strings in
 *    src/ui — the Structure legend's "Derived MV …", the price table's "No NAV reported", the
 *    Diagnose search's "… fund, SPV or security …" — had never been graded once.
 * 3. All five chrome hosts, not two. `#masthead` and `#screen` were crawled; `#screen-nav`,
 *    `#view-note` and `#app-foot` were not, although the basis note renders "reported NAV" and
 *    "every fund / SPV / holding" on every basis-dependent screen and the nav links carry each
 *    screen's question as a tooltip. Nothing about the rubric's "every screen" excludes chrome that
 *    is on every screen.
 * 4. The empty and error states, driven with `page.route` — see `rubric-vocabulary-states.spec.ts`
 *    and `rubric-vocabulary-uploads.spec.ts`. Those sentences only exist under a fault, so a crawler
 *    that only ever visits the healthy path grades none of the prose the rubric names last.
 *
 * The glossary's own definition cards (`.glscard`, `.glssec`) stay excluded: they are where
 * abbreviations are ALLOWED to appear.
 *
 * ── DISPOSITION, in the rubric's words ──
 *
 * "An occurrence passes only if it is (a) expanded on first use on that screen, or (b) rendered as a
 * glossary-linked term that opens the definition in one action."
 *
 * Route (b) covers an attribute too, but only its OWN element's: a `term()` button carries the
 * glossary's definition in its `aria-label` and `title` by construction, so grading that label as a
 * violation would report the fix as the defect.
 *
 * Route (a) is positional, because "first use" is a claim about order. Two refinements the attribute
 * crawl forced, both stated so they can be argued with:
 *   · The expansion corpus is RENDERED TEXT ONLY. An expansion a reader has to hover to find is not
 *     an expansion on first use — R1 makes the same call for the screen's question ("not a tooltip,
 *     not placeholder text, not aria-label only").
 *   · Any one reading unit may expand a token INSIDE ITSELF, at or before the token: a tooltip
 *     reading "MV = market value. This is the look-through value …" has expanded it on first use
 *     within the one reading unit the reader is given. That is route (a) honoured, not evaded.
 */
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE } from './helpers.js';

/** Transcribed from docs/ux-rubric.md §R2, in its order. */
export const VOCAB_DENYLIST = [
  'lt', 'rfx', 'str', 'sim', 'iss', 'own', 'gls', 'MV', 'LTV', 'px', 'qty', 'gq', 'apex',
  'nonav', 'in tol', 'scen a', 'scen b', 'mv100', 'dcN', 'NAV', 'bps', 'SPV', 'VPM', 'Δ',
  'FR', 'DC',
];

/**
 * Short codes that are, or read as, ordinary English words: flagged only when the token is the
 * ENTIRE text of an element — a tab called `own`, a column headed `lt`. Flagging them mid-prose
 * would fire on "the product's own NAV", and a crawler that cries wolf on English is worse than no
 * crawler. This refines MATCHING, not the denylist: every rubric token is checked everywhere.
 */
export const VOCAB_WORDLIKE = new Set(['lt', 'own', 'str', 'sim', 'iss', 'gls', 'rfx', 'apex']);

/** Multi-word rubric entries. Never anything but labels, so they are matched inside prose too. */
export const VOCAB_PHRASES = new Set(['in tol', 'scen a', 'scen b']);

/** The attributes a reader can be handed a sentence in. */
export const VOCAB_ATTRIBUTES = ['title', 'aria-label', 'aria-description', 'placeholder'];

/** The chrome and the screen, in the order a reader meets them. */
export const VOCAB_HOSTS: readonly (readonly [string, string])[] = [
  ['#masthead', 'masthead'],
  ['#screen-nav', 'screen-nav'],
  ['#view-note', 'view-note'],
  ['#screen', 'screen'],
  ['#app-foot', 'app-foot'],
];

export interface VocabOccurrence {
  /** What a reader meets: one text node, or the whole value of one attribute. */
  text: string;
  /** Inside a glossary-linked term — route (b). For an attribute, that term's own label. */
  linked: boolean;
  /** The text is the element's entire label. Always true of an attribute value. */
  whole: boolean;
  where: string;
  host: string;
  /** The attribute this came from, or null for rendered text. */
  attribute: string | null;
}

export interface VocabFinding {
  token: string;
  count: number;
  context: string;
  where: string;
  host: string;
  attribute: string | null;
}

/**
 * Read the denylist back out of the frozen rubric. The rubric writes the tokens as inline code spans
 * in the R2 section, so they can be recovered exactly rather than paraphrased — dropping one then
 * fails the test against the rubric instead of quietly grading less.
 */
export function vocabRubricDenylist(): string[] {
  const text = fs.readFileSync(new URL('../../docs/ux-rubric.md', import.meta.url), 'utf8');
  const section = /### R2[^]*?\n\*\*Evidence:\*\*/.exec(text)?.[0] ?? '';
  const bar = section.slice(section.indexOf('denylist'));
  return [...bar.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t): t is string => Boolean(t));
}

/* ------------------------------------------------------------------ collecting */

export async function vocabCollect(page: Page, selector: string, host: string): Promise<VocabOccurrence[]> {
  return page.evaluate(
    ({ sel, hostName, attrs }) => {
      const root = document.querySelector(sel);
      if (!root) return [] as VocabOccurrence[];
      const out: VocabOccurrence[] = [];
      const where = (node: Element | null): string =>
        (node?.id ? '#' + node.id : '') ||
        (typeof node?.className === 'string' && node.className ? node.className : '') ||
        node?.tagName ||
        '?';
      // The root carries attributes of its own, and a TreeWalker starts at its first descendant.
      const nodes: Node[] = [root];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (element.closest('.glscard, .glssec')) continue;
          const linked = !!element.closest('.gterm, [data-glossary-term]');
          for (const name of attrs) {
            const raw = (element.getAttribute(name) ?? '').replace(/\s+/g, ' ').trim();
            if (!raw) continue;
            out.push({
              text: raw,
              linked,
              whole: true,
              where: `${where(element)}@${name}`,
              host: hostName,
              attribute: name,
            });
          }
          continue;
        }
        const raw = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!raw) continue;
        const parent = node.parentElement;
        if (parent?.closest('.glscard, .glssec')) continue;
        const ownText = (parent?.textContent ?? '').replace(/\s+/g, ' ').trim();
        out.push({
          text: raw,
          linked: !!parent?.closest('.gterm, [data-glossary-term]'),
          whole: ownText === raw,
          where: where(parent),
          host: hostName,
          attribute: null,
        });
      }
      return out;
    },
    { sel: selector, hostName: host, attrs: VOCAB_ATTRIBUTES }
  );
}

/** Open a drawer if its control exists; returns false when this screen has no such control. */
async function vocabOpenDrawer(page: Page, opener: string): Promise<boolean> {
  const button = page.locator(opener);
  if (!(await button.count())) return false;
  await button.click();
  await page
    .locator('#drawer-host [role="dialog"], #drawer-host .drawer, #drawer-host')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);
  return true;
}

/**
 * Every occurrence on the screen as it now stands, then one per drawer in `openers`. One drawer at a
 * time — they are mutually exclusive, so crawling after opening both would only ever see the second.
 */
export async function vocabCrawl(page: Page, openers: readonly string[] = []): Promise<VocabOccurrence[]> {
  const out: VocabOccurrence[] = [];
  for (const [selector, host] of VOCAB_HOSTS) out.push(...(await vocabCollect(page, selector, host)));
  for (const opener of openers) {
    if (!(await vocabOpenDrawer(page, opener))) continue;
    out.push(...(await vocabCollect(page, '#drawer-host', opener.replace('#open-', 'drawer:'))));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  return out;
}

/** Crawl a drawer that is already open, without closing it. Used by the upload-slot states. */
export async function vocabCrawlWithOpenDrawer(page: Page, host: string): Promise<VocabOccurrence[]> {
  const out: VocabOccurrence[] = [];
  for (const [selector, name] of VOCAB_HOSTS) out.push(...(await vocabCollect(page, selector, name)));
  out.push(...(await vocabCollect(page, '#drawer-host', host)));
  return out;
}

/**
 * One evidence file for every driven state, merged as the suites run. The e2e config uses a single
 * worker, so read-modify-write is safe; the same pattern as `statesShot()`.
 */
export function vocabRecordState(name: string, entry: unknown): void {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const log = path.join(EVIDENCE, 'abbreviations-states.json');
  const seen = fs.existsSync(log)
    ? (JSON.parse(fs.readFileSync(log, 'utf8')) as Record<string, unknown>)
    : {};
  seen[name] = entry;
  fs.writeFileSync(log, JSON.stringify(seen, null, 1) + '\n');
}
