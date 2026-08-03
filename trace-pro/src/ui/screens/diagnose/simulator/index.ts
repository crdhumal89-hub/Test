/**
 * Simulator — a Diagnose lens.
 *
 * Question it answers: if this fund's value or units move, what happens to product NAV, and through
 * which holders does it travel?
 *
 * Two runs, one scene. A SINGLE SHOCK moves one fund and books the P&L up every ownership path to
 * the product. The WHOLE-BOOK REPRICE sweeps every level bottom-up and lands on the five figures
 * the Reconciliation waterfall shows — to the cent. That identity is the reason this lens exists,
 * so the reprice ledger is on screen at rest, not hidden behind a button.
 *
 * Every figure comes from `domain/cascade` or `domain/reconciliation`. This file lays out, wires and
 * narrates; it computes nothing.
 */
import { buildCascadeIndex, type CascadeResult } from '../../../../domain/cascade.js';
import { formatUsdCompact, formatUsdCents, formatUsdCentsParens, formatPercent, formatPrice } from '../../../../domain/money.js';
import type { PricingView, SimulatorFixture } from '../../../../domain/types.js';
import type { Store } from '../../../../state/store.js';
import { el, replace, qs, errorState } from '../../../primitives/dom.js';
import { parity } from '../../../parity.js';
import { structureEnsureD3, type StructureD3 } from '../structure/graph.js';
import { simulatorBuildScene, type SimulatorScene } from './graph.js';
import { simulatorRenderShockPanel, simulatorRenderEntityList } from './shock-panel.js';
import { simulatorCreateRepriceRun, type SimulatorRunState } from './reprice-run.js';
import { simulatorRenderRepriceLedger, simulatorRenderCascadeLedger, simulatorRenderBreaks } from './ledger.js';

export const SIMULATOR_QUESTION =
  'If this fund’s value or units move, what happens to product NAV, and through which holders?';

/**
 * The help line, verbatim. `simulator.help_text` is a STRICT parity key — it is not in
 * docs/rename-map.json — so it keeps the original's wording, including the old names of the two
 * sweep controls. The buttons themselves carry the renamed labels of spec §3.1, so the line
 * immediately below maps one to the other rather than leaving a controller to guess.
 */
function simulatorHelpText(): HTMLElement {
  const b = (text: string): HTMLElement => el('b', { text });
  return el('p', { class: 'screen-help', id: 'simulator-help', ...parity('simulator.help_text') }, [
    'Click a node to shock its ',
    b('MV / Qty / NAV'),
    ' & hit ',
    b('Run'),
    ' · ',
    b('Run full reprice'),
    ' sweeps the whole book bottom-up automatically · ',
    b('Step by stage'),
    ' lets you ',
    b('click each level'),
    ' to reprice it yourself, one stage at a time. Prices flow up the lit path; open the ',
    b('▤ Ledger'),
    ' tray for the per-holder breakdown.',
  ]);
}

const SIMULATOR_STAGE_STYLE =
  'position:relative;width:100%;height:620px;background:#0A1226;border:1px solid rgba(120,150,200,.28);border-radius:12px;overflow:hidden';

/** Display value and price per node, per pricing basis. Was `simBaseVal` / `simBasePx`. */
function simulatorDisplay(store: Store, fixture: SimulatorFixture, view: PricingView) {
  const revised = new Map(store.repricing.funds.map((f) => [f.code, f]));
  return {
    valueOf(id: string): number | null {
      if (id === fixture.productNodeId) return fixture.productNAV;
      const fund = fixture.funds[id];
      if (!fund || fund.nav == null) return null;
      if (view === 'after') return revised.get(id)?.rev ?? fund.nav;
      return fund.ltv ?? fund.nav;
    },
    priceOf(id: string): number | null {
      if (id === fixture.productNodeId) return null;
      const fund = fixture.funds[id];
      if (!fund) return null;
      if (view === 'after') return revised.get(id)?.revPx ?? fund.price;
      return fund.nav != null && fund.ltv != null && fund.gq ? fund.ltv / fund.gq : fund.price;
    },
  };
}

/** Where product NAV is concentrated, from the top-level feeders. Pure. */
export function simulatorConcentration(fixture: SimulatorFixture): { code: string; share: number }[] {
  const total = fixture.apex.reduce((sum, code) => sum + Math.abs(fixture.funds[code]?.nav ?? 0), 0) || 1;
  return fixture.apex
    .map((code) => ({ code, share: Math.abs(fixture.funds[code]?.nav ?? 0) / total }))
    .sort((a, b) => b.share - a.share);
}

function simulatorToggle(label: string, pressed: boolean, title: string, onToggle: (next: boolean) => void): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'btn', 'aria-pressed': pressed ? 'true' : 'false', title, text: label });
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', next ? 'true' : 'false');
    onToggle(next);
  });
  return button;
}

export function mountSimulatorLens(host: HTMLElement, store: Store): () => void {
  const fixture = store.core.simulator;
  const index = buildCascadeIndex(fixture);
  const concentration = simulatorConcentration(fixture);

  let scene: SimulatorScene | null = null;
  let library: StructureD3 | null = null;
  let result: CascadeResult | null = null;
  let isolate = true;
  let follow = true;
  let speed = 1;

  replace(
    host,
    el('p', { class: 'screen-question', id: 'simulator-question', text: SIMULATOR_QUESTION }),
    el('div', { class: 'toolbar', id: 'simulator-bar' }),
    simulatorHelpText(),
    el('p', { class: 'screen-help', id: 'simulator-relabel' }, [
      'Those two controls are now labelled ',
      el('b', { text: 'Reprice everything (bottom-up)' }),
      ' and ',
      el('b', { text: 'Reprice one level at a time' }),
      ', and the ledger sits beside the graph rather than in a tray. Every node is reachable with Tab and the arrow keys, and the entity list below the graph is a keyboard-only route to the same 27 nodes.',
    ]),
    el('div', { id: 'simulator-stage', style: SIMULATOR_STAGE_STYLE }),
    el('div', { class: 'toolbar', id: 'simulator-runline' }, [
      el('span', { class: 'status-line', id: 'simulator-run-label', ...parity('simulator.reprice.run_label'), role: 'status', 'aria-live': 'polite' }),
      el('span', { class: 'status-line', id: 'simulator-run-numbers', ...parity('simulator.reprice.run_numbers') }),
    ]),
    el('p', { class: 'screen-help', id: 'simulator-caption' }),
    el('div', { class: 'layout', id: 'simulator-panels' }, [
      el('section', { class: 'panel', id: 'simulator-shock', 'aria-label': 'Shock panel' }),
      el('aside', { class: 'panel side', id: 'simulator-tray', 'aria-label': 'Ledgers' }, [
        el('h3', {}, [
          'Whole-book reprice ledger · ',
          el('b', { ...parity('simulator.ledger_product'), text: fixture.productCode }),
        ]),
        el('div', { class: 'simscore', id: 'simulator-score', ...parity('simulator.reprice.ledger') }),
        el('p', { class: 'note', id: 'simulator-tie' }),
        el('div', { id: 'simulator-cascade' }),
        el('div', { id: 'simulator-breaks' }),
      ]),
    ]),
    el('div', { id: 'simulator-entities' })
  );

  const stage = qs('#simulator-stage', host);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-labelledby', 'simulator-question simulator-caption');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  stage.append(svg);

  const run = simulatorCreateRepriceRun({
    fixture,
    repricing: store.repricing,
    hosts: { label: qs('#simulator-run-label', host), numbers: qs('#simulator-run-numbers', host) },
    scene: () => scene,
    follow: () => follow,
    speed: () => speed,
    onState: (state) => syncRunButtons(state),
  });

  /* ---------------------------------------------------------------- selection and shock */

  function activate(code: string): void {
    if (run.clickNode(code)) return;
    if (code === fixture.productNodeId) return;
    run.cancel();
    result = null;
    store.set({ selectedEntity: code });
    renderPanels();
    scene?.paintBase(code);
  }

  function onRun(next: CascadeResult): void {
    run.cancel();
    result = next;
    scene?.showCascade(next, isolate);
    renderPanels();
  }

  function renderPanels(): void {
    const selected = store.state.selectedEntity;
    simulatorRenderShockPanel(qs('#simulator-shock', host), {
      fixture,
      index,
      selected: selected && fixture.funds[selected] ? selected : null,
      onRun: (next) => onRun(next),
      onClear: () => {
        result = null;
        scene?.paintBase(store.state.selectedEntity);
        renderPanels();
      },
      onSelect: activate,
    });
    simulatorRenderRepriceLedger(qs('#simulator-score', host), store.repricing);
    simulatorRenderCascadeLedger(qs('#simulator-cascade', host), fixture, result);
    simulatorRenderBreaks(qs('#simulator-breaks', host), fixture, selected, result);
    renderTie();
    renderCaption();
  }

  function renderTie(): void {
    replace(
      qs('#simulator-tie', host),
      document.createTextNode('Read the five rows above as the Reconciliation waterfall: '),
      el('b', { text: 'look-through value at current marks' }),
      document.createTextNode(' + '),
      el('b', { text: 'pricing difference' }),
      document.createTextNode(' = '),
      el('b', { text: 'repriced value' }),
      document.createTextNode(', + '),
      el('b', { text: 'non-position difference' }),
      document.createTextNode(' (cash, fees and receivables) = '),
      el('b', { text: 'NAV' }),
      document.createTextNode(
        `. The completed sweep lands on ${formatUsdCents(store.repricing.N)} — the same figure, to the cent, that the Reconciliation screen publishes. If the two ever disagreed, one of them would be wrong.`
      )
    );
  }

  function renderCaption(): void {
    const ranked = concentration.map((c) => `${c.code} ${formatPercent(c.share)}`).join(', ');
    const selected = store.state.selectedEntity;
    const fund = selected ? fixture.funds[selected] : undefined;
    replace(
      qs('#simulator-caption', host),
      document.createTextNode('Text alternative for the graph: '),
      el('b', { text: `${scene?.nodeCount ?? fixture.treeNodes.length} nodes` }),
      document.createTextNode(' — the product, its '),
      el('b', { text: `${fixture.apex.length} top-level feeders` }),
      document.createTextNode(` and ${fixture.nFunds} funds — joined by `),
      el('b', { text: `${scene?.edgeCount ?? 0} ownership edges` }),
      document.createTextNode(`, ${fixture.maxlevel} levels deep. Concentration by feeder NAV: ${ranked}. `),
      fund
        ? el('b', {
            text: `Selected: ${selected} — NAV ${fund.nav == null ? 'not reported' : formatUsdCents(fund.nav)}, unit price ${formatPrice(fund.price)}, effective share of the product ${formatPercent(fund.eff ?? 0)}.`,
          })
        : el('b', { text: 'Nothing selected yet — choose a fund from the entity list below.' }),
      result
        ? el('span', {
            text: ` Last shock: ${result.shocked}, ${result.bookings.length} bookings across ${result.affected.size} holders, product NAV moves ${formatUsdCentsParens(result.productValueDelta)}.`,
          })
        : el('span', { text: ' No shock has been run.' })
    );
  }

  /* ---------------------------------------------------------------- the toolbar */

  const runButtons = new Map<string, HTMLButtonElement>();
  function syncRunButtons(state: SimulatorRunState): void {
    const step = runButtons.get('step');
    const pause = runButtons.get('pause');
    if (step) step.disabled = state.done || (!state.active && state.mode === 'auto');
    if (pause) {
      pause.disabled = state.mode !== 'auto' || state.done;
      pause.textContent = state.paused ? '▶ Resume' : '⏸ Pause';
    }
  }

  function renderBar(): void {
    const bar = qs('#simulator-bar', host);
    const everythingButton = el('button', { type: 'button', class: 'btn btn-primary', id: 'simulator-reprice', 'data-parity-scene': 'step:simFullReprice', text: 'Reprice everything (bottom-up)', title: 'Was “Run full reprice”: sweep the whole book from the lowest level up to the product' });
    everythingButton.addEventListener('click', () => {
      result = null;
      run.start('auto');
    });
    const oneLevelButton = el('button', { type: 'button', class: 'btn', id: 'simulator-step-mode', text: 'Reprice one level at a time', title: 'Was “Step by stage”: walk the sweep yourself, one level at a time, lowest first' });
    oneLevelButton.addEventListener('click', () => {
      result = null;
      run.start('manual');
    });
    const stepButton = el('button', { type: 'button', class: 'btn', text: 'Next stage ▸', title: 'Advance one level' });
    stepButton.addEventListener('click', () => run.step());
    const pauseButton = el('button', { type: 'button', class: 'btn', text: '⏸ Pause' });
    pauseButton.addEventListener('click', () => run.togglePause());
    const resetButton = el('button', { type: 'button', class: 'btn', text: '↺ Reset run' });
    resetButton.addEventListener('click', () => {
      result = null;
      run.cancel();
      renderPanels();
    });
    runButtons.set('step', stepButton);
    runButtons.set('pause', pauseButton);

    const speedGroup = el('div', { class: 'seg-group', role: 'group', 'aria-label': 'Sweep speed' });
    const speedButtons = [0.5, 1, 2].map((value) => {
      const button = el('button', { type: 'button', class: value === 1 ? 'seg on' : 'seg', text: `${value}×` });
      button.addEventListener('click', () => {
        speed = value;
        for (const other of speedButtons) other.className = other === button ? 'seg on' : 'seg';
      });
      return button;
    });
    speedGroup.append(...speedButtons);

    const fitButton = el('button', { type: 'button', class: 'btn', text: '◎ Fit' });
    fitButton.addEventListener('click', () => scene?.fit());

    replace(
      bar,
      el('span', { class: 'status-line' }, [
        'Shock simulator · active product ',
        el('b', { ...parity('simulator.product_code'), text: fixture.productCode }),
      ]),
      el('span', { class: 'status-line' }, [
        'Product NAV ',
        el('b', { class: 'mono', ...parity('simulator.product_nav'), text: formatUsdCompact(fixture.productNAV) }),
      ]),
      everythingButton,
      oneLevelButton,
      stepButton,
      pauseButton,
      resetButton,
      speedGroup,
      simulatorToggle('Isolate affected', isolate, 'Fade everything the shock does not touch', (next) => {
        isolate = next;
        if (result) scene?.showCascade(result, isolate);
        else scene?.paintBase(store.state.selectedEntity);
      }),
      simulatorToggle('Follow camera', follow, 'Keep the repricing level centred as the sweep rises', (next) => {
        follow = next;
        if (!follow) scene?.fit();
      }),
      fitButton
    );
    syncRunButtons(run.state());
  }

  /* ---------------------------------------------------------------- boot */

  function buildScene(): void {
    if (!library) return;
    const display = simulatorDisplay(store, fixture, store.state.view);
    scene = simulatorBuildScene(library, svg, {
      fixture,
      valueOf: display.valueOf,
      priceOf: display.priceOf,
      nameOf: (id) => (id === fixture.productNodeId ? fixture.product : fixture.funds[id]?.name ?? id),
      onActivate: activate,
    });
    scene.paintBase(store.state.selectedEntity);
    renderCaption();
  }

  renderBar();
  simulatorRenderEntityList(qs('#simulator-entities', host), fixture, activate);
  run.renderIdle();
  renderPanels();

  structureEnsureD3().then(
    (loaded) => {
      library = loaded;
      buildScene();
    },
    (error: unknown) => {
      replace(
        qs('#simulator-caption', host),
        errorState(
          'The simulator graph could not start.',
          `${String(error)} Every figure below is still exact — the graph library ships under vendor/; confirm that folder deployed alongside the app.`
        )
      );
    }
  );

  const onResize = (): void => buildScene();
  window.addEventListener('resize', onResize);

  const unsubscribe = store.subscribe((_state, changed) => {
    if (changed.has('view') || changed.has('product')) {
      result = null;
      run.cancel();
      buildScene();
      renderPanels();
      return;
    }
    if (changed.has('selectedEntity')) {
      renderPanels();
      scene?.paintBase(store.state.selectedEntity);
    }
  });

  return () => {
    unsubscribe();
    run.cancel();
    window.removeEventListener('resize', onResize);
  };
}
