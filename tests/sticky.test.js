'use strict';
/**
 * Done item 4: the hierarchy column and the NAV column stay pinned when the table is
 * scrolled fully right. Asserted at maximum scrollLeft, in a viewport narrow enough
 * that the table genuinely overflows.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

test('hierarchy and NAV columns stay in view at maximum horizontal scroll', async () => {
  const app = await openApp({ viewport: { width: 900, height: 900 } });
  try {
    await app.tab('lt');
    await app.expandAll();

    const res = await app.frame.evaluate(() => {
      const wrap = document.getElementById('lttablewrap');
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      wrap.scrollLeft = maxScroll;
      // force layout so the sticky offsets settle before measuring
      void wrap.offsetWidth;

      const row = document.querySelector('#tree tbody tr.rowv');
      const head = document.querySelector('#tree thead tr');
      const wr = wrap.getBoundingClientRect();

      function probe(cell) {
        const r = cell.getBoundingClientRect();
        const cs = getComputedStyle(cell);
        return {
          position: cs.position,
          left: Math.round(r.left), right: Math.round(r.right),
          width: Math.round(r.width),
          insideViewport: r.left >= wr.left - 1 && r.right <= wr.right + 1 && r.width > 0,
          text: (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)
        };
      }

      return {
        overflowed: maxScroll > 0,
        maxScroll: maxScroll,
        actualScrollLeft: wrap.scrollLeft,
        container: { left: Math.round(wr.left), right: Math.round(wr.right) },
        hierarchyCell: probe(row.cells[0]),
        navCell: probe(row.cells[2]),
        hierarchyHead: probe(head.cells[0]),
        navHead: probe(head.cells[2]),
        // the columns must not overlap each other while pinned
        noOverlap: row.cells[0].getBoundingClientRect().right <=
                   row.cells[2].getBoundingClientRect().left + 1
      };
    });

    assert.ok(res.overflowed,
      'the table must overflow horizontally for this test to mean anything (maxScroll=' +
      res.maxScroll + ')');
    assert.strictEqual(res.actualScrollLeft, res.maxScroll, 'did not reach maximum scrollLeft');

    assert.strictEqual(res.hierarchyCell.position, 'sticky', 'hierarchy cell is not sticky');
    assert.strictEqual(res.navCell.position, 'sticky', 'NAV cell is not sticky');

    assert.ok(res.hierarchyCell.insideViewport,
      'hierarchy column left the viewport at max scroll: ' + JSON.stringify(res.hierarchyCell) +
      ' container ' + JSON.stringify(res.container));
    assert.ok(res.navCell.insideViewport,
      'NAV column left the viewport at max scroll: ' + JSON.stringify(res.navCell) +
      ' container ' + JSON.stringify(res.container));

    assert.ok(res.hierarchyHead.insideViewport, 'hierarchy header left the viewport');
    assert.ok(res.navHead.insideViewport, 'NAV header left the viewport');
    assert.ok(res.noOverlap, 'pinned hierarchy and NAV columns overlap');

    console.log('    scrolled ' + res.maxScroll + 'px; hierarchy @' + res.hierarchyCell.left +
                ', NAV @' + res.navCell.left + ' both inside ' + JSON.stringify(res.container));
    assertNoConsoleErrors(app, assert);
  } finally {
    await app.close();
  }
});
