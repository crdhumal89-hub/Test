'use strict';
/**
 * Done item 8: arrow keys move row focus in the Look-Through and Pricing tables,
 * Enter opens the detail drawer, Escape closes it.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

async function focusedRowId(frame, attr) {
  return frame.evaluate(a => {
    const el = document.activeElement;
    const tr = el && el.closest ? el.closest('tr') : null;
    return tr ? (tr.getAttribute(a) || tr.rowIndex) : null;
  }, attr);
}

test('Look-Through: arrows move row focus, Enter opens the drawer, Escape closes it', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    await app.expandAll();

    const first = await app.frame.$('#tree tbody tr.rowv');
    await first.focus();
    const idStart = await focusedRowId(app.frame, 'data-id');
    assert.ok(idStart != null, 'could not focus the first Look-Through row');

    await first.press('ArrowDown');
    await app.page.waitForTimeout(150);
    const idDown = await focusedRowId(app.frame, 'data-id');
    assert.notStrictEqual(idDown, idStart, 'ArrowDown did not move row focus');

    const focused = await app.frame.$('#tree tbody tr[data-id="' + idDown + '"]');
    await focused.press('ArrowUp');
    await app.page.waitForTimeout(150);
    const idUp = await focusedRowId(app.frame, 'data-id');
    assert.strictEqual(idUp, idStart, 'ArrowUp did not return focus to the previous row');

    const back = await app.frame.$('#tree tbody tr[data-id="' + idUp + '"]');
    await back.press('Enter');
    await app.page.waitForTimeout(350);
    let open = await app.frame.evaluate(() =>
      document.getElementById('ltdrawer').classList.contains('open'));
    assert.ok(open, 'Enter did not open the Look-Through detail drawer');

    // opening the drawer can re-render the table, so take a fresh handle
    const ltAfterEnter = await app.frame.$('#tree tbody tr.rowv');
    await ltAfterEnter.press('Escape');
    await app.page.waitForTimeout(350);
    open = await app.frame.evaluate(() =>
      document.getElementById('ltdrawer').classList.contains('open'));
    assert.ok(!open, 'Escape did not close the Look-Through detail drawer');

    console.log('    look-through: arrows, Enter and Escape all respond');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});

test('Pricing: arrows move row focus, Enter opens the drawer, Escape closes it', async () => {
  const app = await openApp();
  try {
    await app.tab('rfx');
    await app.frame.waitForSelector('#rectable .rectbl tbody tr');

    const rows = await app.frame.$$('#rectable .rectbl tbody tr');
    assert.ok(rows.length > 1, 'need at least two pricing rows to test arrow movement');

    await rows[0].focus();
    const startCode = await focusedRowId(app.frame, 'data-c');

    await rows[0].press('ArrowDown');
    await app.page.waitForTimeout(150);
    const downCode = await focusedRowId(app.frame, 'data-c');
    assert.notStrictEqual(downCode, startCode, 'ArrowDown did not move row focus in Pricing');

    const cur = await app.frame.$('#rectable .rectbl tbody tr[data-c="' + downCode + '"]');
    await cur.press('ArrowUp');
    await app.page.waitForTimeout(150);
    const upCode = await focusedRowId(app.frame, 'data-c');
    assert.strictEqual(upCode, startCode, 'ArrowUp did not return focus in Pricing');

    const back = await app.frame.$('#rectable .rectbl tbody tr[data-c="' + upCode + '"]');
    await back.press('Enter');
    await app.page.waitForTimeout(350);
    let open = await app.frame.evaluate(() =>
      document.getElementById('recdrawer').classList.contains('open'));
    assert.ok(open, 'Enter did not open the Pricing detail drawer');

    // selecting a pricing row re-renders the table, so take a fresh handle
    const rfxAfterEnter = await app.frame.$('#rectable .rectbl tbody tr');
    await rfxAfterEnter.press('Escape');
    await app.page.waitForTimeout(350);
    open = await app.frame.evaluate(() =>
      document.getElementById('recdrawer').classList.contains('open'));
    assert.ok(!open, 'Escape did not close the Pricing detail drawer');

    console.log('    pricing: arrows, Enter and Escape all respond');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
