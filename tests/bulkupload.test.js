'use strict';
/**
 * Done item 5: a bulk override upload accepts a CSV of SPV code plus new market value
 * or new NAV, applies it through the existing calculation path, and shows per-SPV delta
 * and product NAV before and after.
 *
 * The identity asserted is the one that matters to a controller: the product delta the
 * tool reports equals the sum of the propagated per-SPV deltas, to the cent.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { openApp, assertNoConsoleErrors } = require('./harness');

const FIXTURE = path.resolve('fixtures/overrides_12.csv');

test('a 12-row override file prices through the engine and foots to the cent', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');

    await app.frame.setInputFiles('#bofile', FIXTURE);
    await app.frame.waitForFunction(
      () => window.__phase1 && window.__phase1.lastOverride, null, { timeout: 15000 });

    const res = await app.frame.evaluate(() => {
      const r = window.__phase1.lastOverride;
      return {
        accepted: r.accepted.length,
        rejected: r.rejected.length,
        codes: r.accepted.map(a => a.code),
        kinds: r.accepted.map(a => a.kind),
        before: r.before, after: r.after,
        deltaRev: r.deltaRev, deltaNav: r.deltaNav,
        sumRowRev: r.sumRowRev, sumRowNav: r.sumRowNav,
        perRow: r.accepted.map(a => ({ code: a.code, dRev: a.dRev, dNav: a.dNav })),
        // the report must be on screen
        reportVisible: !document.getElementById('boout').hidden,
        rowsInReport: document.querySelectorAll('#boout tbody tr[data-ov-code]').length,
        cards: Array.from(document.querySelectorAll('#boout .bo-card .l')).map(e => e.textContent),
        rejectedPanelHidden: document.getElementById('borej').hidden
      };
    });

    assert.strictEqual(res.accepted, 12, 'expected all 12 fixture rows to be priced');
    assert.strictEqual(res.rejected, 0, 'no fixture row should be rejected');
    assert.ok(res.reportVisible, 'the override report is not displayed');
    assert.strictEqual(res.rowsInReport, 12, 'the report must show one line per SPV');
    assert.ok(res.rejectedPanelHidden, 'rejected panel should stay hidden for a clean file');

    // product NAV, before and after, is on screen
    assert.ok(res.cards.some(c => /product nav/i.test(c)),
      'the report must show product NAV before and after; cards: ' + JSON.stringify(res.cards));

    // the deltas must be real, or the identity below would be vacuous
    assert.ok(Math.abs(res.deltaNav) > 1,
      'product NAV delta is ~0, the fixture is not exercising the calculation');
    assert.ok(Math.abs(res.deltaRev) > 1,
      'revised MV delta is ~0, the fixture is not exercising the calculation');

    // THE identity: product delta == sum of propagated per-SPV deltas, to the cent
    assert.ok(Math.abs(res.deltaNav - res.sumRowNav) < 0.005,
      'product NAV delta ' + res.deltaNav + ' != sum of per-SPV deltas ' + res.sumRowNav +
      ' (diff ' + (res.deltaNav - res.sumRowNav) + ')');
    assert.ok(Math.abs(res.deltaRev - res.sumRowRev) < 0.005,
      'revised MV delta ' + res.deltaRev + ' != sum of per-SPV deltas ' + res.sumRowRev +
      ' (diff ' + (res.deltaRev - res.sumRowRev) + ')');

    // before + delta == after, straight from the engine
    assert.ok(Math.abs((res.before.nav + res.deltaNav) - res.after.nav) < 0.005,
      'product NAV before + delta != after');
    assert.ok(Math.abs((res.before.rev + res.deltaRev) - res.after.rev) < 0.005,
      'revised MV before + delta != after');

    console.log('    12 marks: product NAV ' + res.before.nav.toFixed(2) + ' -> ' +
                res.after.nav.toFixed(2) + ' (delta ' + res.deltaNav.toFixed(2) +
                ', sum of per-SPV ' + res.sumRowNav.toFixed(2) + ')');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});

test('the override baseline reproduces the live engine exactly at zero overrides', async () => {
  const app = await openApp();
  try {
    // If the struct handed to recomputeR did not match the app's own state, every delta
    // above would be measured from the wrong starting point.
    const res = await app.frame.evaluate(() => {
      const m = window.__phase1.metricsFor([]);
      return { mine: m.rev, live: REVISE.R, mineNav: m.nav, liveNav: REVISE.N };
    });
    assert.ok(Math.abs(res.mine - res.live) < 0.005,
      'override engine baseline ' + res.mine + ' != live Revised MV ' + res.live);
    assert.ok(Math.abs(res.mineNav - res.liveNav) < 0.005,
      'override engine NAV ' + res.mineNav + ' != live product NAV ' + res.liveNav);
    console.log('    baseline ties to the live engine: ' + res.mine.toFixed(2));
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
