/**
 * Structure — a Diagnose lens.
 *
 * Question it answers: how is this product wired — who owns whom, and where is concentration?
 *
 * The lens owns three things the original left implicit: a text alternative for the graph (node and
 * edge counts plus where the concentration sits, so the picture is never the only route to the
 * answer), a keyboard path into the node set, and an honest label on the full-screen NAV readout.
 *
 * THE TWO PRODUCT NAVs — and why the label, not the figure, is what changed here (rubric R10).
 *
 * The full-screen readout shows `lookthrough.json`.`prodNAV` = $2,062,196,050.07, the
 * FUND-ENTITY-basis stamp. Every other screen shows Σ apex ENDING_NAV = $2,062,198,835.86. The
 * difference is exactly $2,785.79 — the whole NAV of the DUNK feeder. Both figures are correct on
 * their own basis and both are preserved deliberately (spec §1.8.1, approved decision Q1).
 *
 * R10 forbids two quantities answering to one label, and until now both answered to "Product NAV".
 * The string `structure.fullscreen.product_nav` = "Product NAV $2,062,196,050.07" is a STRICT key
 * in `tests/baseline.json` and is NOT a declared relabel in `docs/rename-map.json`, so it cannot be
 * reworded to "Product NAV (fund-entity basis)" without failing the parity gate. What it CAN do is
 * carry the basis in an ADJACENT element inside the same readout line, tagged with nothing, so the
 * pinned element's textContent is untouched while the visible label reads
 * "Product NAV $2,062,196,050.07 · fund-entity basis" and the readout's accessible name says so
 * outright. The Σ-feeder figure keeps its own basis note on every other screen (R11).
 */
import { formatUsdCents, formatPercent } from '../../../../domain/money.js';
import type { Store } from '../../../../state/store.js';
import { el, replace, qs, errorState, stageLoaded, stageLoading } from '../../../primitives/dom.js';
import { termAnnotate, termBindGlossary, termVocabularyLine } from '../../../primitives/term.js';
import { parity } from '../../../parity.js';
import {
  structureEnsureD3,
  structureRenderGraph,
  type StructureD3,
  type StructureDatum,
  type StructureGraphResult,
} from './graph.js';
import type { LookthroughNode } from '../../../../domain/types.js';
import { structureDefaultSettings, structureRenderControls, structureRenderLegend, type StructureControlsHandle } from './controls.js';
import { structureCaptionLoading, structureMountEmpty } from './data-state.js';

export const STRUCTURE_QUESTION =
  'How is this product wired — who owns whom, and where is concentration?';

const STRUCTURE_STAGE_STYLE =
  'position:relative;width:100%;height:640px;background:#F6F2E8;border:1px solid rgba(26,31,46,.10);border-radius:12px;overflow:hidden';
const STRUCTURE_STAGE_FULL =
  'position:fixed;inset:0;width:100vw;height:100vh;z-index:9000;background:#F6F2E8;border:none;border-radius:0;overflow:hidden';
const STRUCTURE_READOUT_STYLE =
  'position:absolute;top:12px;left:14px;z-index:64;max-width:280px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.9);border:1px solid rgba(26,31,46,.14);font-size:11.5px;line-height:1.35;font-weight:700;color:#22314c;pointer-events:none';

/**
 * Was `strData`. Leaves are securities rather than entities, so the graph is the 46 entity nodes
 * and the 45 ownership links between them; the parent comes from the node's materialised path.
 */
export function structureGraphData(nodes: readonly LookthroughNode[]): StructureDatum[] {
  const entities = nodes.filter((n) => n.kind !== 'leaf');
  const present = new Set(entities.map((n) => n.id));
  return entities.map((n) => {
    const trail = n.path.split('/').filter(Boolean);
    const raw = trail.length > 1 ? Number(trail[trail.length - 2]) : null;
    return {
      id: n.id,
      pid: raw != null && present.has(raw) ? raw : null,
      code: n.code,
      name: n.name,
      kind: n.kind,
      value: Math.abs(n.derived) || 1,
      ownpct: n.ownpct,
    };
  });
}

/** Where the product's look-through value is concentrated. Pure, so the caption cannot drift. */
export interface StructureConcentration {
  topCode: string;
  topShare: number;
  levels: number;
  others: { code: string; share: number }[];
}

export function structureConcentration(data: readonly StructureDatum[]): StructureConcentration {
  const root = data.find((d) => d.pid == null);
  const children = data.filter((d) => root != null && d.pid === root.id);
  const total = children.reduce((sum, d) => sum + Math.abs(d.value), 0) || 1;
  const ranked = children
    .map((d) => ({ code: d.code, share: Math.abs(d.value) / total }))
    .sort((a, b) => b.share - a.share);
  const first = ranked[0];
  return {
    topCode: first?.code ?? '—',
    topShare: first?.share ?? 0,
    levels: data.reduce((deep, d) => Math.max(deep, structureDepthOf(data, d)), 0),
    others: ranked.slice(1),
  };
}

function structureDepthOf(data: readonly StructureDatum[], node: StructureDatum): number {
  let depth = 0;
  let cursor: StructureDatum | undefined = node;
  while (cursor?.pid != null && depth < 64) {
    const parentId: number = cursor.pid;
    cursor = data.find((d) => d.id === parentId);
    depth += 1;
  }
  return depth;
}

/**
 * The abbreviations this lens renders: `NAV` in the full-screen readout and the basis note, `SPV`
 * in the legend's "SPV / holding" swatch and in the entity names, `apex` nowhere on screen but in
 * the concept the basis note explains, `DC` inside two registered entity names the graph labels
 * (SVG text, which cannot hold a control — so route (a) is the only route open there).
 * Expanded and linked above all of them (rubric R2).
 */
const STRUCTURE_VOCABULARY = ['nav', 'spv', 'double_count'];

export function mountStructureLens(host: HTMLElement, store: Store): () => void {
  termBindGlossary(store);
  const data = structureGraphData(store.core.lookthrough.nodes);
  const concentration = structureConcentration(data);
  const settings = structureDefaultSettings();
  // The shared Diagnose selection RINGS a node; it does not seed the focus filter, which fades
  // everything else. Opening the lens on a position code must not present a blanked-out graph.
  settings.selected = store.state.selectedEntity;

  /** The question and the vocabulary line, which every state of this lens renders (R1, R2). */
  const head = (): (Node | string)[] => [
    el('p', { class: 'screen-question', id: 'structure-question', text: STRUCTURE_QUESTION }),
    termVocabularyLine(STRUCTURE_VOCABULARY, 'structure-vocabulary'),
  ];

  // An empty look-through file is not a broken one. Checked here, before the stage exists, because
  // the graph's own error state would otherwise report "could not be drawn" for a file with nothing
  // in it to draw — and re-throw, so an empty product would read as a crash (R4).
  if (!data.length) return structureMountEmpty(host, head);

  replace(
    host,
    ...head(),
    el('div', { id: 'structure-controls' }),
    // The caption sits ABOVE the graph deliberately. It states the counts and where concentration
    // lies, which is the answer a controller came for; the graph is how they explore it. At
    // 1600x1000 a stage placed here would fall below the fold, so the answer would need a scroll
    // (rubric R5). It also serves as the graph's text alternative for anyone not using the SVG.
    el('p', { class: 'screen-help', id: 'structure-caption' }),
    el('div', { id: 'structure-stage', style: STRUCTURE_STAGE_STYLE }),
    structureRenderLegend(),
    el('p', { class: 'screen-help', id: 'structure-basis' })
  );

  const stage = qs('#structure-stage', host);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-labelledby', 'structure-question structure-caption');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  stage.append(svg);

  /* The full-screen readout. Always in the DOM so its two figures are always inspectable and
     always attributable to a basis; revealed when the stage takes the viewport. */
  const readoutFigure = el(
    'span',
    { class: 'readout-nav-figure', ...parity('structure.fullscreen.product_nav') },
    termAnnotate(`Product NAV ${formatUsdCents(store.core.lookthrough.prodNAV)}`)
  );
  const readout = el('div', { id: 'structure-readout', style: STRUCTURE_READOUT_STYLE, hidden: 'hidden' }, [
    el('div', { class: 'readout-title', ...parity('structure.fullscreen.title') }, [
      el('b', { text: store.state.productName }),
      ' · full screen',
    ]),
    // The pinned figure and its basis are siblings, so the label a reader sees is the pair. The
    // qualifier is NOT inside the tagged element — that element's textContent is frozen.
    el('div', { class: 'readout-nav', role: 'group', 'aria-label': 'Product NAV on the fund-entity basis' }, [
      readoutFigure,
      el('span', { class: 'readout-nav-basis', text: ' · fund-entity basis' }),
    ]),
    el('div', { class: 'readout-basis' }, [
      'One entity stamp, not the sum of the top-level feeders — every other screen shows that one.',
    ]),
  ]);
  stage.append(readout);

  let graph: StructureGraphResult = { nodeCount: 0, edgeCount: 0, fit: () => undefined };
  let controls: StructureControlsHandle | null = null;
  let library: StructureD3 | null = null;
  let full = false;

  function renderCaption(): void {
    // Before the library resolves there is no graph, so there are no counts to state (R4 loading).
    if (!library) {
      structureCaptionLoading(qs('#structure-caption', host));
      return;
    }
    const rest = concentration.others
      .map((o) => `${o.code} ${formatPercent(o.share)}`)
      .join(', ');
    replace(
      qs('#structure-caption', host),
      document.createTextNode('Text alternative for the graph: '),
      el('b', { text: `${graph.nodeCount} entities` }),
      document.createTextNode(' joined by '),
      el('b', { text: `${graph.edgeCount} ownership links` }),
      document.createTextNode(`, ${concentration.levels} levels deep. Concentration: `),
      el('b', { text: `${formatPercent(concentration.topShare)} of the product’s look-through value sits under ${concentration.topCode}` }),
      document.createTextNode(rest ? ` — the remaining top-level feeders are ${rest}. ` : '. '),
      settings.selected
        ? el('b', { text: `${settings.selected} is ringed in the graph. ` })
        : el('span'),
      document.createTextNode(
        'Each edge is labelled with the holder’s direct share of the entity below it (held units ÷ units outstanding). Tab into the graph, then use the arrow keys to walk the nodes and Enter to select one for the other lenses.'
      )
    );
  }

  /**
   * The basis note. It is the screen's answer to R10 and R11 in prose: two quantities, two labels,
   * and the arithmetic that separates them — so neither figure can be mistaken for the other, and
   * neither is quietly adjusted to agree. Free text (no parity key reads it), so the abbreviations
   * here are expanded outright as well as linked.
   */
  function renderBasis(): void {
    replace(
      qs('#structure-basis', host),
      ...termAnnotate(
        'Two product net asset values (NAV) exist and both are right, so neither is labelled just “Product NAV”. This lens’s full-screen readout shows '
      ),
      el('b', {}, termAnnotate(`Product NAV, fund-entity basis ${formatUsdCents(store.core.lookthrough.prodNAV)}`)),
      ...termAnnotate(' — the one NAV stamped on the fund entity. Every other screen shows '),
      el('b', {}, termAnnotate(`Product NAV, Σ top-level feeders ${formatUsdCents(store.repricing.N)}`)),
      ...termAnnotate(
        `. They differ by ${formatUsdCents(store.repricing.N - store.core.lookthrough.prodNAV)}, which is the whole NAV of the DUNK feeder: a basis difference, not a break. Neither is the sum of every fund’s NAV — that would double-count a parent and its children.`
      )
    );
  }

  function render(): void {
    if (!library || !controls) return;
    stageLoaded(stage);
    graph = structureRenderGraph(library, svg, data, controls.settings, (code) =>
      store.set({ selectedEntity: code })
    );
    renderCaption();
  }

  function toggleFull(): void {
    full = !full;
    stage.setAttribute('style', full ? STRUCTURE_STAGE_FULL : STRUCTURE_STAGE_STYLE);
    if (full) readout.removeAttribute('hidden');
    else readout.setAttribute('hidden', 'hidden');
    fullButton.setAttribute('aria-pressed', full ? 'true' : 'false');
    fullButton.textContent = full ? '⤡ Exit full screen' : '⤢ Full screen';
    render();
  }

  const fullButton = el('button', {
    type: 'button',
    class: 'btn',
    'aria-pressed': 'false',
    title: 'Hand the graph the whole viewport (Esc to exit)',
    'data-parity-scene': 'step:stageFullscreen:str',
    text: '⤢ Full screen',
  });
  fullButton.addEventListener('click', toggleFull);

  controls = structureRenderControls(qs('#structure-controls', host), settings, {
    onChange: render,
    onFit: () => graph.fit(),
  });
  qs('#structure-tools', host).append(fullButton);
  // The stage says it is loading until the vendored library and the layout land, rather than showing
  // an empty box (rubric R4). `render()` clears it; a load failure replaces it with its own state.
  stageLoading(stage, 'the ownership structure graph');
  renderCaption();
  renderBasis();

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && full) toggleFull();
  };
  const onResize = (): void => render();
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onResize);

  structureEnsureD3().then(
    (loaded) => {
      library = loaded;
      render();
    },
    (error: unknown) => {
      stageLoaded(stage);
      replace(
        qs('#structure-caption', host),
        errorState(
          'The structure graph could not start.',
          `${String(error)} The graph library ships with the app under vendor/; confirm that folder deployed alongside it.`,
          { label: 'Reload this product’s data', onAct: () => location.reload() }
        )
      );
    }
  );

  const unsubscribe = store.subscribe((state, changed) => {
    if (changed.has('selectedEntity')) {
      controls?.setSelected(state.selectedEntity);
      render();
    }
  });

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
  };
}
