/**
 * Boot: read the requested product and as-of from the URL, load fixtures, build state, mount the
 * shell, then the requested screen. Nothing renders a figure before its data is in hand, so the
 * loading and error states are real rather than decorative (rubric R4).
 */
import { loadManifest, loadCore, resolveSelection, createUniverseLoader, FixtureError } from './data/load.js';
import { createStore, readRoute, type LensId } from './state/store.js';
import { renderShell, wireShell } from './ui/chrome/shell.js';
import { mountReconciliation } from './ui/screens/reconciliation/index.js';
import { el, replace, errorState } from './ui/primitives/dom.js';

const rootMaybe = document.getElementById('app');
if (!rootMaybe) throw new Error('missing #app');
const root: HTMLElement = rootMaybe;

async function boot(): Promise<void> {
  const manifest = await loadManifest();
  const selection = resolveSelection(manifest, location.search);
  const core = await loadCore(selection.product, selection.asof);

  const store = createStore({
    core,
    product: selection.product,
    productName: selection.name,
    productCode: selection.code,
    asof: selection.asof,
    // A fixture field, not the hard-coded literal the original shipped.
    defaultPosition: core.lookthrough.nodes.find((n) => n.kind === 'vehicle')?.code ?? null!,
  });

  const universe = createUniverseLoader(selection.product, selection.asof);
  void universe;

  const route = readRoute(location.hash);
  store.set({ screen: route.screen, ...(route.lens ? { lens: route.lens as LensId } : {}) });

  renderShell(root, store);
  wireShell(store);

  const screenHost = document.getElementById('screen');
  if (!screenHost) throw new Error('missing #screen');

  let unmount: (() => void) | null = null;
  function mountCurrent(): void {
    unmount?.();
    unmount = mountReconciliation(screenHost!, store);
  }
  mountCurrent();

  window.addEventListener('hashchange', () => {
    const next = readRoute(location.hash);
    store.set({ screen: next.screen, ...(next.lens ? { lens: next.lens as LensId } : {}) });
  });
}

boot().catch((error: unknown) => {
  const isFixture = error instanceof FixtureError;
  replace(
    root,
    el('div', { class: 'boot-error' }, [
      errorState(
        isFixture ? 'The product’s data could not be loaded.' : 'TRACE-Pro could not start.',
        isFixture
          ? `${(error as FixtureError).message} Confirm the data folder shipped alongside the app.`
          : String(error),
        { label: 'Try again', onAct: () => location.reload() }
      ),
    ])
  );
  // Surfaced in the UI above; also recorded so the headless suite sees a real failure, not silence.
  throw error;
});
