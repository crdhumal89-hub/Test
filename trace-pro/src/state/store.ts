/**
 * The one place mutable application state lives, and the only thing that notifies on change.
 *
 * The original kept 55 top-level `let`s in one scope, so any function could move any state and no
 * render knew why it was running. Here a screen reads state and subscribes; nothing else mutates.
 *
 * `selectedEntity` is shared by all four Diagnose lenses. That is the point of the Diagnose screen:
 * suspecting a fund once and inspecting it four ways must not cost four searches (rubric R16).
 */
import type { CoreFixtures } from '../data/load.js';
import type { PricingView, RepricingFixture, UniverseFixture } from '../domain/types.js';
import { defaultExpansion } from '../domain/lookthrough.js';

export type ScreenId = 'reconciliation' | 'pricing' | 'diagnose';
export type LensId = 'structure' | 'ownership' | 'data-quality' | 'simulator';
export type DrawerId = 'glossary' | 'sources' | null;

export interface AppState {
  /** Identity of what is being reported on. */
  product: string;
  productName: string;
  productCode: string;
  asof: string;

  screen: ScreenId;
  lens: LensId;
  drawer: DrawerId;
  view: PricingView;

  /** Reconciliation screen. */
  expandedNodes: ReadonlySet<number>;
  selectedNodeId: number | null;

  /** Pricing screen. */
  pricingSort: { column: string; direction: 1 | -1 };
  pricingFilter: string;
  pricingSubview: 'table' | 'walk';
  walkSort: { column: string; direction: 1 | -1 };
  selectedFundCode: string | null;

  /** Diagnose screen — shared across all four lenses. */
  selectedEntity: string | null;
  issueScope: string | null;
  issueScopeLabel: string;
  ownerExpanded: ReadonlySet<string>;
  showAllUltimateOwners: boolean;

  /** Glossary drawer. */
  glossaryQuery: string;
  glossaryGroup: string;
  glossaryFocusTerm: string | null;
}

export interface Store {
  readonly state: Readonly<AppState>;
  readonly core: CoreFixtures;
  readonly repricing: RepricingFixture;
  universe: UniverseFixture | null;
  set(patch: Partial<AppState>): void;
  subscribe(listener: (state: Readonly<AppState>, changed: ReadonlySet<keyof AppState>) => void): () => void;
  /** Replace the repricing model after an upload recomputes it. */
  setRepricing(next: RepricingFixture): void;
}

export interface StoreInit {
  core: CoreFixtures;
  product: string;
  productName: string;
  productCode: string;
  asof: string;
  /** The position the Ownership lens opens on. A fixture field, not a hard-coded literal. */
  defaultPosition: string;
}

export function createStore(init: StoreInit): Store {
  let repricing = init.core.repricing;
  let universe: UniverseFixture | null = null;

  const state: AppState = {
    product: init.product,
    productName: init.productName,
    productCode: init.productCode,
    asof: init.asof,

    screen: 'reconciliation',
    lens: 'structure',
    drawer: null,
    view: 'before',

    expandedNodes: defaultExpansion(init.core.lookthrough.nodes),
    selectedNodeId: null,

    pricingSort: { column: 'nav', direction: -1 },
    pricingFilter: '',
    pricingSubview: 'table',
    walkSort: { column: 'level', direction: -1 },
    selectedFundCode: null,

    selectedEntity: init.defaultPosition,
    issueScope: null,
    issueScopeLabel: 'All fund entities',
    ownerExpanded: new Set<string>(),
    showAllUltimateOwners: false,

    glossaryQuery: '',
    glossaryGroup: 'all',
    glossaryFocusTerm: null,
  };

  const listeners = new Set<(s: Readonly<AppState>, changed: ReadonlySet<keyof AppState>) => void>();

  function notify(changed: Set<keyof AppState>): void {
    for (const listener of [...listeners]) listener(state, changed);
  }

  return {
    get state() {
      return state;
    },
    get core() {
      return init.core;
    },
    get repricing() {
      return repricing;
    },
    get universe() {
      return universe;
    },
    set universe(next: UniverseFixture | null) {
      universe = next;
    },
    set(patch: Partial<AppState>): void {
      const changed = new Set<keyof AppState>();
      for (const [key, value] of Object.entries(patch) as [keyof AppState, never][]) {
        if (state[key] === value) continue;
        state[key] = value;
        changed.add(key);
      }
      if (changed.size) notify(changed);
    },
    setRepricing(next: RepricingFixture): void {
      repricing = next;
      notify(new Set<keyof AppState>(['product']));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Read the screen and lens out of the URL hash so a screen is linkable. */
export function readRoute(hash: string): { screen: ScreenId; lens?: LensId } {
  const clean = hash.replace(/^#\/?/, '');
  const [screen, lens] = clean.split('/');
  const screens: ScreenId[] = ['reconciliation', 'pricing', 'diagnose'];
  const lenses: LensId[] = ['structure', 'ownership', 'data-quality', 'simulator'];
  const s = screens.includes(screen as ScreenId) ? (screen as ScreenId) : 'reconciliation';
  const l = lenses.includes(lens as LensId) ? (lens as LensId) : undefined;
  return l ? { screen: s, lens: l } : { screen: s };
}

export function routeToHash(screen: ScreenId, lens: LensId): string {
  return screen === 'diagnose' ? `#/diagnose/${lens}` : `#/${screen}`;
}
