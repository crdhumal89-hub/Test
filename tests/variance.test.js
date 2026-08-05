'use strict';
/**
 * Cycle 1: position-variance exceptions.
 *
 * Covers the shipped behaviour: the chip, the on-demand panel, the exact exception set,
 * the figures inside it, the tree marker, and the two ways of closing it. Also pins the
 * property the whole cycle depends on: the default view gains no rendered figure.
 */
const test = require('node:test');
const assert = require('node:assert');
const { openApp, assertNoConsoleErrors } = require('./harness');

const THRESHOLD = 10;

/** The exception set, computed here rather than read from the feature under test. */
async function expectedBreaches(frame) {
  return frame.evaluate(t => {
    const first = new Map();
    EMB.nodes.forEach(n => {
      if (n.kind !== 'vehicle' && n.kind !== 'apex') return;
      if (!first.has(n.code)) first.set(n.code, n);
    });
    const out = [];
    first.forEach((n, code) => {
      if (!n.derived) return;
      const bps = (n.derived - n.position) / n.derived * 1e4;
      if (Math.abs(bps) > t) {
        out.push({ code, derived: n.derived, position: n.position,
                   diff: n.derived - n.position, bps });
      }
    });
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }, THRESHOLD);
}

test('the variance chip is present and the panel stays shut until asked for', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    const s = await app.frame.evaluate(() => {
      const btn = document.getElementById('ltvarbtn');
      const panel = document.getElementById('ltvarpanel');
      return {
        chip: !!btn,
        chipText: btn ? (btn.innerText || '').trim() : null,
        chipInFlagstrip: !!(btn && btn.closest('#ltflags')),
        expanded: btn ? btn.getAttribute('aria-expanded') : null,
        panelExists: !!panel,
        panelHidden: panel ? panel.hidden : null,
        bodyRows: panel ? panel.querySelectorAll('tbody tr').length : -1
      };
    });
    assert.ok(s.chip, 'no position variance chip rendered');
    assert.ok(s.chipInFlagstrip, 'the chip must sit with the other exception flags');
    assert.strictEqual(s.expanded, 'false', 'the chip should start collapsed');
    assert.ok(s.panelExists, 'the panel element should exist');
    assert.strictEqual(s.panelHidden, true, 'the panel must start hidden');
    assert.strictEqual(s.bodyRows, 0, 'the panel must render nothing before it is opened');

    // the whole cycle rests on this: the chip adds no digit to the default view
    assert.ok(!/\d/.test(s.chipText),
      'the chip must not carry a number, or it would change the figure snapshot: ' + s.chipText);

    assertNoConsoleErrors(app, assert);
  } finally { await app.close(); }
});

test('opening the panel lists exactly the SPVs breaching the threshold', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    const expected = await expectedBreaches(app.frame);
    assert.ok(expected.length >= 5,
      'fixture should contain a meaningful number of breaches, saw ' + expected.length);

    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(300);

    const got = await app.frame.evaluate(() => {
      const panel = document.getElementById('ltvarpanel');
      return {
        hidden: panel.hidden,
        expanded: document.getElementById('ltvarbtn').getAttribute('aria-expanded'),
        scrollBoxIsScrollable: (() => {
          const s = document.getElementById('ltvarwrap');
          return !!s && getComputedStyle(s).overflowY === 'auto';
        })(),
        rows: Array.from(panel.querySelectorAll('tbody tr[data-var-code]')).map(tr => ({
          code: tr.getAttribute('data-var-code'),
          cells: Array.from(tr.cells).map(c => (c.innerText || '').replace(/\s+/g, ' ').trim())
        }))
      };
    });

    assert.strictEqual(got.hidden, false, 'the panel did not open');
    assert.strictEqual(got.expanded, 'true', 'aria-expanded was not updated');
    assert.ok(got.scrollBoxIsScrollable, '#ltvarwrap must be the scrollable element');

    const gotCodes = got.rows.map(r => r.code).sort();
    const expCodes = expected.map(e => e.code).sort();
    assert.deepStrictEqual(gotCodes, expCodes,
      'the panel must list exactly the breaching SPVs');

    // no SPV below the threshold leaked in
    const below = await app.frame.evaluate(t => {
      const first = new Map();
      EMB.nodes.forEach(n => {
        if (n.kind !== 'vehicle' && n.kind !== 'apex') return;
        if (!first.has(n.code)) first.set(n.code, n);
      });
      const out = [];
      first.forEach((n, code) => {
        if (!n.derived) return;
        if (Math.abs((n.derived - n.position) / n.derived * 1e4) <= t) out.push(code);
      });
      return out;
    }, THRESHOLD);
    below.forEach(c => assert.ok(gotCodes.indexOf(c) < 0,
      c + ' is within threshold but was listed as an exception'));

    // sorted by absolute bps, largest first
    const order = got.rows.map(r => {
      const e = expected.find(x => x.code === r.code);
      return Math.abs(e.bps);
    });
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i] <= order[i - 1] + 1e-9,
        'rows must be ordered by absolute bps descending');
    }

    console.log('    ' + gotCodes.length + ' SPVs listed, worst ' +
                Math.round(Math.max(...order)) + ' bps');
    assertNoConsoleErrors(app, assert);
  } finally { await app.close(); }
});

test('each listed figure matches the node values, difference to the cent', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    const expected = await expectedBreaches(app.frame);
    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(300);

    const rows = await app.frame.evaluate(() =>
      Array.from(document.querySelectorAll('#ltvarpanel tbody tr[data-var-code]')).map(tr => ({
        code: tr.getAttribute('data-var-code'),
        derived: tr.cells[1].innerText.trim(),
        position: tr.cells[2].innerText.trim(),
        diff: tr.cells[3].innerText.trim(),
        bps: tr.cells[4].innerText.trim()
      })));

    const money = s => {
      const neg = /^\(/.test(s);
      const n = parseFloat(String(s).replace(/[()$,\s]/g, ''));
      return neg ? -n : n;
    };

    for (const r of rows) {
      const e = expected.find(x => x.code === r.code);
      assert.ok(e, 'unexpected row ' + r.code);
      assert.strictEqual(money(r.derived), Math.round(e.derived),
        r.code + ' derived MV mismatch');
      assert.strictEqual(money(r.position), Math.round(e.position),
        r.code + ' position MV mismatch');
      // the shown difference must equal derived minus position to the cent
      assert.ok(Math.abs(money(r.diff) - Math.round(e.diff)) < 0.005,
        r.code + ' difference is not derived minus position: ' + r.diff);
      assert.ok(Math.abs(parseFloat(r.bps) - e.bps) < 0.05,
        r.code + ' bps mismatch: ' + r.bps + ' vs ' + e.bps.toFixed(1));
    }
    console.log('    ' + rows.length + ' rows tie to their node values');
    assertNoConsoleErrors(app, assert);
  } finally { await app.close(); }
});

test('breaching SPV rows carry a non-numeric marker in the tree', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    await app.expandAll();
    const expected = await expectedBreaches(app.frame);
    const codes = expected.map(e => e.code);

    const s = await app.frame.evaluate(exp => {
      const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
      let markedNonBreach = [], missingMark = [], markerText = '';
      rows.forEach(tr => {
        const k = tr.getAttribute('data-kind');
        if (k !== 'vehicle' && k !== 'apex') return;
        const tag = tr.querySelector('.codetag');
        if (!tag) return;
        const code = tag.textContent.trim();
        const marked = tr.classList.contains('varbreach');
        const hasMark = !!tr.querySelector('.varmark');
        if (exp.indexOf(code) >= 0) {
          if (!marked || !hasMark) missingMark.push(code);
          if (hasMark) markerText += tr.querySelector('.varmark').textContent;
        } else if (marked) {
          markedNonBreach.push(code);
        }
      });
      return { missingMark, markedNonBreach, markerText };
    }, codes);

    assert.deepStrictEqual(s.missingMark, [], 'breaching rows without a marker');
    assert.deepStrictEqual(s.markedNonBreach, [], 'non-breaching rows were marked');
    assert.strictEqual(s.markerText, '',
      'the marker must contain no text, or it could add a figure to the snapshot');

    console.log('    marker present on every breaching row, and on no other');
    assertNoConsoleErrors(app, assert);
  } finally { await app.close(); }
});

test('the chip toggles the panel and Escape closes it', async () => {
  const app = await openApp();
  try {
    await app.tab('lt');
    const isOpen = () => app.frame.evaluate(() =>
      !document.getElementById('ltvarpanel').hidden);

    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(220);
    assert.strictEqual(await isOpen(), true, 'chip did not open the panel');

    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(220);
    assert.strictEqual(await isOpen(), false, 'chip did not close the panel');

    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(220);
    assert.strictEqual(await isOpen(), true, 'chip did not reopen the panel');

    // focus sits on the chip the user just pressed, so that is where Escape lands
    const chip = await app.frame.$('#ltvarbtn');
    await chip.press('Escape');
    await app.page.waitForTimeout(250);
    assert.strictEqual(await isOpen(), false, 'Escape did not close the panel');

    // the Close button works too
    await app.frame.evaluate(() => document.getElementById('ltvarbtn').click());
    await app.page.waitForTimeout(220);
    await app.frame.evaluate(() => document.getElementById('ltvarclose').click());
    await app.page.waitForTimeout(220);
    assert.strictEqual(await isOpen(), false, 'the Close button did not close the panel');

    assertNoConsoleErrors(app, assert);
  } finally { await app.close(); }
});
