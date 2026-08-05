'use strict';
/**
 * Done item 3: hierarchy depth is encoded by a persistent left rail with at least five
 * visually distinct levels, and level is also exposed as a data-level attribute.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

test('depth is a persistent left rail with 5+ distinct levels and a data-level attribute', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    await app.expandAll();

    const res = await app.frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
      const byId = {};
      MODEL.nodes.forEach(n => { byId[n.id] = n; });

      const levels = {}, chipColour = {}, missingRail = [], mismatched = [];
      rows.forEach(r => {
        const lv = r.getAttribute('data-level');
        if (lv == null) { mismatched.push('row ' + r.getAttribute('data-id') + ' has no data-level'); return; }
        const n = byId[r.getAttribute('data-id')];
        if (n && String(n.level) !== lv) {
          mismatched.push('row ' + n.code + ' data-level ' + lv + ' but model level ' + n.level);
        }
        levels[lv] = (levels[lv] || 0) + 1;

        const rail = r.querySelector('.lvrail');
        const chip = r.querySelector('.lvrail .lvchip');
        if (!rail || !chip) { missingRail.push(r.getAttribute('data-id')); return; }
        // the rail carries one guide per ancestor level, so it encodes depth structurally
        const guides = rail.querySelectorAll('i').length;
        if (guides !== Number(lv)) {
          mismatched.push('row ' + (n && n.code) + ' rail has ' + guides + ' guides at level ' + lv);
        }
        if (!chipColour[lv]) chipColour[lv] = getComputedStyle(chip).backgroundColor;
      });

      return {
        rowCount: rows.length,
        levelsPresent: Object.keys(levels).map(Number).sort((a, b) => a - b),
        distinctColours: Array.from(new Set(Object.values(chipColour))),
        colourByLevel: chipColour,
        missingRail: missingRail,
        mismatched: mismatched
      };
    });

    assert.deepStrictEqual(res.missingRail, [], 'rows without a left rail');
    assert.deepStrictEqual(res.mismatched, [], 'data-level / rail mismatches');
    assert.ok(res.levelsPresent.length >= 5,
      'expected at least 5 hierarchy levels, saw ' + JSON.stringify(res.levelsPresent));
    assert.ok(res.distinctColours.length >= 5,
      'the rail must be visually distinct across at least 5 levels, saw ' +
      res.distinctColours.length + ': ' + JSON.stringify(res.colourByLevel));

    console.log('    levels ' + JSON.stringify(res.levelsPresent) + ', ' +
                res.distinctColours.length + ' distinct rail colours');
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
