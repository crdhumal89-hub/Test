/**
 * What the Simulator lens SHOWS per node, as opposed to what the cascade computes.
 *
 * Split out of the lens for one boring reason and one real one: the lens was one line under the
 * 400-line limit, and these two functions are pure reads of the fixture that no state of the lens
 * needs to own. Both were `simBaseVal` / `simBasePx` and the concentration ranking inline in the
 * original's simulator.
 */
import type { PricingView, SimulatorFixture } from '../../../../domain/types.js';
import type { Store } from '../../../../state/store.js';

/** Where product NAV is concentrated, from the top-level feeders. Pure. */
export function simulatorConcentration(fixture: SimulatorFixture): { code: string; share: number }[] {
  const total = fixture.apex.reduce((sum, code) => sum + Math.abs(fixture.funds[code]?.nav ?? 0), 0) || 1;
  const nav = (code: string): number => Math.abs(fixture.funds[code]?.nav ?? 0);
  return fixture.apex.map((code) => ({ code, share: nav(code) / total })).sort((a, b) => b.share - a.share);
}

/** Display value and price per node, per pricing basis. Was `simBaseVal` / `simBasePx`. */
export function simulatorDisplay(store: Store, fixture: SimulatorFixture, view: PricingView) {
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
