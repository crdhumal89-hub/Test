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
import { parity } from '../parity.js';
import { termAnnotate, termBindGlossary } from '../primitives/term.js';
import { isTypingTarget } from '../primitives/keys.js';
import { closedOverlay, focusIntoDrawer, focusTrackOutsideOverlays, restoreFocus } from './focus.js';
import { formatUsd } from '../../domain/money.js';
import { mountGlossaryDrawer } from '../drawers/glossary.js';
import { mountSourcesDrawer } from '../drawers/sources.js';

/**
 * `question` is the sentence the screen renders (R1). `hint` is the nav link's TOOLTIP, and it is a
 * separate string for one reason: an attribute holds text, not elements, so a tooltip cannot take
 * R2's route (b) — it cannot be a glossary-linked term. Route (a) is the only one open to it, so any
 * abbreviation it uses is expanded inside the tooltip itself. Only the Reconciliation question
 * contains one; the other two hints are their questions, unchanged.
 */
export const SCREENS: { id: ScreenId; label: string; question: string; hint: string }[] = [
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    question: 'Does NAV agree with what the product holds, and where is the difference?',
    hint: 'Does NAV (net asset value) agree with what the product holds, and where is the difference?',
  },
  {
    id: 'pricing',
    label: 'Pricing',
    question: 'What unit price do I publish today, and what does repricing do to value?',
    hint: 'What unit price do I publish today, and what does repricing do to value?',
  },
  {
    id: 'diagnose',
    label: 'Diagnose',
    question: 'Why is this entity off — how is it wired, who owns it, is its data sound, what if it moves?',
    hint: 'Why is this entity off — how is it wired, who owns it, is its data sound, what if it moves?',
  },
];

export const LENSES: { id: LensId; label: string; sceneCode: string }[] = [
  { id: 'structure', label: 'Structure', sceneCode: 'str' },
  { id: 'ownership', label: 'Ownership', sceneCode: 'own' },
  { id: 'data-quality', label: 'Data quality', sceneCode: 'iss' },
  { id: 'simulator', label: 'Simulator', sceneCode: 'sim' },
];

/**
 * The frozen parity map names its scenes in the ORIGINAL's vocabulary (`lt`, `rfx`, `str`, …).
 * Rather than teach the harness this rebuild's information architecture, each control publishes the
 * scene it satisfies via `data-parity-scene`, exactly as figures publish `data-parity`. The harness
 * prefers the published control and falls back to the original's selector, which is how one harness
 * drives both targets.
 */
const SCREEN_SCENE: Record<ScreenId, string> = {
  reconciliation: 'lt',
  pricing: 'rfx',
  diagnose: 'str',
};

/**
 * True where at least one figure on screen depends on the pricing basis.
 *
 * R12: "the control is hidden on screens where it changes nothing". Structure, Ownership and Data
 * quality read the look-through tree, the ownership graph and the defect scan, none of which move
 * with the basis — flipping it there left `#screen` byte-identical. So on those three lenses BOTH
 * the note and the control go, not just the note.
 */
function basisApplies(store: Store): boolean {
  return store.state.screen !== 'diagnose' || store.state.lens === 'simulator';
}

/** The pricing basis, in plain language, shown wherever any figure depends on it (R12). */
const VIEW_NOTE: Record<'before' | 'after', { tag: string; text: string }> = {
  before: {
    tag: 'Before pricing',
    text:
      'Current as-booked reality — positions at their current marks (look-through value) and ' +
      "reported NAV, with today's pricing gaps & breaks still shown.",
  },
  after: {
    tag: 'After pricing',
    text:
      'Ideal fully-repriced view — every fund / SPV / holding valued at its repriced unit price, ' +
      'flown bottom-up to the product. The look-through pricing gap is reconciled (≈ $0); the ' +
      'only residual is the non-position (cash / fees) component, shown as non-trade.',
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
    el('footer', { class: 'app-foot', id: 'app-foot' }, [
      el('span', {
        class: 'foot-sources',
        id: 'ubstatus',
        ...parity('chrome.sources_status'),
        text: 'Loaded base dataset. Upload either file to recompute every tab.',
      }),
      // The original asserted here that ownership "sums to 100% ... verified to conserve".
      // It does not: five of 514 entities cannot close, because of the circular holdings the
      // Data quality lens reports as High severity. Shipping the original assurance verbatim
      // would hand a controller a false control statement, so this is a DECLARED label change
      // in docs/rename-map.json rather than a byte-parity match. No figure moves: the numeric
      // token "100" is preserved, which is what the digit guard checks. See docs/issues.md.
      el('span', {
        class: 'foot-assertion',
        ...parity('chrome.footer_assertion'),
        text:
          'Deterministic: effective ultimate ownership is solved by fixed point, which handles ' +
          'cross-holdings and cycles. Ownership conserves to 100% for every entity except five ' +
          'the source data cannot close — see Data quality. No backend. Ties to the companion ' +
          'Excel to the cent.',
      }),
    ]),
    el('div', { class: 'drawer-host', id: 'drawer-host' })
  );
  renderMasthead(store);
  renderNav(store);
  renderViewNote(store);
  renderBasisControl(store);
}

/**
 * Show or hide the basis control in place. Deliberately NOT a masthead re-render: re-rendering the
 * masthead detaches whatever the user was focused on, which is half of why no overlay could restore
 * focus (R6d).
 */
function renderBasisControl(store: Store): void {
  const toggle = document.getElementById('view-toggle');
  if (!toggle) return;
  toggle.hidden = !basisApplies(store);
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
      'data-parity-scene': `view:${view}`,
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
    'data-parity-scene': 'screen:gls',
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
      // The FIRST `NAV` a reader meets on every one of the six routes, and it is chrome, so it
      // precedes every screen's vocabulary line — no screen could claim first-use expansion while
      // this one stayed bare (R2). `termAnnotate` links it without adding or removing a character,
      // so the tagline still reads "NAV pricing and look-through" byte for byte.
      el('span', { class: 'tagline' }, termAnnotate('NAV pricing and look-through')),
    ]),
    el('div', { class: 'subject' }, [
      el('span', { class: 'subject-label', text: 'Product' }),
      el('b', {
        class: 'subject-value',
        id: 'active-product',
        ...parity('chrome.active_product'),
        text: productName,
      }),
      el('span', { class: 'subject-code', text: productCode }),
    ]),
    el('div', { class: 'asof', id: 'asof' }, [
      el('span', { class: 'asof-label', text: 'As of' }),
      el('b', { class: 'asof-value', ...parity('chrome.asof'), text: asof }),
    ]),
    el('div', { class: 'chrome-actions' }, [viewToggle, glossary, sources])
  );
  renderBasisControl(store);
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
      'data-parity-scene': `screen:${SCREEN_SCENE[screen.id]}`,
      'aria-current': current ? 'page' : null,
      title: screen.hint,
    });
    link.append(el('span', { class: 'nav-label', text: screen.label }));
    list.append(el('li', {}, [link]));
  }
  host.append(list);

  // Direct links to each diagnostic lens. Visually folded away because the three screens are the
  // primary structure, but focusable and operable — a keyboard or screen-reader user gets one-hop
  // access to a lens instead of two, and they double as the harness's scene hooks.
  const direct = el('ul', { class: 'nav-direct', 'aria-label': 'Jump directly to a diagnostic lens' });
  for (const lens of LENSES) {
    const link = el('a', {
      class: 'nav-direct-link',
      href: `#/diagnose/${lens.id}`,
      'data-parity-scene': `screen:${lens.sceneCode}`,
      text: `Jump to ${lens.label}`,
    });
    direct.append(el('li', {}, [link]));
  }
  host.append(direct);
}

function renderViewNote(store: Store): void {
  const host = document.getElementById('view-note');
  if (!host) return;
  // Hidden where nothing depends on the basis, so the control never appears to do nothing (R12).
  // `[hidden]` now actually hides: app.css used to give `.view-note` `display: flex`, which beat the
  // UA rule and left a 19px empty band here on all three lenses.
  const relevant = basisApplies(store);
  host.hidden = !relevant;
  if (!relevant) {
    replace(host);
    return;
  }
  const note = VIEW_NOTE[store.state.view];
  host.setAttribute(
    'data-parity',
    store.state.view === 'after' ? 'reconciliation.after.pricing_view_note' : 'chrome.pricing_view_note'
  );
  // The two headline figures ride along, as they did in the original: a controller reading the
  // basis should see what that basis costs without moving.
  const pricingDifference = store.state.view === 'after' ? 0 : store.repricing.dPricing;
  /*
   * `termAnnotate` on both: this band is chrome, so its `NAV` and its `SPV` are the FIRST a reader
   * meets on every basis-dependent screen — earlier than any screen's own vocabulary line, which is
   * why leaving them bare could not be discharged further down (R2). It adds and removes no
   * characters, so `chrome.pricing_view_note` still reads byte for byte what the baseline pins.
   */
  replace(
    host,
    el('span', { class: 'view-tag', text: note.tag }),
    el('span', { class: 'view-text' }, termAnnotate(note.text)),
    el(
      'span',
      { class: 'view-figures' },
      termAnnotate(`Pricing difference ${formatUsd(pricingDifference)} · NAV ${formatUsd(store.repricing.N)}`)
    )
  );
}

/** Mount or tear down whichever drawer state asks for. Only one is open at a time. */
function renderDrawer(store: Store): void {
  const host = document.getElementById('drawer-host');
  if (!host) return;
  replace(host);
  const which = store.state.drawer;
  if (!which) return;
  if (which === 'glossary') mountGlossaryDrawer(host, store);
  else mountSourcesDrawer(host, store);
  focusIntoDrawer(host);
}

export function wireShell(store: Store): void {
  // The masthead tagline carries a glossary-linked `NAV`, and the masthead outlives every screen,
  // so the binding that makes a term open the drawer belongs here as well as on each screen (R7).
  termBindGlossary(store);
  renderDrawer(store);
  focusTrackOutsideOverlays();
  store.subscribe((state, changed) => {
    if (changed.has('drawer')) renderDrawer(store);
    // Re-rendering the masthead throws away the focus on the segment the user just pressed, so the
    // same restore runs here: R6b forbids focus being lost, not just being invisible.
    if (changed.has('view') || changed.has('product')) {
      renderMasthead(store);
      restoreFocus();
    }
    if (changed.has('screen') || changed.has('lens')) renderNav(store);
    if (changed.has('screen') || changed.has('lens') || changed.has('view')) renderViewNote(store);
    if (changed.has('screen') || changed.has('lens')) renderBasisControl(store);
    if (closedOverlay(state, changed)) restoreFocus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    // Stands aside for text entry only, NOT for every INPUT: a file input consumes no characters,
    // and the glossary must stay one action away from the upload slots (R7). See primitives/keys.ts.
    if (isTypingTarget(event.target)) return;
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
