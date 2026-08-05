'use strict';
/**
 * Done item 6: any upload row whose code does not match a known SPV appears in a
 * rejected-rows table with the reason, and is never silently dropped.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { openApp, assertNoConsoleErrors } = require('./harness');

const FIXTURE = path.resolve('fixtures/overrides_rejected.csv');
const UNMATCHED = ['NOTAREALSPV', 'SPORTB_TYPO', 'ZZZ999'];

test('three unmatched codes all surface with reasons and none reach the calculation', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');

    await app.frame.setInputFiles('#bofile', FIXTURE);
    await app.frame.waitForFunction(
      () => window.__phase1 && window.__phase1.lastOverride, null, { timeout: 15000 });

    const res = await app.frame.evaluate(unmatched => {
      const r = window.__phase1.lastOverride;
      const rejTable = document.getElementById('borejtab');
      const domRows = rejTable
        ? Array.from(rejTable.querySelectorAll('tbody tr')).map(tr => ({
            code: tr.getAttribute('data-rej-code'),
            text: (tr.innerText || '').replace(/\s+/g, ' ').trim(),
            reason: (tr.querySelector('.bo-reason') || {}).textContent || ''
          }))
        : [];
      return {
        rejectedCount: r.rejected.length,
        rejectedCodes: r.rejected.map(x => x.code),
        rejectedReasons: r.rejected.map(x => x.reason),
        acceptedCodes: r.accepted.map(x => x.code),
        panelVisible: !document.getElementById('borej').hidden,
        domRows: domRows,
        // could the engine even see these codes?
        knownToEngine: unmatched.filter(c => window.__phase1.ovStruct().scope.has(c)),
        // recomputing with only the accepted rows must reproduce the reported result
        replay: (function () {
          const m = window.__phase1.metricsFor(r.accepted.map(a => ({
            code: a.code, kind: a.kind, value: a.value
          })));
          return { rev: m.rev, nav: m.nav };
        })(),
        reported: r.after
      };
    }, UNMATCHED);

    assert.strictEqual(res.rejectedCount, 3,
      'expected exactly 3 rejected rows, got ' + res.rejectedCount +
      ': ' + JSON.stringify(res.rejectedCodes));
    assert.ok(res.panelVisible, 'the rejected-rows table is not displayed');
    assert.strictEqual(res.domRows.length, 3, 'the rejected table must render all 3 rows');

    for (const code of UNMATCHED) {
      assert.ok(res.rejectedCodes.indexOf(code) >= 0, code + ' was silently dropped');
      const row = res.domRows.find(r => r.code === code);
      assert.ok(row, code + ' is missing from the rejected-rows table');
      assert.ok(row.reason && row.reason.trim().length > 0, code + ' has no reason given');
      assert.ok(/unknown SPV code/i.test(row.reason),
        code + ' reason should say the code is unknown, got: ' + row.reason);
      assert.ok(res.acceptedCodes.indexOf(code) < 0, code + ' reached the calculation');
    }

    assert.deepStrictEqual(res.knownToEngine, [],
      'an unmatched code is actually known to the engine, the fixture is wrong');

    // no near-match coercion: SPORTB_TYPO must NOT have been snapped to SPORTB
    assert.ok(res.acceptedCodes.indexOf('SPORTB') < 0,
      'SPORTB_TYPO was coerced to the near-match SPORTB');

    // the two valid rows still applied, and the reported product figures are exactly
    // what the engine returns for the accepted set alone
    assert.strictEqual(res.acceptedCodes.length, 2,
      'the valid rows should still apply: ' + JSON.stringify(res.acceptedCodes));
    assert.ok(Math.abs(res.replay.nav - res.reported.nav) < 0.005,
      'reported product NAV includes something other than the accepted rows');
    assert.ok(Math.abs(res.replay.rev - res.reported.rev) < 0.005,
      'reported revised MV includes something other than the accepted rows');

    console.log('    rejected ' + JSON.stringify(res.rejectedCodes) +
                ', applied ' + JSON.stringify(res.acceptedCodes));
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
