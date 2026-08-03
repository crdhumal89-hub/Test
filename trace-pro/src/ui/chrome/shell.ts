/**
 * The chrome every screen shares: what is being reported on, as of when, which pricing basis is
 * active, the three screens, and one-action access to the glossary and the data sources.
 *
 * The as-of date is here and is never collapsible, so no figure is ever readable while its as-of
 * date is not (rubric R3 — the original allowed exactly that, by folding the masthead away).
 */
import type { Store, ScreenId, LensId, DrawerId } from '../../state/store.js';
import { routeToHash } from '../../state/store.js';
import { el, replace } from '../primitives/dom.js';

export const SCREENS: { id: ScreenId; label: string; question: string }[] = [
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    question: 'Does NAV agree with what the product holds, and where is the difference?',
  },
  {
    id: 'pricing',
    label: 'Pricing',
    question: 'What unit price do I publish today, and what does repricing do to value?',
  },
  {
    id: 'diagnose',
    label: 'Diagnose',
    question: 'Why is this entity off — how is it wired, who owns it, is its data sound, what if it moves?',
  },
];

export const LENSES: { id: LensId; label: string }[] = [
  { id: 'structure', label: 'Structure' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'data-quality', label: 'Data quality' },
  { id: 'simulator', label: 'Simulator' },
];

/** The pricing basis, in plain language, shown wherever any figure depends on it (R12). */
const VIEW_NOTE: Record<'before' | 'after', { tag: string; text: string }> = {
  before: {
    tag: 'Current marks',
    text:
      'Today’s as-booked reality: positions at their current marks and NAV as reported, with ' +
      'today’s pricing differences still open.',
  },
  after: {
    tag: 'Repriced',
    text:
      'The fully repriced view: every fund, SPV and holding valued at its NAV-repriced price and ' +
      'flown bottom-up to the product. The pricing difference reconciles to $0; what remains is ' +
      'the non-position component — cash, fees and receivables, not a pricing break.',
  },
};

export function renderShell(root: HTMLElement, store: Store): void {
  replace(
    root,
    el('a', { class: 'skip-link', href: '#screen', text: 'Skip to the current screen' }),
    el('header', { class: 'masthead', id: 'masthead' }),
    el('nav', { class: 'screen-nav', id: 'screen-nav', 'aria-label': 'Screens' }),
    el('div', { class: 'view-note', id: 'view-note', role: 'status' }),
    el('main', { class: 'screen', id: 'screen', tabindex: '-1' }),
    el('div', { class: 'drawer-host', id: 'drawer-host' })
  );
  renderMasthead(store);
  renderNav(store);
  renderViewNote(store);
}

function renderMasthead(store: Store): void {
  const host = document.getElementById('masthead');
  if (!host) return;
  const { productName, productCode, asof } = store.state;

  const viewToggle = el('div', {
    class: 'view-toggle',
    id: 'view-toggle',
    role: 'group',
    'aria-label': 'Pricing basis',
  });
  for (const view of ['before', 'after'] as const) {
    const on = store.state.view === view;
    const button = el('button', {
      type: 'button',
      class: `seg${on ? ' on' : ''}`,
      'data-view': view,
      'aria-pressed': on ? 'true' : 'false',
      text: view === 'before' ? 'Current marks' : 'Repriced',
    });
    button.addEventListener('click', () => store.set({ view }));
    viewToggle.append(button);
  }

  const glossary = el('button', {
    type: 'button',
    class: 'chrome-btn',
    id: 'open-glossary',
    text: 'Glossary',
    'aria-haspopup': 'dialog',
    title: 'Every term in plain language, with its source and method (G)',
  });
  glossary.addEventListener('click', () => store.set({ drawer: 'glossary', glossaryFocusTerm: null }));

  const sources = el('button', {
    type: 'button',
    class: 'chrome-btn',
    id: 'open-sources',
    text: 'Data sources',
    'aria-haspopup': 'dialog',
    title: 'Which report each figure comes from, and as of when',
  });
  sources.addEventListener('click', () => store.set({ drawer: 'sources' }));

  replace(
    host,
    el('div', { class: 'brand' }, [
      el('span', { class: 'wordmark', text: 'TRACE' }),
      el('span', { class: 'wordmark-pro', text: '-Pro' }),
      el('span', { class: 'tagline', text: 'NAV pricing and look-through' }),
    ]),
    el('div', { class: 'subject' }, [
      el('span', { class: 'subject-label', text: 'Product' }),
      el('b', { class: 'subject-value', id: 'active-product', text: productName }),
      el('span', { class: 'subject-code', text: productCode }),
    ]),
    el('div', { class: 'asof', id: 'asof' }, [
      el('span', { class: 'asof-label', text: 'As of' }),
      el('b', { class: 'asof-value', text: asof }),
    ]),
    el('div', { class: 'chrome-actions' }, [viewToggle, glossary, sources])
  );
}

function renderNav(store: Store): void {
  const host = document.getElementById('screen-nav');
  if (!host) return;
  replace(host);
  const list = el('ul', { class: 'nav-list' });
  for (const screen of SCREENS) {
    const current = store.state.screen === screen.id;
    const link = el('a', {
      class: `nav-link${current ? ' current' : ''}`,
      href: routeToHash(screen.id, store.state.lens),
      'data-screen': screen.id,
      'aria-current': current ? 'page' : null,
      title: screen.question,
    });
    link.append(el('span', { class: 'nav-label', text: screen.label }));
    list.append(el('li', {}, [link]));
  }
  host.append(list);
}

function renderViewNote(store: Store): void {
  const host = document.getElementById('view-note');
  if (!host) return;
  // Hidden where nothing depends on the basis, so the control never appears to do nothing (R12).
  const relevant = store.state.screen !== 'diagnose' || store.state.lens === 'simulator';
  host.hidden = !relevant;
  if (!relevant) {
    replace(host);
    return;
  }
  const note = VIEW_NOTE[store.state.view];
  replace(
    host,
    el('span', { class: 'view-tag', text: note.tag }),
    el('span', { class: 'view-text', text: note.text })
  );
}

/** Keep the chrome in step with state, and expose the keyboard route to the glossary (R7). */
export function wireShell(store: Store): void {
  store.subscribe((_state, changed) => {
    if (changed.has('view') || changed.has('drawer') || changed.has('product')) renderMasthead(store);
    if (changed.has('screen') || changed.has('lens')) renderNav(store);
    if (changed.has('screen') || changed.has('lens') || changed.has('view')) renderViewNote(store);
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const typing =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (typing) return;
    if (event.key.toLowerCase() === 'g') {
      event.preventDefault();
      const next: DrawerId = store.state.drawer === 'glossary' ? null : 'glossary';
      store.set({ drawer: next });
    }
  });
}

export function questionFor(screen: ScreenId): string {
  return SCREENS.find((s) => s.id === screen)?.question ?? '';
}
