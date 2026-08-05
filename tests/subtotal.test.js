'use strict';
/**
 * Done item 2: every fund and SPV group in the Look-Through tree renders one subtotal
 * row, and each subtotal equals the sum of its direct children to the cent.
 *
 * The group's own row IS its subtotal row: it already carries the group's Derived MV.
 * Derived MV is the additive column (Revised MV and NAV are repriced per vehicle rather
 * than summed bottom-up, by design), so that is the column asserted.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

test('every group renders exactly one subtotal row that foots to its direct children', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    await app.expandAll();

    const res = await app.frame.evaluate(() => {
      const depth = p => p.split('/').filter(Boolean).length;
      const kidsOf = n => MODEL.nodes.filter(x =>
        x.path.startsWith(n.path) && x.id !== n.id && depth(x.path) === depth(n.path) + 1);

      const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
      const byId = {};
      MODEL.nodes.forEach(n => { byId[n.id] = n; });

      const groupsInModel = MODEL.nodes.filter(n => kidsOf(n).length > 0);
      const subRows = rows.filter(r => r.getAttribute('data-subtotal') === '1');

      const perId = {};
      subRows.forEach(r => {
        const k = r.getAttribute('data-id');
        perId[k] = (perId[k] || 0) + 1;
      });

      const checks = subRows.map(r => {
        const n = byId[r.getAttribute('data-id')];
        const kids = kidsOf(n);
        let sum = 0;
        kids.forEach(k => { sum += liveMVof(k); });
        const parent = liveMVof(n);
        return {
          code: n.code, level: n.level, kids: kids.length,
          parent: parent, sum: sum, diff: parent - sum,
          hasSubtotalCell: !!r.querySelector('td[data-subtotal-col="derived"]'),
          isGroupStyled: r.classList.contains('grouprow')
        };
      });

      return {
        renderedRows: rows.length,
        groupsInModel: groupsInModel.length,
        subtotalRows: subRows.length,
        duplicated: Object.keys(perId).filter(k => perId[k] > 1),
        nonGroupsMarked: subRows.filter(r => kidsOf(byId[r.getAttribute('data-id')]).length === 0).length,
        checks: checks
      };
    });

    assert.ok(res.renderedRows > 100, 'expected the expanded tree, got ' + res.renderedRows + ' rows');
    assert.ok(res.groupsInModel > 0, 'no groups found in the model');
    assert.strictEqual(res.subtotalRows, res.groupsInModel,
      'every group must render one subtotal row: ' + res.subtotalRows + ' marked vs ' +
      res.groupsInModel + ' groups');
    assert.deepStrictEqual(res.duplicated, [], 'a group rendered more than one subtotal row');
    assert.strictEqual(res.nonGroupsMarked, 0, 'a leaf row was marked as a subtotal');

    const bad = res.checks.filter(c => Math.abs(c.diff) >= 0.005);
    assert.deepStrictEqual(bad, [],
      'subtotal must equal the sum of its direct children to the cent; offenders: ' +
      JSON.stringify(bad.slice(0, 5), null, 1));

    const noCell = res.checks.filter(c => !c.hasSubtotalCell);
    assert.deepStrictEqual(noCell.map(c => c.code), [], 'subtotal row without a marked Derived MV cell');
    const unstyled = res.checks.filter(c => !c.isGroupStyled);
    assert.deepStrictEqual(unstyled.map(c => c.code), [], 'subtotal row not styled as a group block');

    console.log('    ' + res.subtotalRows + ' group subtotals, all foot to the cent');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
