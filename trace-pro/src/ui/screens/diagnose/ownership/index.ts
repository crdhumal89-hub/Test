/**
 * Ownership — a Diagnose lens over the entity selected once for the whole screen.
 *
 * Question it answers: who ultimately owns this position, and in what proportion?
 *
 * The firm-wide universe is 472 KiB and only this lens and Data quality read it, so it is fetched
 * on first use with a real loading state and a retriable error state (rubric R4). The ownership
 * solve runs once per load and is reused by every re-render.
 */
import { formatCount } from '../../../../domain/money.js';
import type { OwnershipGraph, OwnershipRow } from '../../../../domain/ownership.js';
import {
  graphFromUniverse,
  immediateHolders,
  isSubtotal,
  solveEffectiveShares,
  totalQuantity,
  vpmSymbol,
  walkOwnersUpward,
} from '../../../../domain/ownership.js';
import type { UniverseFixture } from '../../../../domain/types.js';
import type { Store } from '../../../../state/store.js';
import { activate, el, emptyState, errorState, loadingState, qs, replace } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';
import { renderOwnershipIdentity, renderOwnershipRibbon, renderOwnershipTree } from './owner-tree.js';
import { renderOwnershipDerivation, renderOwnershipDerivationPrompt } from './derivation.js';
import {
  ownershipConservationAudit,
  ownershipFootnoteText,
  ownershipIntegrityOf,
  renderOwnershipChecks,
  renderOwnershipConservationNote,
  renderOwnershipUltimateOwners,
  type OwnershipShares,
} from './ultimate-owners.js';

export const OWNERSHIP_QUESTION = 'Who ultimately owns this position, and in what proportion?';

/** What `createUniverseLoader()` hands back. Named locally so no module owns two of these. */
export interface OwnershipUniverseLoader {
  get(): Promise<UniverseFixture>;
  peek(): UniverseFixture | null;
}

/** How many search results a keystroke may put on screen. */
const OWNERSHIP_SEARCH_LIMIT = 40;

interface OwnershipSearchItem {
  code: string;
  label: string;
  sub: string;
  kind: string;
  hay: string;
}

function ownershipSearchIndex(universe: UniverseFixture): OwnershipSearchItem[] {
  return (universe.search ?? []).map((x) => ({
    code: x.c,
    label: x.s || x.c,
    sub: x.n,
    kind: x.inv ? 'SPV' : 'FUND',
    hay: `${x.c} ${x.s} ${x.n}`.toLowerCase(),
  }));
}

export function mountOwnershipLens(
  host: HTMLElement,
  store: Store,
  universeLoader: OwnershipUniverseLoader
): () => void {
  let disposed = false;
  let graph: OwnershipGraph | null = null;
  let shares: OwnershipShares | null = null;
  let index: OwnershipSearchItem[] = [];
  let rows: readonly OwnershipRow[] = [];
  let selectedRowId: string | null = null;
  let query = '';

  const question = (): HTMLElement =>
    el('p', { class: 'screen-question', id: 'ownership-question', text: OWNERSHIP_QUESTION });

  const focusSearch = (): void => qs<HTMLInputElement>('#ownership-search', host).focus();

  function select(code: string): void {
    selectedRowId = null;
    store.set({ selectedEntity: code, ownerExpanded: new Set<string>(), showAllUltimateOwners: false });
  }

  /* ---------------------------------------------------------------- the lazy 472 KiB */

  function begin(): void {
    const cached = universeLoader.peek();
    if (cached) {
      ready(cached);
      return;
    }
    replace(host, question(), loadingState('the firm-wide ownership universe'));
    universeLoader
      .get()
      .then((universe) => {
        if (!disposed) ready(universe);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        replace(
          host,
          question(),
          errorState(
            'The firm-wide ownership universe could not be loaded.',
            `${error instanceof Error ? error.message : String(error)} No ownership figure can be derived without it, so none are shown rather than partial ones.`,
            { label: 'Try again', onAct: begin }
          )
        );
      });
  }

  function ready(universe: UniverseFixture): void {
    store.universe = universe;
    graph = graphFromUniverse(universe);
    shares = solveEffectiveShares(graph);
    index = ownershipSearchIndex(universe);
    scaffold();
    renderBody();
  }

  /* ---------------------------------------------------------------- static frame */

  function scaffold(): void {
    replace(
      host,
      question(),
      el('div', { class: 'toolbar own-toolbar', id: 'ownership-tools' }),
      el('div', { class: 'own-identity', id: 'ownership-identity' }),
      el('div', { class: 'own-ribbon-host', id: 'ownership-ribbon' }),
      el('div', { class: 'own-checks', id: 'ownership-checks' }),
      el('div', { class: 'own-layout' }, [
        el('div', { class: 'table-scroll own-tree-host', id: 'ownership-tree' }),
        el('aside', { class: 'own-side', 'aria-label': 'Derivation and ultimate owners' }, [
          el('div', { class: 'own-inspector', id: 'ownership-inspector' }),
          el('div', { class: 'own-rollup-host', id: 'ownership-rollup' }),
        ]),
      ]),
      el('p', { class: 'note own-footnote', id: 'ownership-footnote' }),
      el('div', { id: 'ownership-conservation' })
    );
    renderSearch();
  }

  /** Rendered once, so a keystroke never costs the caret. */
  function renderSearch(): void {
    const input = el('input', {
      type: 'search',
      id: 'ownership-search',
      class: 'own-search-input',
      role: 'combobox',
      autocomplete: 'off',
      'aria-autocomplete': 'list',
      'aria-controls': 'ownership-search-list',
      'aria-expanded': 'false',
      placeholder: 'VPM symbol, fund name or code',
    });
    const list = el('ul', {
      class: 'own-search-list',
      id: 'ownership-search-list',
      role: 'listbox',
      'aria-label': 'Matching positions',
      hidden: 'hidden',
    });
    const note = el('div', { id: 'ownership-search-note' });

    const close = (): void => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      replace(list);
      replace(note);
    };
    const clear = (): void => {
      query = '';
      input.value = '';
      close();
      input.focus();
    };

    const results = (): void => {
      const needle = query.trim().toLowerCase();
      if (!needle) {
        close();
        return;
      }
      const hits = index.filter((item) => item.hay.includes(needle)).slice(0, OWNERSHIP_SEARCH_LIMIT);
      if (!hits.length) {
        close();
        replace(
          note,
          emptyState(`No position matches “${query.trim()}”.`, { label: 'Clear the search', onAct: clear })
        );
        return;
      }
      replace(note);
      replace(list);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      for (const item of hits) {
        const option = el('li', { class: 'own-search-option', role: 'option', 'data-code': item.code }, [
          el('span', { class: 'own-search-label mono', text: item.label }),
          el('span', { class: 'own-search-sub', text: item.sub }),
          el('span', { class: 'tag tag-vehicle', text: item.kind }),
        ]);
        activate(
          option,
          () => {
            query = '';
            input.value = '';
            close();
            select(item.code);
          },
          { label: `${item.label} — ${item.sub}` }
        );
        list.append(option);
      }
    };

    input.addEventListener('input', () => {
      query = input.value;
      results();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && !list.hidden) {
        event.preventDefault();
        list.querySelector<HTMLElement>('.own-search-option')?.focus();
      } else if (event.key === 'Escape') {
        close();
      }
    });
    list.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Escape') {
        close();
        input.focus();
        return;
      }
      const options = [...list.querySelectorAll<HTMLElement>('.own-search-option')];
      const next = options.indexOf(document.activeElement as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) input.focus();
      else options[Math.min(next, options.length - 1)]?.focus();
    });

    replace(
      qs('#ownership-tools', host),
      el('div', { class: 'own-search' }, [
        el('label', { class: 'own-search-legend', for: 'ownership-search', text: 'Find a position' }),
        input,
        list,
        note,
      ]),
      el('span', {
        class: 'status-line',
        id: 'ownership-status',
        text: `${formatCount(index.length)} positions searchable · the selection is shared with every Diagnose lens`,
      })
    );
  }

  /** Blank every panel, then let the caller fill only the ones that have an answer. */
  function clearPanels(): void {
    const panels = ['identity', 'ribbon', 'checks', 'inspector', 'rollup', 'footnote', 'conservation'];
    for (const panel of panels) replace(qs(`#ownership-${panel}`, host));
  }

  /* ---------------------------------------------------------------- the answer */

  function renderBody(): void {
    if (!graph || !shares) return;
    const code = store.state.selectedEntity;
    const tree = qs('#ownership-tree', host);
    if (!code) {
      clearPanels();
      replace(
        tree,
        emptyState('No position is selected yet.', {
          label: 'Search for a position',
          onAct: focusSearch,
        })
      );
      return;
    }

    const total = totalQuantity(graph, code);
    if (!immediateHolders(graph, code).length) {
      clearPanels();
      renderOwnershipIdentity(qs('#ownership-identity', host), graph, code, total);
      renderOwnershipDerivationPrompt(qs('#ownership-inspector', host));
      replace(
        tree,
        emptyState(
          `Nothing in the firm-wide universe holds ${vpmSymbol(graph, code)}. It is either an ultimate owner — the top of its own chain — or its holders sit outside the mapped universe.`,
          { label: 'Search for another position', onAct: focusSearch }
        )
      );
      return;
    }

    renderOwnershipIdentity(qs('#ownership-identity', host), graph, code, total);
    renderOwnershipRibbon(qs('#ownership-ribbon', host), graph, code, revealOwner);

    const integrity = ownershipIntegrityOf(graph, shares, code);
    renderOwnershipChecks(qs('#ownership-checks', host), code, integrity);

    rows = walkOwnersUpward(graph, code, store.state.ownerExpanded);
    renderOwnershipTree(
      tree,
      { graph, root: code, rows, expanded: store.state.ownerExpanded, selectedRowId },
      {
        onToggleBranch: (rowId) => {
          const next = new Set(store.state.ownerExpanded);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          store.set({ ownerExpanded: next });
        },
        onSelectRow: (rowId) => {
          selectedRowId = rowId;
          renderBody();
        },
      }
    );

    const chosen = rows.find((r) => !isSubtotal(r) && r.id === selectedRowId);
    if (chosen && !isSubtotal(chosen)) {
      renderOwnershipDerivation(qs('#ownership-inspector', host), {
        graph,
        root: code,
        row: chosen,
        onFollow: select,
      });
    } else {
      renderOwnershipDerivationPrompt(qs('#ownership-inspector', host));
    }

    renderOwnershipUltimateOwners(
      qs('#ownership-rollup', host),
      {
        graph,
        shares,
        root: code,
        showAll: store.state.showAllUltimateOwners,
        onToggleShowAll: (next) => store.set({ showAllUltimateOwners: next }),
        onFollow: select,
      },
      total
    );

    replace(
      qs('#ownership-footnote', host),
      el('span', { ...parity(`ownership.${code}.footnote`), text: ownershipFootnoteText(integrity) })
    );
    renderOwnershipConservationNote(
      qs('#ownership-conservation', host),
      graph,
      ownershipConservationAudit(graph, shares)
    );
  }

  /** A ribbon segment was operated: select that owner's row and bring it into view. */
  function revealOwner(holder: string): void {
    const target = rows.find((r) => !isSubtotal(r) && r.depth === 0 && r.holder === holder);
    if (!target || isSubtotal(target)) return;
    selectedRowId = target.id;
    renderBody();
    const node = host.querySelector<HTMLElement>(`[data-own-row="${target.id}"]`);
    node?.scrollIntoView({ block: 'center' });
    node?.focus();
  }

  const unsubscribe = store.subscribe((_state, changed) => {
    if (disposed) return;
    if (changed.has('selectedEntity')) selectedRowId = null;
    if (
      changed.has('selectedEntity') ||
      changed.has('ownerExpanded') ||
      changed.has('showAllUltimateOwners')
    ) {
      renderBody();
    }
  });

  begin();

  return () => {
    disposed = true;
    unsubscribe();
  };
}
