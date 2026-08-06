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
import { createCombobox, type ComboOption } from '../../../primitives/combobox.js';
import { el, emptyState, errorState, loadingState, qs, replace } from '../../../primitives/dom.js';
import { termAnnotate, termBindGlossary, termVocabularyLine } from '../../../primitives/term.js';
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

/**
 * The abbreviations this lens renders, measured rather than guessed: `SPV` eleven times (the
 * "SPV / FUND" row tag, the "SPV fund code" and "% of APPOUR1-SPV" column headers, and eight
 * positions whose symbol or name carries it), `VPM` in the "VPM symbol" header, `qty` in the
 * "Qty held" header, the subtotal line and the derivation, and `NAV` in the ownership prose.
 *
 * Most of those live inside sortable `<th>` elements and selectable rows, where a nested `term()`
 * button would be a control inside a control (R6c). So this lens takes R2's route (a) — one visible
 * expansion, above every use of it — for all of them, and route (b) only where a term can stand
 * alone. Placed immediately after the question, and repeated in the loading and error frames,
 * because a reader who only ever sees the error state has still met the vocabulary.
 */
// `spv` is not here: the shell's own line (DIAGNOSE_VOCABULARY) expands it above the entity
// search, whose option badges read `SPV`, so this line could not be its first use.
const OWNERSHIP_VOCABULARY = ['vpm', 'global_units_global_quantity', 'nav'];

/**
 * Every position the firm-wide universe knows: SPVs, funds and — once a position report has been
 * uploaded — securities. Searched by code, VPM symbol or name.
 */
function ownershipSearchIndex(universe: UniverseFixture): ComboOption[] {
  return (universe.search ?? []).map((x) => ({
    key: x.c,
    label: x.s || x.c,
    detail: x.n,
    kind: x.inv ? 'SPV' : 'FUND',
    haystack: `${x.c} ${x.s} ${x.n}`.toLowerCase(),
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
  let index: ComboOption[] = [];
  let rows: readonly OwnershipRow[] = [];
  let selectedRowId: string | null = null;

  termBindGlossary(store);

  /**
   * The question, then the vocabulary line — in that order, and always both, so no frame of this
   * lens can render an abbreviation the reader has not been given (R2). `termAnnotate` leaves
   * OWNERSHIP_QUESTION byte-identical, which is what R1 and the parity gate both measure.
   */
  const heading = (): (Node | string)[] => [
    el('p', { class: 'screen-question', id: 'ownership-question' }, termAnnotate(OWNERSHIP_QUESTION)),
    termVocabularyLine(OWNERSHIP_VOCABULARY, 'ownership-vocabulary'),
  ];

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
    replace(host, ...heading(), loadingState('the firm-wide ownership universe'));
    universeLoader
      .get()
      .then((universe) => {
        if (!disposed) ready(universe);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        replace(
          host,
          ...heading(),
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
      ...heading(),
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

  /**
   * The position picker, built once so a keystroke never costs the caret. It is the same combobox
   * primitive the Diagnose subject bar and the Pricing filter use — the original had three
   * hand-rolled copies with three different keyboard behaviours.
   */
  function renderSearch(): void {
    replace(
      qs('#ownership-tools', host),
      el('label', {
        class: 'own-search-legend',
        for: 'ownership-search',
        text: 'Find a position',
      }),
      createCombobox({
        id: 'ownership-search',
        placeholder: 'VPM symbol, fund name or code',
        ariaLabel: 'Find a position and trace who owns it',
        // The documented default interaction for this control, per parity-map.json.
        sceneHook: 'step:ownSearch:CRIMAP',
        options: () => index,
        onPick: (option) => select(option.key),
        emptyMessage:
          'No position in the firm-wide universe matches that. Clear the box to see everything, or search the SPV fund code instead.',
        maxResults: OWNERSHIP_SEARCH_LIMIT,
      }),
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
