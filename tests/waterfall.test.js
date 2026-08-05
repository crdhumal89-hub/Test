'use strict';
/**
 * Done item 7: the Look-Through tab leads with an interactive waterfall reading
 * Derived MV, delta Pricing, Revised MV, delta Non-position, NAV. Five segments render,
 * and clicking the delta Pricing segment filters the table below to only rows that
 * contribute to it.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

test('five waterfall segments render, in order, from live data', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    const res = await app.frame.evaluate(() => {
      const host = document.getElementById('ltwf');
      const segs = Array.from(host.querySelectorAll('[data-wf-seg]'));
      return {
        leadsTheTab: (function () {
          // the waterfall must sit above the table in document order
          const table = document.getElementById('lttablewrap');
          return !!(host.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
        })(),
        order: segs.map(s => s.getAttribute('data-wf-seg')),
        labels: segs.map(s => (s.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)),
        clickable: segs.every(s => s.getAttribute('role') === 'button' && s.tabIndex === 0),
        // values must come from the live REVISE figures, not from constants
        live: { D: REVISE.D, R: REVISE.R, N: REVISE.N }
      };
    });

    assert.ok(res.leadsTheTab, 'the waterfall must lead the tab, above the table');
    assert.deepStrictEqual(res.order,
      ['derived', 'dpricing', 'revised', 'dnonpos', 'nav'],
      'waterfall must read Derived MV, delta Pricing, Revised MV, delta Non-position, NAV');
    assert.strictEqual(res.order.length, 5, 'expected exactly 5 segments');
    assert.ok(res.clickable, 'every segment must be operable');

    // the rendered figures are the live ones
    const shown = res.labels.join(' ');
    const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
    assert.ok(shown.indexOf(fmt(res.live.D)) >= 0, 'Derived MV segment does not show the live value');
    assert.ok(shown.indexOf(fmt(res.live.R)) >= 0, 'Revised MV segment does not show the live value');
    assert.ok(shown.indexOf(fmt(res.live.N)) >= 0, 'NAV segment does not show the live value');

    console.log('    segments: ' + res.order.join(' -> '));
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});

test('clicking the delta Pricing segment filters the table to contributing rows only', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    await app.expandAll();

    const before = await app.frame.evaluate(() =>
      document.querySelectorAll('#tree tbody tr.rowv:not([style*="display: none"])').length);

    await app.frame.evaluate(() =>
      document.querySelector('#ltwf [data-wf-seg="dpricing"]').click());
    await app.page.waitForTimeout(700);

    const res = await app.frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
      const byId = {};
      MODEL.nodes.forEach(n => { byId[n.id] = n; });
      const visible = rows.filter(r => r.style.display !== 'none');
      const hidden = rows.filter(r => r.style.display === 'none');

      const visibleNonContributors = visible.filter(r => {
        const n = byId[r.getAttribute('data-id')];
        const d = revMVof(n) - liveMVof(n);
        return !(isFinite(d) && Math.abs(d) >= 0.005);
      }).map(r => (byId[r.getAttribute('data-id')] || {}).code);

      const hiddenContributors = hidden.filter(r => {
        const n = byId[r.getAttribute('data-id')];
        const d = revMVof(n) - liveMVof(n);
        return isFinite(d) && Math.abs(d) >= 0.005;
      }).map(r => (byId[r.getAttribute('data-id')] || {}).code);

      return {
        total: rows.length, visible: visible.length, hidden: hidden.length,
        visibleNonContributors: visibleNonContributors,
        hiddenContributors: hiddenContributors,
        segmentOn: document.querySelector('#ltwf [data-wf-seg="dpricing"]').classList.contains('wfon'),
        noteShown: !!document.getElementById('wfnote')
      };
    });

    assert.ok(res.hidden > 0, 'the filter hid nothing, so it is not filtering');
    assert.ok(res.visible > 0, 'the filter hid every row');
    assert.deepStrictEqual(res.visibleNonContributors, [],
      'rows with no delta Pricing contribution are still visible');
    assert.deepStrictEqual(res.hiddenContributors, [],
      'rows that do contribute to delta Pricing were hidden');
    assert.ok(res.segmentOn, 'the clicked segment is not marked active');
    assert.ok(res.noteShown, 'no filter status note was shown');

    // clicking again restores every row
    await app.frame.evaluate(() =>
      document.querySelector('#ltwf [data-wf-seg="dpricing"]').click());
    await app.page.waitForTimeout(700);
    const after = await app.frame.evaluate(() =>
      document.querySelectorAll('#tree tbody tr.rowv:not([style*="display: none"])').length);
    assert.strictEqual(after, before, 'clearing the filter did not restore every row');

    console.log('    filtered ' + res.total + ' rows down to ' + res.visible + ' contributors');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
