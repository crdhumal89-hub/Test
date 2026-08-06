/**
 * The Glossary drawer — an overlay, not the original's seventh tab. The original made a controller
 * *leave the screen that raised the question* to read the answer, which is why its content was also
 * duplicated as inline help on two other tabs. Here it opens over whatever is on screen, from
 * anywhere, in one action (rubric R7) — and, since `focusTerm()` below, AT the term whose label was
 * clicked — and closes without disturbing the selection underneath. Structure and class names match
 * the original's (`#glsbody .glscard`, `.glsplain`, `.glschip[data-group]`), because
 * parity-map.json addresses them by those selectors.
 */
import {
  GLOSSARY_SECTIONS,
  GLOSSARY_TERM_COUNT,
  glossaryFacts,
  glossarySlug,
  glossaryTerms,
} from '../../glossary/terms.js';
import type { GlossaryCategory } from '../../glossary/terms.js';
import type { Store } from '../../state/store.js';
import { el, replace, trapFocus, emptyState, errorState } from '../primitives/dom.js';
import { glossaryCard, type GlossaryCardRef } from './glossary-card.js';
import { termBindGlossary } from '../primitives/term.js';

export const GLOSSARY_INTRO =
  'Every term used in TRACE-Pro, in plain language — with its SOURCE (which report/system the ' +
  'number comes from) and METHOD (how it is calculated). Start with the three price columns below ' +
  'if you are unsure why there are three.';

/**
 * `bps` is glossed in place. The crawler excludes the definition CARDS from R2 — they are where
 * abbreviations belong — but not this box, and rightly: a placeholder is a label, not a definition,
 * and it is the one string in the drawer a reader meets before any card. It cannot be a
 * glossary-linked term either, so the gloss goes where the word is.
 */
const GLOSSARY_SEARCH_HINT =
  'Search terms, aliases & definitions — e.g. publish, applied, bps (basis points), ownership';

interface GlossarySectionRef {
  key: GlossaryCategory;
  node: HTMLElement;
  cards: GlossaryCardRef[];
}

type GlossaryReset = (patch: { glossaryQuery?: string; glossaryGroup?: string }) => void;

function glossaryEmptyNode(query: string, group: string, onReset: GlossaryReset): HTMLElement {
  const scoped = group === 'all' ? '' : ' in that category';
  const node = query
    ? emptyState(
        `No terms match “${query}”${scoped}. Try “publish px”, “revised”, “ownership”, “NAV”, or “bps”.`,
        { label: 'Clear the search', onAct: () => onReset({ glossaryQuery: '', glossaryGroup: 'all' }) }
      )
    : emptyState('That category has no terms.', { label: 'Show all categories', onAct: () => onReset({ glossaryGroup: 'all' }) });
  if (query && group !== 'all') {
    const wider = el('button', { type: 'button', class: 'btn', text: 'Search every category' });
    wider.addEventListener('click', () => onReset({ glossaryGroup: 'all' }));
    node.append(wider);
  }
  return node;
}

/**
 * Mount the drawer into `host` (the shell's `#drawer-host`). It renders once and then only shows,
 * hides and filters, so typing never loses focus and the 35 cards are built once per fixture.
 */
export function mountGlossaryDrawer(host: HTMLElement, store: Store): () => void {
  const panel = el('aside', {
    class: 'drawer drawer-glossary',
    id: 'glossary-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'glossary-title',
    'aria-hidden': 'true',
    hidden: 'hidden',
  });

  const close = el('button', {
    type: 'button',
    class: 'drawer-close',
    id: 'glossary-close',
    'aria-label': 'Close the glossary',
    text: '×',
  });
  // Closing clears the deep link, so the next `G` opens the whole glossary, not the last term.
  close.addEventListener('click', () => store.set({ drawer: null, glossaryFocusTerm: null }));

  const search = el('input', {
    id: 'glssearch',
    class: 'glssearch',
    type: 'search',
    placeholder: GLOSSARY_SEARCH_HINT,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const count = el('span', {
    id: 'glscount',
    class: 'glscount',
    'data-parity': 'glossary.term_count',
    role: 'status',
    'aria-live': 'polite',
  });
  const chips = el('div', {
    class: 'glschips',
    id: 'glschips',
    role: 'group',
    'aria-label': 'Filter the glossary by category',
    'data-parity': 'glossary.category_chips',
  });
  const body = el('div', { id: 'glsbody' });
  const emptyHost = el('div', { id: 'glsempty', class: 'glsempty', hidden: 'hidden' });

  const chipButtons = new Map<string, HTMLButtonElement>();
  for (const [index, entry] of [{ key: 'all', chip: 'All' }, ...GLOSSARY_SECTIONS].entries()) {
    // A whitespace node between chips, so the joined chip text reads as words and not one run-on.
    if (index > 0) chips.append(document.createTextNode(' '));
    const button = el('button', {
      type: 'button',
      class: 'glschip',
      'data-group': entry.key,
      'aria-pressed': 'false',
      text: entry.chip,
    });
    button.addEventListener('click', () => store.set({ glossaryGroup: entry.key }));
    chips.append(button);
    chipButtons.set(entry.key, button);
  }

  replace(
    panel,
    el('header', { class: 'drawer-head' }, [
      el('div', { class: 'glsintro' }, [
        el('h2', { class: 'glstt', id: 'glossary-title', text: 'Glossary' }),
        el('p', { class: 'glssub', 'data-parity': 'glossary.intro', text: GLOSSARY_INTRO }),
      ]),
      close,
    ]),
    el('div', { class: 'glsbar', id: 'glsbar' }, [
      el('div', { class: 'glssearchwrap' }, [
        el('label', { class: 'glssearchlab', for: 'glssearch', text: 'Find a term' }),
        search,
        count,
      ]),
      chips,
    ]),
    el('div', { class: 'drawer-body' }, [body, emptyHost])
  );
  host.append(panel);

  let sections: GlossarySectionRef[] = [];
  let cards: GlossaryCardRef[] = [];

  function build(): void {
    const facts = glossaryFacts(store.repricing, store.core.legacyPricing);
    const terms = glossaryTerms(facts);
    sections = [];
    cards = [];
    replace(body);
    if (terms.length !== GLOSSARY_TERM_COUNT) {
      body.append(
        errorState(
          'The glossary is incomplete.',
          `${terms.length} of ${GLOSSARY_TERM_COUNT} terms loaded, so some definitions are missing.`,
          { label: 'Reload the app', onAct: () => location.reload() }
        )
      );
    }
    for (const section of GLOSSARY_SECTIONS) {
      const grid = el('div', { class: 'glsgrid' });
      const ref: GlossarySectionRef = {
        key: section.key,
        node: el('section', { class: `glssec g-${section.key}`, id: `gls-${section.key}`, 'data-group': section.key }, [
          el('h3', { class: 'glssectt', 'data-parity': 'glossary.section_headers', text: section.title }),
          grid,
        ]),
        cards: [],
      };
      for (const term of terms.filter((t) => t.category === section.key)) {
        const card = glossaryCard(term, section);
        grid.append(card.node);
        ref.cards.push(card);
        cards.push(card);
      }
      sections.push(ref);
      body.append(ref.node);
    }
  }

  function applyFilter(): void {
    const query = store.state.glossaryQuery.trim().toLowerCase();
    const group = store.state.glossaryGroup;
    let shown = 0;
    for (const section of sections) {
      const inGroup = group === 'all' || section.key === group;
      let visible = 0;
      for (const card of section.cards) {
        const match = inGroup && (!query || card.haystack.includes(query));
        card.node.hidden = !match;
        if (match) {
          shown += 1;
          visible += 1;
        }
      }
      section.node.hidden = visible === 0;
    }
    const total = cards.length;
    count.textContent = query || group !== 'all' ? `${shown} of ${total} terms` : `${total} terms`;
    if (shown === 0) {
      replace(emptyHost, glossaryEmptyNode(store.state.glossaryQuery.trim(), group, (patch) => store.set(patch)));
      emptyHost.hidden = false;
    } else {
      replace(emptyHost);
      emptyHost.hidden = true;
    }
    for (const [key, button] of chipButtons) {
      const on = key === group;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.classList.toggle('on', on);
    }
    if (search.value !== store.state.glossaryQuery) search.value = store.state.glossaryQuery;
  }

  search.addEventListener('input', () => store.set({ glossaryQuery: search.value }));

  /**
   * Open the glossary AT one term — R7's fourth clause, and the disposition every glossary-linked
   * abbreviation depends on (R2 route (b)). `glossaryFocusTerm` used to be written in exactly one
   * place, as `null`; `term()` writes it now and this consumes it. Three things must hold for "one
   * action" to be real: the card must be VISIBLE (a leftover search or category filter would hide
   * the very term that was clicked), SCROLLED to, and FOCUSED. The re-filter is explicit because
   * the drawer's own subscription is registered after the first sync().
   */
  function focusTerm(wanted: string): void {
    const slug = glossarySlug(wanted);
    const card = cards.find((c) => c.slug === slug);
    for (const other of cards) other.node.classList.remove('glscard-linked');
    // An unknown slug is a caller bug, not a user error: land in the search box, not a blank drawer.
    if (!card) {
      if (store.state.glossaryQuery || store.state.glossaryGroup !== 'all') {
        store.set({ glossaryQuery: '', glossaryGroup: 'all' });
      }
      search.focus();
      return;
    }
    if (card.node.hidden) {
      store.set({ glossaryQuery: '', glossaryGroup: 'all' });
      applyFilter();
    }
    card.node.classList.add('glscard-linked');
    card.node.scrollIntoView({ block: 'center' });
    card.node.focus();
  }

  let release: (() => void) | null = null;

  function sync(): void {
    const open = store.state.drawer === 'glossary';
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) {
      release?.();
      release = null;
      return;
    }
    applyFilter();
    // Escape closes and restores focus to whatever raised it — including the `term()` that deep-
    // linked into it (R6d, R7).
    release = trapFocus(panel, () => store.set({ drawer: null, glossaryFocusTerm: null }));
    const wanted = store.state.glossaryFocusTerm;
    if (wanted) focusTerm(wanted);
    else search.focus();
  }

  // Belt and braces: the shell mounts this drawer lazily, so screens bind the term listener too.
  termBindGlossary(store);
  build();
  applyFilter();
  sync();

  const unsubscribe = store.subscribe((_state, changed) => {
    if (changed.has('product')) {
      build();
      applyFilter();
    }
    if (changed.has('glossaryQuery') || changed.has('glossaryGroup')) applyFilter();
    if (changed.has('drawer')) sync();
    else if (changed.has('glossaryFocusTerm') && store.state.glossaryFocusTerm && !panel.hidden) {
      focusTerm(store.state.glossaryFocusTerm);
    }
  });

  return () => {
    unsubscribe();
    release?.();
    panel.remove();
  };
}
