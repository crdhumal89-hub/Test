/**
 * The staged bottom-up reprice — "Reprice everything (bottom-up)" and "Reprice one level at a time".
 *
 * Ported from `simFullReprice` / `simFRAdvance` / `simFRFinish` / `simFRRenderScore` / `simStepStart`
 * (original 1897-2020). The plan comes from `domain/cascade.buildRepriceRun` and the running
 * figures from `domain/reconciliation.repriceProgress`; this module only sequences and renders.
 *
 * DETERMINISM. This is the one animated path a snapshot waits on, so it has two modes:
 *
 *   reduced motion  — every level is applied in one synchronous loop and the run finishes inside
 *                     `start()`. No timer is ever created, so there is nothing left to fire.
 *   full motion     — one `setTimeout` chain, cleared on finish. `finish()` is idempotent and
 *                     writes the final label, numbers, ledger and product badge exactly once.
 *
 * Either way the DOM comes to rest with the run label containing the word "complete" and stays
 * there: no trailing timer mutates a figure after the sweep ends.
 */
import { buildRepriceRun, type RepriceRun } from '../../../../domain/cascade.js';
import { repriceProgress } from '../../../../domain/reconciliation.js';
import type { RepricingFixture, SimulatorFixture } from '../../../../domain/types.js';
import { el, replace } from '../../../primitives/dom.js';
import { structureReducedMotion } from '../structure/graph.js';
import type { SimulatorScene } from './graph.js';
import { simulatorCompactUsd, simulatorCompactUsdParens } from './ledger.js';

/** Per-level dwell at 1×. Was `FR_DUR`. */
const SIMULATOR_REPRICE_STEP_MS = 880;

export type SimulatorRunMode = 'auto' | 'manual';

export interface SimulatorRepriceHosts {
  label: HTMLElement;
  numbers: HTMLElement;
}

export interface SimulatorRepriceContext {
  fixture: SimulatorFixture;
  repricing: RepricingFixture;
  hosts: SimulatorRepriceHosts;
  /** The scene to paint. Null before d3 has loaded; the run then renders figures only. */
  scene: () => SimulatorScene | null;
  /** Whether the camera should follow the rising wave. */
  follow: () => boolean;
  speed: () => number;
  /** Called whenever run state changes, so the toolbar can enable/disable its buttons. */
  onState: (state: SimulatorRunState) => void;
}

export interface SimulatorRunState {
  active: boolean;
  done: boolean;
  paused: boolean;
  mode: SimulatorRunMode | null;
  /** 1-based stage index, 0 before the first stage. */
  stage: number;
  stages: number;
}

export interface SimulatorRepriceHandle {
  start(mode: SimulatorRunMode): void;
  /** Advance one stage (the manual path, and the Step button on the auto path). */
  step(): void;
  togglePause(): void;
  cancel(): void;
  /** A node click while a manual run is armed: advance only if it is on the armed level. */
  clickNode(id: string): boolean;
  /** Draw the resting label and numbers. */
  renderIdle(): void;
  state(): SimulatorRunState;
}

export function simulatorCreateRepriceRun(context: SimulatorRepriceContext): SimulatorRepriceHandle {
  const { fixture, repricing, hosts } = context;
  const pnlByCode = new Map(repricing.funds.map((f) => [f.code, f]));
  const weightOf = (code: string): number => pnlByCode.get(code)?.pnlLevel ?? 0;

  let plan: RepriceRun | null = null;
  let index = -1;
  let mode: SimulatorRunMode | null = null;
  let done = false;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const state = (): SimulatorRunState => ({
    active: plan != null && !done,
    done,
    paused,
    mode,
    stage: index + 1,
    stages: plan?.levels.length ?? 0,
  });
  const publish = (): void => context.onState(state());

  /** The two running figures. `finished` snaps the P&L to the exact pricing difference. */
  function renderNumbers(fraction: number, finished: boolean): void {
    const progress = repriceProgress(repricing, fraction, finished);
    replace(
      hosts.numbers,
      el('span', { class: 'frn' }, [
        el('i', { text: 'Repriced value' }),
        el('b', { class: 'mono', text: simulatorCompactUsd(progress.lookthrough) }),
      ]),
      el('span', { class: 'frn' }, [
        el('i', { text: 'Repricing gain or loss' }),
        el('b', {
          class: `mono ${progress.pnl >= 0 ? 'pos' : 'neg'}`,
          text: (progress.pnl >= 0 ? '+' : '') + simulatorCompactUsdParens(progress.pnl),
        }),
      ]),
      finished ? el('span', { class: 'badge badge-ok', text: '✓ reconciled · no pricing break' }) : el('span', { hidden: 'hidden' })
    );
  }

  function renderLabel(children: (Node | string)[]): void {
    replace(hosts.label, ...children);
  }

  function renderIdle(): void {
    renderLabel([
      'Whole-book reprice · not started. ',
      el('b', { text: 'Reprice everything (bottom-up)' }),
      ' sweeps all ',
      el('b', { text: String(buildPlan().levels.length) }),
      ' levels for you; ',
      el('b', { text: 'Reprice one level at a time' }),
      ' hands you each stage.',
    ]);
    renderNumbers(0, false);
  }

  function buildPlan(): RepriceRun {
    plan ??= buildRepriceRun(fixture, weightOf);
    return plan;
  }

  function clearTimer(): void {
    if (timer != null) clearTimeout(timer);
    timer = null;
  }

  /** Apply one stage: reprice its funds, light their edges into every holder, move the readouts. */
  function applyStage(): boolean {
    const current = buildPlan();
    index += 1;
    const level = current.levels[index];
    if (level == null) return false;
    const ids = current.byLevel[level] ?? [];
    const scene = context.scene();
    if (scene && context.follow()) {
      const parents = new Set<string>();
      for (const id of ids) for (const p of current.parentsOf[id] ?? []) parents.add(p);
      scene.focusOn([...ids, ...parents]);
    }
    let levelPnl = 0;
    for (const id of ids) {
      const fund = pnlByCode.get(id);
      const pnl = fund?.pnlLevel ?? 0;
      levelPnl += pnl;
      scene?.markRepriced(id, fund?.ltv ?? null, fund?.rev ?? null, pnl, fund?.revPx ?? null);
    }
    scene?.lightEdges(current.edgesByLevel[level] ?? [], weightOf);
    renderNumbers(current.cumulativeFraction[level] ?? 0, false);
    renderLabel([
      mode === 'manual' ? '👉 ' : '⏻ ',
      'Level ',
      el('b', { text: String(level) }),
      ` (${index + 1}/${current.levels.length}) · `,
      el('b', { text: String(ids.length) }),
      ` node${ids.length === 1 ? '' : 's'} repriced → holders · Δ `,
      el('b', { class: levelPnl >= 0 ? 'pos' : 'neg', text: (levelPnl >= 0 ? '+' : '') + simulatorCompactUsdParens(levelPnl) }),
    ]);
    armNext();
    return true;
  }

  function armNext(): void {
    const current = buildPlan();
    const next = current.levels[index + 1];
    const scene = context.scene();
    if (next == null || !scene) return;
    scene.armNext(current.byLevel[next] ?? []);
  }

  function finish(): void {
    if (done) return;
    clearTimer();
    done = true;
    const scene = context.scene();
    if (scene) {
      scene.finishProduct(repricing.D, repricing.R, repricing.dPricing);
      if (context.follow()) scene.focusOn([fixture.productNodeId, ...fixture.apex]);
    }
    renderNumbers(1, true);
    // Exactly this string, and nothing after it: the harness waits on the word "complete".
    renderLabel(['✓ Reprice complete · every stage repriced · product reconciled to revised NAV']);
    publish();
  }

  function schedule(): void {
    if (mode !== 'auto' || done || paused) return;
    const dwell = Math.max(120, SIMULATOR_REPRICE_STEP_MS / Math.max(0.25, context.speed()));
    timer = setTimeout(advance, dwell);
  }

  function advance(): void {
    clearTimer();
    if (done) return;
    if (!applyStage()) {
      finish();
      return;
    }
    publish();
    schedule();
  }

  function start(next: SimulatorRunMode): void {
    cancel();
    plan = buildRepriceRun(fixture, weightOf);
    index = -1;
    done = false;
    mode = next;
    paused = next === 'manual';
    context.scene()?.paintBase(null);
    renderNumbers(0, false);
    if (next === 'manual') {
      renderLabel([
        '👉 Step-through ready · ',
        el('b', { text: 'activate the highlighted lowest level' }),
        ' (or press Next stage) to reprice it into its holders.',
      ]);
      armNext();
      publish();
      return;
    }
    if (structureReducedMotion()) {
      // No timers at all: apply every stage, then finish. The DOM reaches its final state here.
      while (applyStage()) {
        /* every level, deepest first */
      }
      finish();
      return;
    }
    renderLabel(['⏻ Reprice everything (bottom-up) · deepest level first']);
    publish();
    advance();
  }

  function cancel(): void {
    clearTimer();
    plan = null;
    index = -1;
    mode = null;
    done = false;
    paused = false;
    context.scene()?.paintBase(null);
    renderIdle();
    publish();
  }

  return {
    start,
    step(): void {
      if (done) return;
      paused = true;
      clearTimer();
      if (plan == null) {
        start('manual');
        return;
      }
      advance();
    },
    togglePause(): void {
      if (done || mode !== 'auto') return;
      paused = !paused;
      clearTimer();
      publish();
      schedule();
    },
    cancel,
    clickNode(id: string): boolean {
      if (mode !== 'manual' || done || plan == null) return false;
      const next = plan.levels[index + 1];
      if (next == null) {
        finish();
        return true;
      }
      if (!(plan.byLevel[next] ?? []).includes(id)) return false;
      advance();
      return true;
    },
    renderIdle,
    state,
  };
}
