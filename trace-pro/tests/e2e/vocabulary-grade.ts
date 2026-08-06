/**
 * What counts as a DEFINITION — rubric R2 route (a), "expanded on first use on that screen".
 *
 * The shipped version of this accepted three shapes and was loose in three separate ways, any one of
 * which lets an unrelated string excuse a real violation:
 *
 *   1. NO WORD BOUNDARIES. The token was substring-matched inside the expansion patterns, so
 *      "Default: the whole book" contained `lt` followed by `:` followed by lower case and therefore
 *      "defined" the `lt` tab id; "Filter (by fund…)" did the same; "Owners (upward)" defined `own`;
 *      "Structure (the graph…)" defined `str`. Measured, not imagined: on the Ownership route `str`
 *      and `own` were both reported "expanded before first use" with no expansion of either on the
 *      screen.
 *   2. FULLY CASE-INSENSITIVE. Every pattern was recompiled with the `i` flag, so an occurrence the
 *      crawler flags case-sensitively (`MV`, `DC`, `NAV`, `px`, …) could be discharged by a gloss
 *      spelled in a different case — a different token, and potentially a different referent.
 *   3. ANY PARENTHESISED LOWER CASE COUNTED. "AP Deuce Intermediate Holdings I (DC), L.P." — a
 *      registered entity name — matched the "gloss (TOKEN)" shape and defined `DC`.
 *
 * So, three tightenings:
 *
 *   · the token must appear WORD-BOUNDED and spelled EXACTLY as the rubric writes it;
 *   · the two parenthesised shapes are credited only if the gloss PLAUSIBLY CORRESPONDS to the token
 *     — see `vocabPlausibleGloss`;
 *   · the "TOKEN = gloss" shape is credited without a correspondence test, and that is deliberate:
 *     it is the app explicitly asserting a definition, in a shape that does not arise by accident
 *     once the token is word-bounded, and two of this app's tokens are jargon rather than
 *     initialisms — `px` = "unit price" and `apex` = "the top-level feeder funds" have no letter
 *     correspondence to draw, and neither can take route (b) because both are painted inside SVG,
 *     which cannot contain a button. Requiring correspondence there would fail the app for defining
 *     its words correctly.
 *
 * Flagging stays case-insensitive for the eight word-like tab ids while crediting is case-exact.
 * The asymmetry is on purpose: this crawler has been caught excusing real occurrences three times, so
 * where the two sides could differ it errs toward reporting and against excusing.
 */
import {
  VOCAB_DENYLIST,
  VOCAB_PHRASES,
  VOCAB_WORDLIKE,
  type VocabFinding,
  type VocabOccurrence,
} from './vocabulary-crawler.js';

/** Neither side of the token may be a letter or a digit. Works for `Δ`, which `\b` does not. */
const VOCAB_LEFT = '(?<![A-Za-z0-9])';
const VOCAB_RIGHT = '(?![A-Za-z0-9])';

function vocabEscape(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function vocabBounded(token: string, flags = ''): RegExp {
  return new RegExp(VOCAB_LEFT + vocabEscape(token) + VOCAB_RIGHT, flags);
}

/** The first `count` words of `gloss`, lower-cased and stripped of everything but letters. */
function vocabWindow(gloss: string, count: number, fromEnd: boolean): string {
  const words = gloss.toLowerCase().match(/[a-z]+/g) ?? [];
  const slice = fromEnd ? words.slice(Math.max(0, words.length - count)) : words.slice(0, count);
  return slice.join(' ');
}

/**
 * Does `gloss` plausibly expand `token`?
 *
 * Every letter of the token must appear in the gloss IN ORDER, and the token's first letter must open
 * one of the gloss's words. That is the standard test for pairing an abbreviation with its long form,
 * and it accepts the three shapes real controller vocabulary takes:
 *
 *   initialism   `SPV` → "special purpose vehicle",  `NAV` → "net asset value",  `MV` → "market value"
 *   plural tail  `bps` → "basis points"        (b-asis p-oint-s)
 *   contraction  `qty` → "quantity, in units"  (q-uan-t-it-y)
 *
 * and rejects the coincidences that were being credited:
 *
 *   `DC` ← "Intermediate Holdings I"  (no word opens with d)
 *   `VPM` ← "units held"              (no word opens with v)
 *   `px` ← "unit price"               (no x anywhere)
 *
 * `Δ` has no letters to correspond, so nothing can be checked and nothing is claimed.
 */
export function vocabPlausibleGloss(token: string, gloss: string): boolean {
  const want = token.toLowerCase().match(/[a-z]/g) ?? [];
  if (!want.length) return true;
  const text = gloss.toLowerCase();
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== want[0]) continue;
    if (start > 0 && /[a-z]/.test(text[start - 1] ?? '')) continue;
    let matched = 1;
    for (let at = start + 1; at < text.length && matched < want.length; at += 1) {
      if (text[at] === want[matched]) matched += 1;
    }
    if (matched === want.length) return true;
  }
  return false;
}

export interface VocabExpansion {
  /** Character offset in the corpus. */
  at: number;
  /** 1 = "TOKEN = gloss", 2 = "gloss (TOKEN)", 3 = "TOKEN … (gloss)". */
  shape: number;
  snippet: string;
}

/**
 * The earliest credited definition of `token` in `corpus`, or null.
 *
 * The gloss window is bounded to about as many words as the token has letters, because an expansion
 * of a k-letter abbreviation is k-ish words. Unbounded, "AP Deuce Intermediate Holdings I (DC)" finds
 * `d` in "Deuce" and `c` three letters later and reads as a definition of `DC`.
 */
export function vocabExpansionAt(corpus: string, token: string): VocabExpansion | null {
  const t = vocabEscape(token);
  const letters = (token.toLowerCase().match(/[a-z]/g) ?? []).length;
  const words = letters + 1;
  const hits: VocabExpansion[] = [];
  const add = (index: number | undefined, shape: number, whole: string, credited: boolean): void => {
    if (!credited || index === undefined) return;
    hits.push({ at: index, shape, snippet: whole.replace(/\s+/g, ' ').slice(0, 110) });
  };
  // 1. The app asserting a definition: "NAV = net asset value", "Δ — change", "px: unit price".
  // The gloss is captured as far as the next separator purely so the EVIDENCE records a readable
  // snippet; only `m.index` is graded, so widening the match cannot change a verdict.
  for (const m of corpus.matchAll(new RegExp(VOCAB_LEFT + t + VOCAB_RIGHT + '\\s*(?:=|—|–|:)\\s*[a-z][^·;]{0,44}', 'g'))) {
    add(m.index, 1, m[0], true);
  }
  // 2. Gloss first: "Net asset value (NAV), per fund".
  for (const m of corpus.matchAll(new RegExp('([A-Za-z][A-Za-z -]{3,})\\s*\\(\\s*' + t + '\\s*\\)', 'g'))) {
    add(m.index, 2, m[0], vocabPlausibleGloss(token, vocabWindow(m[1] ?? '', words, true)));
  }
  // 3. Abbreviation first: "SPV (special purpose vehicle)", "MV USD (market value, US dollars)".
  for (const m of corpus.matchAll(
    new RegExp(VOCAB_LEFT + t + VOCAB_RIGHT + '[^()]{0,24}\\(\\s*([A-Za-z][^()]{0,80})\\)', 'g')
  )) {
    add(m.index, 3, m[0], vocabPlausibleGloss(token, vocabWindow(m[1] ?? '', words, false)));
  }
  hits.sort((a, b) => a.at - b.at);
  return hits[0] ?? null;
}

/**
 * Does this one reading unit — a text node, or the whole value of one attribute — expand the token at
 * or before the token's own first appearance in it?
 *
 * "Clear the box to see every fund and SPV (special purpose vehicle) in this product" IS an expansion
 * on first use: the reader meets the word and its meaning in the same breath. Grading it against the
 * position of the node it sits in would report the sentence that defines the abbreviation as the
 * violation, which is the opposite of what R2 is for.
 */
function vocabSelfGlossed(text: string, token: string): boolean {
  const expansion = vocabExpansionAt(text, token);
  if (!expansion) return false;
  const first = text.search(vocabBounded(token, 'i'));
  return first >= 0 && expansion.at <= first;
}

export interface VocabVerdict {
  found: VocabFinding[];
  dispositions: Record<string, string>;
}

/**
 * Grade one ordered occurrence list: a finding per token that appears bare — neither glossary-linked
 * (route b) nor preceded on the same screen by a credited expansion of it (route a).
 */
export function vocabGrade(occurrences: readonly VocabOccurrence[]): VocabVerdict {
  // Route (a) reads RENDERED TEXT only; an attribute occupies a position but contributes no prose.
  let corpus = '';
  const offsets: number[] = [];
  for (const occurrence of occurrences) {
    offsets.push(corpus.length);
    if (occurrence.attribute) continue;
    corpus += occurrence.text + ' ';
  }

  const found: VocabFinding[] = [];
  const dispositions: Record<string, string> = {};

  for (const token of VOCAB_DENYLIST) {
    const isPhrase = VOCAB_PHRASES.has(token);
    const isWordlike = VOCAB_WORDLIKE.has(token.toLowerCase());
    /*
     * Phrases are matched inside prose, but WORD-BOUNDED like every other token. Unbounded, `in tol`
     * fires on "Within tolerance" — thirteen times on the Pricing screen, on the tooltip that is the
     * expansion of the very label the token stands for. A truncation is only a truncation when it
     * stands alone; spelled out in full it is the fix, not the defect.
     */
    const matches = (occurrence: VocabOccurrence): boolean => {
      if (isPhrase) return vocabBounded(token, 'i').test(occurrence.text);
      if (isWordlike) return occurrence.whole && occurrence.text.toLowerCase() === token.toLowerCase();
      return vocabBounded(token).test(occurrence.text);
    };

    const expansion = vocabExpansionAt(corpus, token);
    const at = expansion ? expansion.at : -1;

    /*
     * Counted by WHICH route discharged each occurrence, not just whether one did. An earlier version
     * of this reported "expanded before first use" whenever an expansion existed ANYWHERE — including
     * one positioned after every occurrence it was supposed to excuse. The verdict was right; the
     * evidence sentence was not, and on this criterion the evidence is the deliverable.
     */
    let byLink = 0;
    let byExpansion = 0;
    let byPlace = 0;
    const bare: VocabOccurrence[] = [];
    let seen = 0;
    occurrences.forEach((occurrence, index) => {
      if (!matches(occurrence)) return;
      seen += 1;
      if (occurrence.linked) byLink += 1;
      else if (at >= 0 && at <= (offsets[index] ?? 0)) byExpansion += 1;
      else if (vocabSelfGlossed(occurrence.text, token)) byPlace += 1;
      else bare.push(occurrence);
    });

    const how = [
      byLink ? `${byLink} glossary-linked` : '',
      byExpansion ? `${byExpansion} after an expansion on this screen` : '',
      byPlace ? `${byPlace} glossed in place` : '',
    ].filter(Boolean);
    const via = expansion ? ` [shape ${expansion.shape}: ${JSON.stringify(expansion.snippet)}]` : '';
    if (bare.length === 0) {
      dispositions[token] = seen === 0 ? 'absent from this screen' : `no bare occurrence — ${how.join(', ')}${via}`;
      continue;
    }
    dispositions[token] = `BARE ×${bare.length} of ${seen}${how.length ? ` (${how.join(', ')})` : ''}${via}`;
    const first = bare[0];
    if (first) {
      found.push({
        token,
        count: bare.length,
        context: first.text.slice(0, 120),
        where: first.where,
        host: first.host,
        attribute: first.attribute,
      });
    }
  }
  return { found, dispositions };
}
