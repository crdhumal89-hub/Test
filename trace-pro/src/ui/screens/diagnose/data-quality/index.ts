/**
 * Data quality — a Diagnose lens over the entity selected once for the whole screen.
 *
 * Question it answers: what is wrong with the source data before I trust any figure above?
 *
 * This is the honest screen of the original and it needed the least work, so the changes are
 * confined to reach: the scope picker and the accordions are real controls, the 200-row cap states
 * itself, and an empty scope offers a way back instead of five silent zeros.
 */
import { formatCount } from '../../../../domain/money.js';
import type { IssueBucket, UniverseFixture } from '../../../../domain/types.js';
import type { Store } from '../../../../state/store.js';
import { createCombobox, type ComboOption } from '../../../primitives/combobox.js';
import { el, emptyState, errorState, loadingState, qs, replace } from '../../../primitives/dom.js';
import { termAnnotate, termBindGlossary, termVocabularyLine } from '../../../primitives/term.js';
import { parity } from '../../../parity.js';
import { dataQualityDownloadCsv, renderDataQualityBuckets } from './buckets.js';

export const DATA_QUALITY_QUESTION =
  'What is wrong with the source data before I trust any figure above?';

/** What `createUniverseLoader()` hands back. Named locally so no module owns two of these. */
export interface DataQualityUniverseLoader {
  get(): Promise<UniverseFixture>;
  peek(): UniverseFixture | null;
}

const DATA_QUALITY_SCOPE_LIMIT = 40;
const DATA_QUALITY_ALL = 'All fund entities';

/**
 * The abbreviations this lens renders: `SPV` in the "Missing / dangling SPV code" bucket title and
 * in two bucket explanations, `VPM` in the "Unmapped identifiers (missing VPM symbol / name)" title
 * and its explanation, `NAV` in the "no NAV" break bucket. The bucket titles are accordion HEADERS —
 * real controls — so a `term()` inside one would be a control inside a control (R6c); this lens
 * therefore takes R2's route (a), one visible expansion placed above every use of them.
 */
// `spv` moved to the shell's own line, which precedes the entity search that already uses it.
const DATA_QUALITY_VOCABULARY = ['vpm', 'nav'];

/** Every scope the issue log can take: the whole universe, or one fund entity's reachable world. */
function dataQualityScopeIndex(universe: UniverseFixture): ComboOption[] {
  return [
    {
      key: '',
      label: DATA_QUALITY_ALL,
      detail: 'no filter — the whole scanned universe',
      kind: 'ALL',
      haystack: 'all fund entities',
    },
    ...(universe.entities ?? []).map((entity) => ({
      key: entity.e,
      label: entity.e,
      detail: `${entity.n} funds in world`,
      kind: 'WORLD',
      haystack: entity.e.toLowerCase(),
    })),
  ];
}

/** Buckets narrowed to one fund entity's reachable world, with counts recomputed from the rows. */
function dataQualityScopedBuckets(
  universe: UniverseFixture,
  reach: ReadonlySet<string> | null
): IssueBucket[] {
  if (!reach) return (universe.issues ?? []).map((bucket) => ({ ...bucket }));
  return (universe.issues ?? []).map((bucket) => {
    const rows = bucket.rows.filter((row) => reach.has(row.code));
    return { ...bucket, rows, count: rows.length };
  });
}

export function mountDataQualityLens(
  host: HTMLElement,
  store: Store,
  universeLoader: DataQualityUniverseLoader
): () => void {
  let disposed = false;
  let universe: UniverseFixture | null = null;
  let scopes: ComboOption[] = [];
  const open = new Set<string>();

  termBindGlossary(store);

  /** Question first, then the vocabulary line — in every frame, including loading and error. */
  const heading = (): (Node | string)[] => [
    el('p', { class: 'screen-question', id: 'data-quality-question' }, termAnnotate(DATA_QUALITY_QUESTION)),
    termVocabularyLine(DATA_QUALITY_VOCABULARY, 'data-quality-vocabulary'),
  ];

  const clearScope = (): void => store.set({ issueScope: null, issueScopeLabel: DATA_QUALITY_ALL });

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
      .then((loaded) => {
        if (!disposed) ready(loaded);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        replace(
          host,
          ...heading(),
          errorState(
            'The firm-wide ownership universe could not be loaded.',
            `${error instanceof Error ? error.message : String(error)} The issue log is scanned from that file, so an empty list here would be a lie — nothing is shown instead.`,
            { label: 'Try again', onAct: begin }
          )
        );
      });
  }

  function ready(loaded: UniverseFixture): void {
    universe = loaded;
    store.universe = loaded;
    scopes = dataQualityScopeIndex(loaded);
    replace(
      host,
      ...heading(),
      el('div', { class: 'toolbar dq-toolbar', id: 'data-quality-tools' }),
      el('div', { class: 'dq-kpi', id: 'data-quality-kpi' }),
      el('div', { class: 'dq-buckets', id: 'data-quality-buckets' })
    );
    renderTools();
    renderBody();
  }

  /* ---------------------------------------------------------------- scope picker */

  /**
   * Scope picker and downloads, built once so a keystroke never costs the caret. Same combobox
   * primitive as every other search in the app.
   */
  function renderTools(): void {
    const downloadAll = el('button', {
      type: 'button',
      class: 'btn',
      id: 'data-quality-download-all',
      text: '\u2b07 Download all issues (CSV)',
    });
    downloadAll.addEventListener('click', () => {
      if (universe) dataQualityDownloadCsv(store.state.issueScope ?? 'all', currentView());
    });

    replace(
      qs('#data-quality-tools', host),
      el('label', { class: 'dq-scope-legend', for: 'data-quality-scope', text: 'Scope' }),
      createCombobox({
        id: 'data-quality-scope',
        // The documented default interaction for this control, per parity-map.json.
        sceneHook: 'step:issScope:Apollo Sports Capital',
        placeholder: 'All fund entities, or one entity\u2019s reachable world',
        ariaLabel: 'Scope the issue log to one fund entity\u2019s reachable world',
        options: () => scopes,
        onPick: (option) =>
          option.key
            ? store.set({ issueScope: option.key, issueScopeLabel: option.label })
            : clearScope(),
        emptyMessage:
          'No fund entity matches that. Clear the box to see all of them, or pick \u201cAll fund entities\u201d to scan the whole universe.',
        initialValue: store.state.issueScopeLabel,
        maxResults: DATA_QUALITY_SCOPE_LIMIT,
      }),
      downloadAll,
      el('span', { class: 'dq-badge-wrap' }, [
        el('span', { class: 'dq-badge-label', text: 'Issues found' }),
        el('span', { class: 'dq-badge', id: 'data-quality-badge' }),
      ])
    );
  }

  /* ---------------------------------------------------------------- the answer */

  function reachSet(): Set<string> | null {
    const scope = store.state.issueScope;
    if (!scope || !universe) return null;
    return new Set(universe.entReach[scope] ?? []);
  }

  function currentView(): IssueBucket[] {
    return universe ? dataQualityScopedBuckets(universe, reachSet()) : [];
  }

  function renderBody(): void {
    if (!universe) return;
    const reach = reachSet();
    const scoped = reach != null;
    const view = currentView();
    const total = view.reduce((sum, bucket) => sum + bucket.count, 0);
    const bySeverity = (severity: string): number =>
      view.filter((b) => b.sev === severity).reduce((sum, b) => sum + b.count, 0);
    const scopeLabel = `${store.state.issueScopeLabel}${scoped ? ` · ${reach.size} funds in world` : ' · scanned universe'}`;

    const badge = qs('#data-quality-badge', host);
    badge.textContent = String(total);
    // Only the unscoped count answers to the frozen badge key; a scoped count is a different figure.
    if (scoped) badge.removeAttribute('data-parity');
    else badge.setAttribute('data-parity', 'data_quality.tab_badge');

    replace(
      qs('#data-quality-kpi', host),
      dataQualityCard('High severity', bySeverity('High'), scoped ? 'data_quality.scoped.high' : 'data_quality.high_count', 'dq-high', 'Fix before publishing: these can move a figure or dead-end a look-through.'),
      dataQualityCard('Medium', bySeverity('Medium'), scoped ? null : 'data_quality.medium_count', 'dq-medium', 'Review: the engine works around these, but the mapping is not what it claims.'),
      dataQualityCard('Low', bySeverity('Low'), scoped ? null : 'data_quality.low_count', 'dq-low', 'Reference-data gaps: nothing computes wrongly, but the entity cannot be identified cleanly.'),
      dataQualityCard(
        'Total issues',
        total,
        scoped ? 'data_quality.scoped.total' : 'data_quality.total_count',
        'dq-total',
        'Every issue in the buckets below, for the scope named underneath.',
        { label: scopeLabel, key: scoped ? 'data_quality.scoped.label' : 'data_quality.scope_label' }
      )
    );

    const buckets = qs('#data-quality-buckets', host);
    if (!total) {
      replace(
        buckets,
        emptyState(
          `No data-quality issue touches ${store.state.issueScopeLabel}. Its ${reach ? reach.size : 0} reachable funds are clean across all ${view.length} checks.`,
          { label: 'Scan the whole universe instead', onAct: clearScope }
        )
      );
      return;
    }
    renderDataQualityBuckets(buckets, {
      buckets: view,
      open,
      keyed: !scoped,
      scopeLabel: store.state.issueScopeLabel,
      onToggle: (name) => {
        if (open.has(name)) open.delete(name);
        else open.add(name);
        renderBody();
      },
    });
  }

  const unsubscribe = store.subscribe((_state, changed) => {
    if (disposed) return;
    if (changed.has('issueScope') || changed.has('issueScopeLabel')) renderBody();
  });

  begin();

  return () => {
    disposed = true;
    unsubscribe();
  };
}

/** One KPI card. The severity is in the label text as well as the colour, never colour alone. */
function dataQualityCard(
  label: string,
  value: number,
  key: string | null,
  className: string,
  title: string,
  sub?: { label: string; key: string }
): HTMLElement {
  return el('div', { class: `dq-card ${className}`, title }, [
    el('div', { class: 'dq-card-label', text: label }),
    el('div', { class: 'dq-card-value', ...parity(key), text: formatCount(value) }),
    sub ? el('div', { class: 'dq-card-sub', ...parity(sub.key), text: sub.label }) : null,
  ]);
}
