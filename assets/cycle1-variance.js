/* ==========================================================================
   Cycle 1 - position-variance exceptions.

   Problem this solves: every node already carries a derived MV and a position
   MV, but the two are only ever shown together inside the per-SPV detail
   drawer. Twenty of the twenty-six SPVs in this product differ by more than
   10 bps, the largest by $25.5m, and the only way to find them today is to
   open twenty-six drawers one at a time. That is a break the tool hides.

   Nothing here computes a valuation. It reads node.derived and node.position,
   which the engine already produced, and reports their difference. No figure
   is rendered until the controller opens the panel, so the default view of
   every tab is numerically unchanged.
   ========================================================================== */
(function () {
  'use strict';

  var THRESHOLD_BPS = 10;
  var PANEL_ID = 'ltvarpanel';
  var SCROLL_ID = 'ltvarwrap';
  var BTN_ID = 'ltvarbtn';
  var open = false;
  var painted = false;

  function warn(where, e) {
    window.__cycle1Errors = window.__cycle1Errors || [];
    window.__cycle1Errors.push(where + ': ' + (e && e.message ? e.message : String(e)));
    if (window.console && console.warn) console.warn('[cycle1] ' + where, e);
  }

  /**
   * One entry per distinct SPV code, taken from its first occurrence in the
   * look-through, which is the same rule the drawer shows and the harness
   * checks against.
   */
  function varianceRows() {
    var first = new Map();
    (EMB.nodes || []).forEach(function (n) {
      if (n.kind !== 'vehicle' && n.kind !== 'apex') return;
      if (!first.has(n.code)) first.set(n.code, n);
    });
    var out = [];
    first.forEach(function (n, code) {
      if (!n.derived) return;
      var diff = n.derived - n.position;
      var bps = diff / n.derived * 1e4;
      if (Math.abs(bps) <= THRESHOLD_BPS) return;
      out.push({ code: code, name: n.name || code, kind: n.kind,
                 derived: n.derived, position: n.position, diff: diff, bps: bps });
    });
    out.sort(function (a, b) { return Math.abs(b.bps) - Math.abs(a.bps); });
    return out;
  }

  var breachSet = null;
  function breaching() {
    if (!breachSet) {
      breachSet = new Set();
      try { varianceRows().forEach(function (r) { breachSet.add(r.code); }); }
      catch (e) { warn('breaching', e); }
    }
    return breachSet;
  }

  /* ------------------------------------------------------------- panel --- */
  function ensurePanel() {
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    var flags = document.getElementById('ltflags');
    if (!flags || !flags.parentNode) return null;
    var el = document.createElement('div');
    el.className = 'ltvar';
    el.id = PANEL_ID;
    el.hidden = true;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Position variance exceptions');
    // the inner div carries the id the scroll happens on, so callers that scroll
    // "the variance table" address the element that actually scrolls
    el.innerHTML =
      '<div class="ltvar-h">' +
        '<b>Position variance</b>' +
        '<span class="sub">SPVs whose derived MV differs from position MV by more than ' +
          THRESHOLD_BPS + ' bps, largest first. Derived MV is the look-through at current ' +
          'marks; position MV is the holding as booked in the position report.</span>' +
        '<button type="button" id="ltvarclose">Close</button>' +
      '</div>' +
      '<div class="ltvar-scroll" id="' + SCROLL_ID + '"><table class="ltvartab"><thead><tr>' +
        '<th class="l">SPV</th><th>Derived MV</th><th>Position MV</th>' +
        '<th>Difference</th><th>bps</th>' +
      '</tr></thead><tbody></tbody></table></div>';
    flags.parentNode.insertBefore(el, flags.nextSibling);
    var close = el.querySelector('#ltvarclose');
    if (close) close.addEventListener('click', function () { setOpen(false); });
    return el;
  }

  function paint() {
    var el = document.getElementById(PANEL_ID);
    if (!el) return;
    var tb = el.querySelector('tbody');
    var rows = varianceRows();
    if (!rows.length) {
      tb.innerHTML = '<tr><td class="l ltvar-empty" colspan="5">' +
        'No SPV differs by more than ' + THRESHOLD_BPS + ' bps.</td></tr>';
      painted = true;
      return;
    }
    var h = '';
    rows.forEach(function (r) {
      var cls = r.diff < 0 ? 'neg' : 'pos';
      h += '<tr data-var-code="' + r.code + '">' +
        '<td class="l"><span class="code">' + r.code + '</span>' +
          '<span class="nm">' + r.name + '</span></td>' +
        '<td>' + U(r.derived) + '</td>' +
        '<td>' + U(r.position) + '</td>' +
        '<td class="' + cls + '">' + Uv(r.diff) + '</td>' +
        '<td class="bps ' + cls + '">' + (r.bps >= 0 ? '+' : '') + r.bps.toFixed(1) + '</td>' +
      '</tr>';
    });
    tb.innerHTML = h;
    painted = true;
  }

  function setOpen(next) {
    var el = ensurePanel();
    var btn = document.getElementById(BTN_ID);
    if (!el) return;
    open = !!next;
    if (open && !painted) paint();          // nothing is rendered until it is asked for
    el.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* --------------------------------------------------------------- chip --- */
  function addChip() {
    var host = document.getElementById('ltflags');
    if (!host || document.getElementById(BTN_ID)) return;
    var n = breaching().size;
    if (!n) return;                          // nothing to flag
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'flagchip varflag';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-controls', PANEL_ID);
    btn.title = 'Derived MV differs from position MV beyond the review threshold';
    // deliberately carries no count: a digit here would be a new rendered figure
    btn.innerHTML = '<span class="vfx" aria-hidden="true">&#9670;</span>Position variance';
    btn.addEventListener('click', function () { setOpen(!open); });
    host.appendChild(btn);
  }

  /* ---------------------------------------------------- marker on rows --- */
  function markRows() {
    var tb = document.querySelector('#tree tbody');
    if (!tb) return;
    var set = breaching();
    var rows = tb.querySelectorAll('tr.rowv');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var kind = tr.getAttribute('data-kind');
      if (kind !== 'vehicle' && kind !== 'apex') continue;
      var tag = tr.querySelector('.codetag');
      if (!tag || !set.has(tag.textContent.trim())) continue;
      tr.classList.add('varbreach');
      tr.setAttribute('data-var-breach', '1');
      var td = tr.cells[0];
      if (td && !td.querySelector('.varmark')) {
        var m = document.createElement('span');
        m.className = 'varmark';
        m.setAttribute('aria-hidden', 'true');   // no text: cannot add a figure
        var rail = td.querySelector('.lvrail');
        if (rail && rail.nextSibling) td.insertBefore(m, rail.nextSibling);
        else td.insertBefore(m, td.firstChild);
      }
      if (!tr.title) {
        tr.title = 'Derived MV differs from position MV beyond the review threshold';
      }
    }
    // the marker widens the identity cell, and the NAV column is pinned at that
    // cell's measured width, so the offset has to be taken again after this pass
    if (window.__phase1 && window.__phase1.syncFrozenOffset) {
      try { window.__phase1.syncFrozenOffset(); } catch (e) { warn('resync', e); }
    }
  }

  /* ------------------------------------------------------------ wiring --- */
  function wrap(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var r = orig.apply(this, arguments);
      try { after(); } catch (e) { warn(name, e); }
      return r;
    };
  }

  wrap('renderFlags', addChip);
  wrap('renderTree', markRows);

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !open) return;
    setOpen(false);
  });

  function init() {
    try { ensurePanel(); } catch (e) { warn('init/ensurePanel', e); }
    try { addChip(); } catch (e) { warn('init/addChip', e); }
    try { markRows(); } catch (e) { warn('init/markRows', e); }
    window.__cycle1 = {
      ready: true,
      threshold: THRESHOLD_BPS,
      rows: varianceRows,
      isOpen: function () { return open; },
      setOpen: setOpen
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
