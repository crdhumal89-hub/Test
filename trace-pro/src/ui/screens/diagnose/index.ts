/**
 * Diagnose — the shell that hosts four lenses over ONE selected entity.
 *
 * This is the whole reason Alternative B beats keeping seven tabs. In the original, suspecting
 * `SPORTHFC` on the reconciliation screen and then wanting to know how it is wired, who owns it,
 * whether its data is sound, and what a shock does to it cost four tab switches and four separate
 * searches for the same code. Here the entity is selected once, at the top, and the four lenses are
 * views of it. Switching lens never clears the selection — that invariant is what rubric R16 checks.
 */
import type { Store, LensId } from '../../../state/store.js';
import { LENSES } from '../../chrome/shell.js';
import { el, replace, qs, activate } from '../../primitives/dom.js';
import { createCombobox, type ComboOption } from '../../primitives/combobox.js';

export const DIAGNOSE_QUESTION =
  'Why is this entity off — how is it wired, who owns it, is its data sound, and what happens if it moves?';

const LENS_QUESTION: Record<LensId, string> = {
  structure: 'How is this product wired — who owns whom, and where is concentration?',
  ownership: 'Who ultimately owns this position, and in what proportion?',
  'data-quality': 'What is wrong with the source data before I trust any figure above?',
  simulator: 'If this fund’s value or units move, what happens to product NAV, and through which holders?',
};

/** A lens is mounted lazily and told to tear down when the user leaves it. */
export type LensMount = (host: HTMLElement, store: Store) => (() => void) | void;

export interface DiagnoseLenses {
  structure: LensMount;
  ownership: LensMount;
  'data-quality': LensMount;
  simulator: LensMount;
}

export function mountDiagnose(host: HTMLElement, store: Store, lenses: DiagnoseLenses): () => void {
  replace(
    host,
    el('p', { class: 'screen-question', id: 'diagnose-question', text: DIAGNOSE_QUESTION }),
    el('div', { class: 'diagnose-subject', id: 'diagnose-subject' }),
    el('div', { class: 'lens-tabs', id: 'lens-tabs', role: 'tablist', 'aria-label': 'Diagnostic lenses' }),
    el('p', { class: 'lens-question', id: 'lens-question' }),
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

  function renderSubject(): void {
    const subject = qs('#diagnose-subject', host);
    const selected = store.state.selectedEntity;
    const fund = store.repricing.funds.find((f) => f.code === selected);
    replace(
      subject,
      el('span', { class: 'subject-prompt', text: 'Entity under examination' }),
      createCombobox({
        id: 'diagnose-entity',
        placeholder: 'Search any fund, SPV or security…',
        ariaLabel: 'Choose the entity to examine across all four lenses',
        options: entityOptions,
        initialValue: fund ? fund.sym || fund.code : (selected ?? ''),
        emptyMessage:
          'No entity matches that. Clear the box to see every fund and SPV in this product.',
        onPick: (option) => store.set({ selectedEntity: option.key }),
      }),
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
    qs('#lens-question', host).textContent = LENS_QUESTION[lens];
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
  });

  return () => {
    unmountLens?.();
    unsubscribe();
  };
}
