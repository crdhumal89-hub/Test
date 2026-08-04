/**
 * Diagnose — the shell that hosts four lenses over ONE selected entity.
 *
 * This is the whole reason Alternative B beats keeping seven tabs. In the original, suspecting
 * `SPORTHFC` on the reconciliation screen and then wanting to know how it is wired, who owns it,
 * whether its data is sound, and what a shock does to it cost four tab switches and four separate
 * searches for the same code. Here the entity is selected once, at the top, and the four lenses are
 * views of it. Switching lens never clears the selection — that invariant is what rubric R16 checks.
 */
import type { Store } from '../../../state/store.js';
import { LENSES } from '../../chrome/shell.js';
import { el, replace, qs, activate } from '../../primitives/dom.js';
import { createCombobox, type ComboNotice, type ComboOption } from '../../primitives/combobox.js';

export const DIAGNOSE_QUESTION =
  'Why is this entity off — how is it wired, who owns it, is its data sound, and what happens if it moves?';

/** A lens is mounted lazily and told to tear down when the user leaves it. */
export type LensMount = (host: HTMLElement, store: Store) => (() => void) | void;

/** What the shell needs of the shared universe loader: whether it is here, and how to ask again. */
export interface DiagnoseUniverseAccess {
  get(): Promise<unknown>;
}

export interface DiagnoseLenses {
  structure: LensMount;
  ownership: LensMount;
  'data-quality': LensMount;
  simulator: LensMount;
}

export function mountDiagnose(
  host: HTMLElement,
  store: Store,
  universeAccess: DiagnoseUniverseAccess,
  lenses: DiagnoseLenses
): () => void {
  replace(
    host,
    el('p', { class: 'screen-question', id: 'diagnose-question', text: DIAGNOSE_QUESTION }),
    el('div', { class: 'diagnose-subject', id: 'diagnose-subject' }),
    el('div', { class: 'lens-tabs', id: 'lens-tabs', role: 'tablist', 'aria-label': 'Diagnostic lenses' }),
    // No question line here: each lens renders its own as the first text in its content region,
    // which is where R1 requires it. Two copies of the same sentence is worse than one.
    el('div', { class: 'lens-body', id: 'lens-body', role: 'tabpanel' })
  );

  function entityOptions(): ComboOption[] {
    // Every fund and SPV in the product's own structure, plus — once the firm-wide universe has
    // been loaded by a lens that needs it — everything else the universe knows about.
    const options: ComboOption[] = store.repricing.funds.map((fund) => ({
      key: fund.code,
      label: fund.sym || fund.code,
      detail: fund.name,
      kind: fund.terminal ? 'FUND' : 'SPV',
      haystack: `${fund.code} ${fund.sym} ${fund.name}`.toLowerCase(),
    }));
    const universe = store.universe;
    if (universe) {
      const known = new Set(options.map((o) => o.key));
      for (const entry of universe.search) {
        if (known.has(entry.c)) continue;
        options.push({
          key: entry.c,
          label: entry.s || entry.c,
          detail: entry.n,
          kind: entry.inv ? 'SPV' : 'FUND',
          haystack: `${entry.c} ${entry.s} ${entry.n}`.toLowerCase(),
        });
      }
    }
    return options;
  }

  /**
   * What the result list cannot show yet, and why (rubric R4). The list is over two sources: this
   * product's own funds, which are always in hand, and the firm-wide universe, which is 472 KiB and
   * arrives only when a lens that needs it asks. Saying nothing while the second is missing is how a
   * search for a fund the firm holds elsewhere reads as "no such fund".
   */
  function searchNotice(): ComboNotice | null {
    const status = store.state.universeStatus;
    const own = store.repricing.funds.length;
    if (status === 'loading') {
      return {
        kind: 'loading',
        text: `Still loading the firm-wide list of positions — for now this searches only the ${own} funds and SPVs in this product.`,
      };
    }
    if (status === 'failed') {
      return {
        kind: 'error',
        text: `The firm-wide list of positions could not be loaded, so this searches only the ${own} funds and SPVs in this product. Anything held elsewhere in the firm is missing from these results.`,
      };
    }
    return null;
  }

  /** The recovery action for that error state, which is a real control outside the popup (R6). */
  function searchRecovery(): HTMLElement | null {
    if (store.state.universeStatus !== 'failed') return null;
    const button = el('button', {
      type: 'button',
      class: 'btn',
      id: 'diagnose-entity-retry',
      text: 'Load the firm-wide list again',
    });
    button.addEventListener('click', () => {
      // On success the lens below is re-mounted as well. Recovering the search list while the lens
      // that needed the same file still showed "could not be loaded" would leave two answers on one
      // screen, one of them stale.
      void universeAccess.get().then(
        () => renderLens(),
        () => undefined
      );
    });
    return button;
  }

  function renderSubject(): void {
    const subject = qs('#diagnose-subject', host);
    const selected = store.state.selectedEntity;
    const fund = store.repricing.funds.find((f) => f.code === selected);
    replace(
      subject,
      el('span', { class: 'subject-prompt', text: 'Entity under examination' }),
      createCombobox({
        notice: searchNotice,
        id: 'diagnose-entity',
        placeholder: 'Search any fund, SPV or security…',
        ariaLabel: 'Choose the entity to examine across all four lenses',
        options: entityOptions,
        initialValue: fund ? fund.sym || fund.code : (selected ?? ''),
        emptyMessage:
          'No entity matches that. Clear the box to see every fund and SPV in this product.',
        onPick: (option) => store.set({ selectedEntity: option.key }),
      }),
      searchRecovery(),
      el('span', {
        class: 'subject-note',
        text: 'Selected once — all four lenses below follow it.',
      })
    );
  }

  function renderTabs(): void {
    const tabs = qs('#lens-tabs', host);
    replace(tabs);
    for (const lens of LENSES) {
      const current = store.state.lens === lens.id;
      const tab = el('button', {
        type: 'button',
        class: `lens-tab${current ? ' current' : ''}`,
        role: 'tab',
        'data-lens': lens.id,
        'aria-selected': current ? 'true' : 'false',
        text: lens.label,
      });
      tab.addEventListener('click', () => {
        store.set({ lens: lens.id });
        location.hash = `#/diagnose/${lens.id}`;
      });
      tabs.append(tab);
    }
    // Left/Right arrows move between lenses, which is what a tablist is expected to do.
    activate(tabs, () => undefined, {});
    tabs.removeAttribute('tabindex');
    tabs.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      event.preventDefault();
      const index = LENSES.findIndex((l) => l.id === store.state.lens);
      const next = LENSES[(index + (key === 'ArrowRight' ? 1 : LENSES.length - 1)) % LENSES.length];
      if (!next) return;
      store.set({ lens: next.id });
      location.hash = `#/diagnose/${next.id}`;
      qs<HTMLElement>(`.lens-tab[data-lens="${next.id}"]`, host).focus();
    });
  }

  let unmountLens: (() => void) | null = null;

  function renderLens(): void {
    unmountLens?.();
    unmountLens = null;
    const body = qs('#lens-body', host);
    const lens = store.state.lens;
    body.setAttribute('aria-label', LENSES.find((l) => l.id === lens)?.label ?? lens);
    replace(body);
    const teardown = lenses[lens](body, store);
    if (typeof teardown === 'function') unmountLens = teardown;
  }

  renderSubject();
  renderTabs();
  renderLens();

  const unsubscribe = store.subscribe((_state, changed) => {
    if (changed.has('lens')) {
      renderTabs();
      renderLens();
    }
    // A new entity does NOT remount the lens — the lens subscribes and updates in place, so the
    // selection survives and nothing flashes.
    if (changed.has('product')) renderSubject();
    // The search list's own state moves with the shared fetch: a notice that appeared while the
    // universe was loading has to come down when it lands, and the retry has to appear when it fails.
    if (changed.has('universeStatus')) renderSubject();
  });

  return () => {
    unmountLens?.();
    unsubscribe();
  };
}
