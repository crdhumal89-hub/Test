/**
 * Ownership — a Diagnose lens over the entity selected once for the whole screen.
 *
 * Question it answers: who ultimately owns this position, and in what proportion?
 *
 * The firm-wide universe is 472 KiB and only this lens and Data quality read it, so it is fetched
 * on first use with a real loading state and a retriable error state (rubric R4). The ownership
 * solve runs once per load and is reused by every re-render.
 */
import { formatCount, formatPercent } from '../../../../domain/money.js';
import type { OwnershipGraph, OwnershipRow } from '../../../../domain/ownership.js';
import {
  displayName,
  effectiveOwners,
  graphFromUniverse,
  immediateHolders,
  isSecurity,
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
import { renderOwnershipRibbon, renderOwnershipTree } from './owner-tree.js';
import { renderOwnershipDerivation, renderOwnershipDerivationPrompt } from './derivation.js';
import {
  ownershipConservationAudit,
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

/** The two sentences that define the columns; both are true regardless of the data. */
const OWNERSHIP_FOOTNOTE_DEFINITIONS =
  'Immediate % = holder qty ÷ total qty of the entity in the row below. ' +
  'Cumulative % chains up the path (shown when you click a row).';

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

  function select(code: string): void {
    selectedRowId = null;
    store.set({ selectedEntity: code, ownerExpanded: new Set<string>(), showAllUltimateOwners: false });
  }

  /* ---------------------------------------------------------------- lazy universe */

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
            `${error instanceof Error ? error.message : String(error)} Nothing on this lens can be answered without it, so no figures are shown rather than partial ones.`,
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

  function renderSearch(): void {
    const tools = qs('#ownership-tools', host);
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

    const results = (): void => {
      const needle = query.trim().toLowerCase();
      if (!needle) {
        close();
        return;
      }
      const hits = index.filter((item) => item.hay.includes(needle)).slice(0, OWNERSHIP_SEARCH_LIMIT);
      if (!hits.length) {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        replace(list);
        replace(
          note,
          emptyState(`No position matches “${query.trim()}”.`, {
            label: 'Clear the search',
            onAct: () => {
              query = '';
              input.value = '';
              close();
              input.focus();
            },
          })
        );
        return;
      }
      replace(note);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      replace(list);
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
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
      event.preventDefault();
      if (event.key === 'Escape') {
        close();
        input.focus();
        return;
      }
      const options = [...list.querySelectorAll<HTMLElement>('.own-search-option')];
      const at = options.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
      if (next < 0) input.focus();
      else options[Math.min(next, options.length - 1)]?.focus();
    });

    replace(
      tools,
      el('div', { class: 'own-search' }, [
        el('label', { class: 'own-search-label-text', for: 'ownership-search', text: 'Find a position' }),
        input,
        list,
        note,
      ]),
      el('span', {
        class: 'status-line',
        id: 'ownership-status',
        text: `${formatCount(index.length)} positions searchable · shared with every Diagnose lens`,
      })
    );
  }

  /* ---------------------------------------------------------------- the answer */

  function renderBody(): void {
    if (!graph || !shares) return;
    const code = store.state.selectedEntity;
    const tree = qs('#ownership-tree', host);
    if (!code) {
      replace(qs('#ownership-identity', host));
      replace(qs('#ownership-ribbon', host));
      replace(qs('#ownership-checks', host));
      replace(
        tree,
        emptyState('No position is selected yet.', {
          label: 'Search for a position',
          onAct: () => qs<HTMLInputElement>('#ownership-search', host).focus(),
        })
      );
      replace(qs('#ownership-inspector', host));
      replace(qs('#ownership-rollup', host));
      replace(qs('#ownership-footnote', host));
      replace(qs('#ownership-conservation', host));
      return;
    }

    const total = totalQuantity(graph, code);
    const owners = immediateHolders(graph, code)
      .slice()
      .sort((a, b) => b[1] - a[1]);
    if (!owners.length) {
      renderIdentity(graph, code, total);
      replace(qs('#ownership-ribbon', host));
      replace(qs('#ownership-checks', host));
      replace(
        tree,
        emptyState(
          `Nothing in the firm-wide universe holds ${vpmSymbol(graph, code)}. It is either an ultimate owner — the top of its own chain — or its holders are outside the mapped universe.`,
          {
            label: 'Search for another position',
            onAct: () => qs<HTMLInputElement>('#ownership-search', host).focus(),
          }
        )
      );
      renderOwnershipDerivationPrompt(qs('#ownership-inspector', host));
      replace(qs('#ownership-rollup', host));
      replace(qs('#ownership-footnote', host));
      replace(qs('#ownership-conservation', host));
      return;
    }

    renderIdentity(graph, code, total);
    renderOwnershipRibbon(qs('#ownership-ribbon', host), graph, code, (holder) => {
      const target = rows.find((r) => !isSubtotal(r) && r.depth === 0 && r.holder === holder);
      if (!target || isSubtotal(target)) return;
      selectedRowId = target.id;
      renderBody();
      const node = host.querySelector<HTMLElement>(`[data-own-row="${target.id}"]`);
      node?.scrollIntoView({ block: 'center' });
      node?.focus();
    });

    const effective = effectiveOwners(graph, shares, code);
    const sumImmediate = owners.reduce((sum, [, units]) => sum + units, 0) / (total || 1);
    const sumUltimate = [...effective.values()].reduce((sum, w) => sum + w, 0);
    const top5 = owners.slice(0, 5).reduce((sum, [, units]) => sum + units, 0) / (total || 1);
    const closesImmediate = Math.abs(sumImmediate - 1) <= 1e-3;
    const closesUltimate = Math.abs(sumUltimate - 1) <= 1e-3;
    renderChecks(code, {
      closesImmediate,
      closesUltimate,
      sumImmediate,
      sumUltimate,
      hint: `${owners.length} immediate owners · ${effective.size} ultimate parents · top 5 = ${formatPercent(top5)}`,
    });

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
      el('span', {
        ...parity(`ownership.${code}.footnote`),
        text: closesUltimate
          ? `${OWNERSHIP_FOOTNOTE_DEFINITIONS} Ultimate owners are solved by fixed-point so cross-holdings/cycles resolve and sum to 100%.`
          : `${OWNERSHIP_FOOTNOTE_DEFINITIONS} Ultimate owners are solved by fixed-point so cross-holdings/cycles resolve, but for this position they sum to ${formatPercent(sumUltimate)} — see the correction below.`,
      })
    );
    renderOwnershipConservationNote(
      qs('#ownership-conservation', host),
      graph,
      ownershipConservationAudit(graph, shares)
    );
  }

  function renderIdentity(g: OwnershipGraph, code: string, total: number): void {
    const security = isSecurity(g, code);
    replace(
      qs('#ownership-identity', host),
      el('span', {
        class: `tag ${security ? 'tag-leaf' : 'tag-vehicle'}`,
        ...parity(`ownership.${code}.kind`),
        text: security ? 'SECURITY' : 'SPV / FUND',
      }),
      el('span', {
        class: 'own-symbol',
        ...parity(`ownership.${code}.symbol`),
        text: vpmSymbol(g, code),
      }),
      el('span', {
        class: 'own-name',
        ...parity(`ownership.${code}.name_and_code`),
        text: `${displayName(g, code)} · code ${code}`,
      }),
      el('span', {
        class: 'own-qty',
        ...parity(`ownership.${code}.total_qty`),
        title: 'Units outstanding (firm-wide) of this entity — the denominator of every Immediate % below.',
        text: `Total qty: ${formatCount(total)}`,
      }),
      el('span', {
        class: 'own-pie',
        ...parity(`ownership.${code}.pie`),
        title: 'The whole entity. Every share below is a share of this.',
        text: '100%',
      })
    );
  }

  function renderChecks(
    code: string,
    state: {
      closesImmediate: boolean;
      closesUltimate: boolean;
      sumImmediate: number;
      sumUltimate: number;
      hint: string;
    }
  ): void {
    const checks = qs('#ownership-checks', host);
    replace(
      checks,
      el('span', {
        class: `chip chip-${state.closesImmediate ? 'ok' : 'bad'}`,
        ...parity(`ownership.${code}.immediate_check`),
        text: state.closesImmediate
          ? '✓ Owners reconcile to 100%'
          : `⚠ Owners sum to ${formatPercent(state.sumImmediate)}`,
      }),
      el('span', {
        class: `chip chip-${state.closesUltimate ? 'ok' : 'bad'}`,
        ...parity(`ownership.${code}.ultimate_check`),
        text: state.closesUltimate
          ? '✓ Ultimate owners = 100%'
          : `⚠ Ultimate owners sum to ${formatPercent(state.sumUltimate)}`,
      }),
      el('span', { class: 'own-hint', ...parity(`ownership.${code}.counts_hint`), text: state.hint })
    );
    if (state.closesImmediate && state.closesUltimate) return;
    checks.append(
      el('div', { class: 'callout callout-bad' }, [
        el('div', { class: 'callout-title', text: 'Ownership does not close for this position' }),
        el('p', {
          text:
            (state.closesImmediate
              ? ''
              : `Its immediate holders hold ${formatPercent(state.sumImmediate)} of its units outstanding. `) +
            (state.closesUltimate
              ? ''
              : `Its ultimate owners account for ${formatPercent(state.sumUltimate)}. `) +
            'Above 100% means units are recorded twice, usually through a circular mapping; below 100% means part of the ownership is not in the mapped universe. Treat every share on this lens as indicative until the mapping is fixed — the Data quality lens lists the offending rows.',
        }),
      ])
    );
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
