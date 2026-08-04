/**
 * The Simulator lens's three data states, and the validator that decides between them.
 *
 * What this fixes: with a malformed `simulator.json` the lens threw
 * `TypeError: e.apex.reduce is not a function` out of its own mount and rendered NOTHING — an empty
 * panel, and a sentence only a controller with the developer console open could ever read. The lens
 * now asks what is wrong with the fixture BEFORE it touches it, says so in a sentence, and offers a
 * way out. The failure is still recorded and re-thrown on a fresh task, exactly as the structure
 * graph does (see `structure/graph.ts`), so R14's console listener still sees a real failure rather
 * than a swallowed one: surfacing an error to the user is not the same as pretending it did not
 * happen.
 */
import type { SimulatorFixture } from '../../../../domain/types.js';
import { el, emptyState, errorState, replace } from '../../../primitives/dom.js';

/** The head every state of this lens repeats: the question, which R1 requires first. */
export type SimulatorHead = () => (Node | string)[];

interface SimulatorFailureLog {
  /** Every simulator data failure this page has seen, in order, for the headless suite to read. */
  __simulatorFailures?: string[];
}

/**
 * What is wrong with the simulator fixture, in plain language — or null when it is sound.
 *
 * Each clause names a field the lens dereferences during mount, so a fault becomes a sentence
 * instead of a `TypeError`: `apex.reduce` (concentration), `funds[...]` (every tile and the shock
 * panel), `edges` (the cascade index), `treeNodes` (the scene), `productNAV` (the baseline tile).
 */
export function simulatorDataProblem(fixture: SimulatorFixture | null | undefined): string | null {
  if (!fixture || typeof fixture !== 'object') return 'the simulator model did not arrive at all';
  if (!Array.isArray(fixture.apex)) {
    return 'it lists no top-level feeders, so there is nothing to measure the product against';
  }
  if (!fixture.funds || typeof fixture.funds !== 'object') {
    return 'its table of funds is missing, so no fund can be shocked';
  }
  if (!Array.isArray(fixture.edges)) {
    return 'its ownership edges are missing, so a shock has no path to travel up';
  }
  if (!Array.isArray(fixture.treeNodes)) return 'its graph nodes are missing, so nothing can be drawn';
  if (!Number.isFinite(fixture.productNAV)) {
    return 'the product’s net asset value is not a number, so every difference below it would be meaningless';
  }
  const codes = Object.keys(fixture.funds);
  const broken = codes.filter((code) => {
    const fund = fixture.funds[code];
    return !fund || typeof fund.code !== 'string' || !Number.isFinite(fund.gq);
  }).length;
  if (broken) return `${broken} of ${codes.length} funds carry no unit count to reprice from`;
  return null;
}

/**
 * Record the failure so it cannot pass silently (R14). `src/` may not call `console.*`, so it is
 * both logged on the page for a test to read and re-thrown on a fresh task, which the console
 * listeners in `tests/e2e/helpers.ts` and `scripts/lib/browser.mjs` see as a `pageerror`.
 */
export function simulatorRecordFailure(problem: string): void {
  const log = globalThis as SimulatorFailureLog;
  log.__simulatorFailures ??= [];
  log.__simulatorFailures.push(problem);
  const failure = new Error(`simulator fixture unusable: ${problem}`);
  setTimeout(() => {
    throw failure;
  }, 0);
}

/** The error state: what failed, what it does not affect, and what to do next. */
export function simulatorMountProblem(host: HTMLElement, head: SimulatorHead, problem: string): () => void {
  simulatorRecordFailure(problem);
  replace(
    host,
    ...head(),
    el('div', { id: 'simulator-error' }, [
      errorState(
        'The shock simulator could not be built for this product.',
        `Its own data file arrived unusable: ${problem}. Nothing is simulated rather than simulated ` +
          'wrongly. The reconciliation, the prices and the other three lenses read different files ' +
          'and are unaffected — the Data quality lens names every fault found in the source data.',
        { label: 'Reload this product’s data', onAct: () => location.reload() }
      ),
    ])
  );
  return () => undefined;
}

/** The empty state: a sound file that simply describes no funds. Not a failure, so nothing is thrown. */
export function simulatorMountEmpty(host: HTMLElement, head: SimulatorHead): () => void {
  replace(
    host,
    ...head(),
    el('div', { id: 'simulator-empty' }, [
      emptyState(
        'This product has no funds to shock: its simulator file lists no fund at all, so there is no ' +
          'value or unit count that could move. Nothing has failed — there is simply nothing here yet.',
        { label: 'Reload this product’s data', onAct: () => location.reload() }
      ),
    ])
  );
  return () => undefined;
}
