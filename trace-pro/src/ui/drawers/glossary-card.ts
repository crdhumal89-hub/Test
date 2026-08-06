/**
 * How ONE glossary card is built — the marked-up prose, the Source/Method rows, the three-price table
 * and the worked example.
 *
 * Split out of `glossary.ts` when that file reached 404 lines — four over the limit
 * `scripts/check-limits.mjs` enforces, after the search box's placeholder grew the sentence that
 * expands `bps` in place (rubric R2). The seam is the natural one: this
 * module knows how a card looks and nothing about the drawer, the search, the category chips or the
 * store; `glossary.ts` keeps the overlay, the filtering and the focus behaviour. Class names remain
 * the original's, because parity-map.json addresses them (`#glsbody .glscard`, `.glsplain`).
 */
import { glossaryHaystack, glossarySlug } from '../../glossary/terms.js';
import type { GlossarySection, GlossaryTerm } from '../../glossary/terms.js';
import { el } from '../primitives/dom.js';

export interface GlossaryCardRef {
  slug: string;
  haystack: string;
  node: HTMLElement;
}

/** `**bold**`, `*italic*` and `` `code` `` in the term prose. No data ever reaches innerHTML. */
const GLOSSARY_MARKS = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

export function glossaryRich(marked: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let last = 0;
  for (const match of marked.matchAll(GLOSSARY_MARKS)) {
    const at = match.index;
    if (at > last) out.push(marked.slice(last, at));
    if (match[1] != null) out.push(el('b', { text: match[1] }));
    else if (match[2] != null) out.push(el('i', { text: match[2] }));
    else out.push(el('code', { text: match[3] ?? '' }));
    last = at + match[0].length;
  }
  if (last < marked.length) out.push(marked.slice(last));
  return out;
}

function glossaryMetaRow(label: string, marked: string, valueClass?: string): HTMLElement {
  return el('div', { class: 'glsmeta' + (valueClass ? ' glsmean' : '') }, [
    el('span', { class: 'glslab', text: label }),
    el('span', { class: valueClass ?? '' }, glossaryRich(marked)),
  ]);
}

function glossaryPriceTable(term: GlossaryTerm): HTMLElement | null {
  if (!term.priceTable?.length) return null;
  const table = el('table', { class: 'mini glspxtbl' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { class: 'l', scope: 'col', text: 'Price column' }),
        el('th', { scope: 'col', text: 'Value' }),
        el('th', { class: 'l', scope: 'col', text: 'How it is built' }),
      ]),
    ])
  );
  const body = el('tbody');
  for (const row of term.priceTable) {
    body.append(
      el('tr', {}, [
        el('td', { class: 'l' }, [
          el('span', { class: 'glskey', text: row.column }),
          row.note ? el('span', { class: 'sm', text: row.note }) : null,
        ]),
        el('td', { class: 'px mono', text: row.value }),
        el('td', { class: 'l' }, [
          document.createTextNode(row.build),
          el('span', { class: 'sm', text: row.detail }),
        ]),
      ])
    );
  }
  table.append(body);
  return table;
}

export function glossaryCard(term: GlossaryTerm, section: GlossarySection): GlossaryCardRef {
  const slug = glossarySlug(term.term);
  const headingId = `glossary-term-${slug}`;
  const card = el('article', {
    class: `glscard g-${section.key}${term.wide ? ' wide' : ''}`,
    'data-term': slug,
    'aria-labelledby': headingId,
    tabindex: '0',
  });

  const heading = el('h4', { class: 'glsterm', id: headingId }, [document.createTextNode(term.term)]);
  for (const alias of term.aliases) heading.append(el('span', { class: 'glsalias', text: alias }));

  card.append(
    el('span', { class: 'glstag', text: section.tag }),
    heading,
    // The definition. This element is what parity reads, and its text is the original's verbatim.
    el('div', { class: 'glsmeta glsmean' }, [
      el('span', { class: 'glslab', text: 'Meaning' }),
      el(
        'span',
        { class: 'glsplain', 'data-parity': `glossary.term.${slug}.definition` },
        glossaryRich(term.plain)
      ),
    ]),
    glossaryMetaRow('Source', term.source),
    glossaryMetaRow('Method', term.method)
  );

  const priceTable = glossaryPriceTable(term);
  if (term.example || priceTable) {
    const worked = el('div', { class: 'glsex' }, [
      el('div', {
        class: 'glsexh',
        text: 'Worked example' + (term.exampleLabel ? ' · ' + term.exampleLabel : ''),
      }),
    ]);
    if (priceTable) worked.append(priceTable);
    if (term.example) worked.append(el('p', { class: 'glsexp' }, glossaryRich(term.example)));
    card.append(worked);
  }
  return { slug, haystack: glossaryHaystack(term), node: card };
}
