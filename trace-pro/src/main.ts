/**
 * Boot and route.
 *
 * Reads the requested product and as-of from the URL, loads the four core fixtures, builds state,
 * mounts the shell, then mounts whichever screen the hash asks for. The 472 KiB firm-wide universe
 * is NOT loaded here — only two Diagnose lenses need it, and they fetch it on first use with a real
 * loading state (rubric R4).
 *
 * Nothing renders a figure before its data is in hand, so the loading and error states are load
 * bearing rather than decorative.
 */
import { loadManifest, loadCore, resolveSelection, createUniverseLoader, FixtureError } from './data/load.js';
import { createStore, readRoute, routeToHash, type LensId, type ScreenId, type Store } from './state/store.js';
import { renderShell, wireShell } from './ui/chrome/shell.js';
import { mountReconciliation } from './ui/screens/reconciliation/index.js';
import { mountPricing } from './ui/screens/pricing/index.js';
import { mountDiagnose } from './ui/screens/diagnose/index.js';
import { mountStructureLens } from './ui/screens/diagnose/structure/index.js';
import { mountOwnershipLens } from './ui/screens/diagnose/ownership/index.js';
import { mountDataQualityLens } from './ui/screens/diagnose/data-quality/index.js';
import { mountSimulatorLens } from './ui/screens/diagnose/simulator/index.js';
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
    // Declared in data/manifest.json. It cannot be derived from the look-through tree, because the
    // position the Ownership lens opens on lives in the firm-wide universe and is not in the tree.
    defaultPosition: selection.defaultPosition,
  });

  // The two lenses that need the 472 KiB universe share one loader, so whichever opens first pays
  // and the other is instant. Resolving also caches it on the store, which is what lets the Diagnose
  // entity search widen from this product's own funds to the whole firm.
  const loader = createUniverseLoader(selection.product, selection.asof);
  const universe = {
    peek: () => store.universe ?? loader.peek(),
    /*
     * The status is published on the store as the fetch moves, because the Diagnose entity search is
     * a list over TWO sources and has to be able to say which one it is missing: while this is
     * loading it can only offer this product's own funds, and if it fails it can only ever offer
     * those. A list that silently shows the smaller set is how a controller concludes a fund does
     * not exist (rubric R4).
     */
    get: async () => {
      store.set({ universeStatus: 'loading' });
      try {
        const fixture = await loader.get();
        store.universe = fixture;
        store.set({ universeStatus: 'ready' });
        return fixture;
      } catch (error: unknown) {
        store.set({ universeStatus: 'failed' });
        throw error;
      }
    },
  };

  const route = readRoute(location.hash);
  store.set({ screen: route.screen, ...(route.lens ? { lens: route.lens } : {}) });

  renderShell(root, store);
  wireShell(store);

  const screenHost = document.getElementById('screen');
  if (!screenHost) throw new Error('missing #screen');

  let unmount: (() => void) | null = null;

  function mountScreen(screen: ScreenId): void {
    unmount?.();
    unmount = null;
    const host = screenHost as HTMLElement;
    if (screen === 'reconciliation') {
      unmount = mountReconciliation(host, store) ?? null;
    } else if (screen === 'pricing') {
      unmount = mountPricing(host, store) ?? null;
    } else {
      unmount =
        mountDiagnose(host, store, universe, {
          structure: (h: HTMLElement, s: Store) => mountStructureLens(h, s),
          ownership: (h: HTMLElement, s: Store) => mountOwnershipLens(h, s, universe),
          'data-quality': (h: HTMLElement, s: Store) => mountDataQualityLens(h, s, universe),
          simulator: (h: HTMLElement, s: Store) => mountSimulatorLens(h, s),
        }) ?? null;
    }
    document.getElementById('screen')?.focus({ preventScroll: true });
  }

  mountScreen(store.state.screen);

  let currentScreen: ScreenId = store.state.screen;
  window.addEventListener('hashchange', () => {
    const next = readRoute(location.hash);
    store.set({ screen: next.screen, ...(next.lens ? { lens: next.lens as LensId } : {}) });
    if (next.screen !== currentScreen) {
      currentScreen = next.screen;
      mountScreen(next.screen);
    }
  });

  // Keep the URL in step when a screen is changed through the nav rather than the address bar.
  store.subscribe((state, changed) => {
    if (!changed.has('screen')) return;
    if (state.screen !== currentScreen) {
      currentScreen = state.screen;
      mountScreen(state.screen);
    }
    const want = routeToHash(state.screen, state.lens);
    if (location.hash !== want) location.hash = want;
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
  // Surfaced in the UI above, and re-thrown so the headless suite sees a real failure, not silence.
  throw error;
});
