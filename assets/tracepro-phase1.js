/* ==========================================================================
   TRACE-Pro Phase 1 behaviour.

   Everything here is additive. It wraps the existing render functions rather
   than editing them, and every number it shows is produced by the app's own
   recomputeR() engine. No figure is recomputed, reformatted or re-derived
   here, and nothing runs until the controller asks for it.

   Loaded as the last classic script in the document, so the module's
   top-level `const`/`let` bindings (MODEL, EMB, REVISE, U, Uv, expanded ...)
   and its function declarations are all in scope by bare name.
   ========================================================================== */
(function () {
  'use strict';

  var COL = { HIER: 0, SYM: 1, NAV: 2, DERIVED: 3, REVISED: 4, DPRICING: 5, DNONPOS: 6 };
  var CENT = 0.005;

  function warn(where, e) {
    window.__phase1Errors = window.__phase1Errors || [];
    window.__phase1Errors.push(where + ': ' + (e && e.message ? e.message : String(e)));
    if (window.console && console.warn) console.warn('[phase1] ' + where, e);
  }

  /* ====================================================================
     1. Hierarchy rail, group blocks and subtotal marking
     ==================================================================== */

  function railFor(level) {
    var rail = document.createElement('span');
    rail.className = 'lvrail';
    rail.setAttribute('aria-hidden', 'true');
    for (var d = 0; d < level; d++) rail.appendChild(document.createElement('i'));
    var chip = document.createElement('b');
    chip.className = 'lvchip';
    rail.appendChild(chip);
    return rail;
  }

  function nodeById() {
    var m = {};
    var nodes = (typeof MODEL !== 'undefined' && MODEL && MODEL.nodes) ? MODEL.nodes : [];
    for (var i = 0; i < nodes.length; i++) m[nodes[i].id] = nodes[i];
    return m;
  }

  function decorateTree() {
    var tb = document.querySelector('#tree tbody');
    if (!tb) return;
    var idx = nodeById();
    var rows = tb.querySelectorAll('tr.rowv');

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var n = idx[tr.getAttribute('data-id')];
      if (!n) continue;

      tr.setAttribute('data-level', n.level);
      tr.setAttribute('data-kind', n.kind);
      tr.setAttribute('tabindex', '-1');

      var td = tr.cells[COL.HIER];
      if (td) {
        td.setAttribute('data-level', n.level);
        td.style.paddingLeft = '8px';          // the rail now provides the indent
        if (!td.querySelector('.lvrail')) td.insertBefore(railFor(n.level), td.firstChild);
      }

      // A group's own row IS its subtotal row: it already carries the group's
      // Derived MV, which equals the sum of its direct children. Mark it so it
      // reads as a block header and so tests can find it.
      var isGroup = false;
      try { isGroup = !!hasKids(n); } catch (e) { isGroup = false; }
      if (isGroup) {
        tr.classList.add('grouprow');
        tr.setAttribute('data-subtotal', '1');
        if (n.level <= 2) tr.classList.add('blockstart');
        var dcell = tr.cells[COL.DERIVED];
        if (dcell) dcell.setAttribute('data-subtotal-col', 'derived');
        if (td && !td.querySelector('.sublabel')) {
          var lab = document.createElement('span');
          lab.className = 'sublabel';
          lab.textContent = 'subtotal';        // no digits: cannot affect the figure snapshot
          // keep it at the left of the cell so a long fund name cannot push it out
          var tagEl = td.querySelector('.tag');
          if (tagEl) td.insertBefore(lab, tagEl.nextSibling);
          else td.appendChild(lab);
        }
      }
    }
    applyFilterToRows();
    refreshRoving('#tree tbody');
    syncFrozenOffset();
  }

  /**
   * The NAV column is pinned immediately to the right of the identity column, so its
   * sticky offset has to be the identity column's real rendered width. Measure it after
   * the rows are in place rather than assuming a fixed width.
   */
  function syncFrozenOffset() {
    var table = document.getElementById('tree');
    var head = document.querySelector('#tree thead th:first-child');
    if (!table || !head) return;
    var w = Math.round(head.getBoundingClientRect().width);
    if (w > 0) table.style.setProperty('--hier-w', w + 'px');
  }

  /* ====================================================================
     2. Waterfall segments drive a filter over the tree
     ==================================================================== */

  var WF_KEYS = ['derived', 'dpricing', 'revised', 'dnonpos', 'nav'];
  var WF_LABEL = {
    derived: 'Derived MV',
    dpricing: 'Δ Pricing',
    revised: 'Revised MV',
    dnonpos: 'Δ Non-position',
    nav: 'NAV'
  };
  var WF_TEST = {
    derived: function (n) { var v = liveMVof(n); return v != null && Math.abs(v) >= CENT; },
    dpricing: function (n) {
      var d = revMVof(n) - liveMVof(n);
      return isFinite(d) && Math.abs(d) >= CENT;
    },
    revised: function (n) { var v = revMVof(n); return v != null && Math.abs(v) >= CENT; },
    dnonpos: function (n) {
      var nav = navMVof(n); if (nav == null) return false;
      var d = nav - revMVof(n);
      return isFinite(d) && Math.abs(d) >= CENT;
    },
    nav: function (n) { var v = navMVof(n); return v != null && Math.abs(v) >= CENT; }
  };
  var WF = null;

  function applyFilterToRows() {
    var tb = document.querySelector('#tree tbody');
    if (!tb) return;
    var rows = tb.querySelectorAll('tr.rowv');
    var idx = nodeById();
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!WF) { tr.style.display = ''; tr.removeAttribute('data-wf-hidden'); continue; }
      var n = idx[tr.getAttribute('data-id')];
      var keep = false;
      try { keep = !!(n && WF_TEST[WF](n)); } catch (e) { keep = false; }
      tr.style.display = keep ? '' : 'none';
      if (keep) tr.removeAttribute('data-wf-hidden');
      else tr.setAttribute('data-wf-hidden', '1');
    }
  }

  function renderFilterNote() {
    var host = document.getElementById('ltwf');
    if (!host || !host.parentNode) return;
    var note = document.getElementById('wfnote');
    if (!WF) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.className = 'wfnote';
      note.id = 'wfnote';
      note.setAttribute('role', 'status');
      host.parentNode.insertBefore(note, host.nextSibling);
    }
    note.innerHTML = '';
    var span = document.createElement('span');
    span.innerHTML = 'Showing only rows that contribute to <b>' + WF_LABEL[WF] + '</b>.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'wfclear';
    btn.textContent = 'Show all rows';
    btn.addEventListener('click', function () { setFilter(null); });
    note.appendChild(span);
    note.appendChild(btn);
  }

  function setFilter(key) {
    WF = (key && WF === key) ? null : key;
    if (WF) {
      // a contributing row is only useful if it can be seen, so open the tree
      var ex = document.getElementById('expand');
      if (ex) ex.click();
    }
    try { renderTree(); } catch (e) { warn('setFilter/renderTree', e); }
    decorateWaterfall();
    renderFilterNote();
  }

  function decorateWaterfall() {
    var host = document.getElementById('ltwf');
    if (!host) return;
    var segs = host.querySelectorAll(':scope > .wfstep, :scope > .wfop');
    for (var i = 0; i < segs.length && i < WF_KEYS.length; i++) {
      var el = segs[i], key = WF_KEYS[i];
      el.setAttribute('data-wf-seg', key);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-pressed', WF === key ? 'true' : 'false');
      el.setAttribute('title', 'Show only rows contributing to ' + WF_LABEL[key]);
      el.classList.toggle('wfon', WF === key);
    }
    host.classList.toggle('wffiltered', !!WF);
  }

  document.addEventListener('click', function (ev) {
    var seg = ev.target && ev.target.closest ? ev.target.closest('#ltwf [data-wf-seg]') : null;
    if (!seg) return;
    setFilter(seg.getAttribute('data-wf-seg'));
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var seg = ev.target && ev.target.closest ? ev.target.closest('#ltwf [data-wf-seg]') : null;
    if (!seg) return;
    ev.preventDefault();
    setFilter(seg.getAttribute('data-wf-seg'));
  });

  /* ====================================================================
     3. Keyboard navigation for the Look-Through and Pricing tables
     ==================================================================== */

  function visibleRows(sel) {
    var tb = document.querySelector(sel);
    if (!tb) return [];
    return Array.prototype.filter.call(tb.querySelectorAll('tr'), function (tr) {
      return tr.offsetParent !== null && tr.style.display !== 'none';
    });
  }

  /**
   * Roving tabindex. Applied to every row, not just the visible ones: a table on a
   * hidden tab has no offsetParent, and if we skipped it there the rows would never
   * become focusable and arrow keys would do nothing once the tab was opened.
   */
  function refreshRoving(sel) {
    var tb = document.querySelector(sel);
    if (!tb) return;
    var all = tb.querySelectorAll('tr');
    var hasEntry = false;
    for (var i = 0; i < all.length; i++) {
      if (!all[i].hasAttribute('tabindex')) all[i].setAttribute('tabindex', '-1');
      if (all[i].getAttribute('tabindex') === '0') hasEntry = true;
    }
    if (!hasEntry && all.length) all[0].setAttribute('tabindex', '0');
  }

  function focusRow(rows, i, sel) {
    if (!rows.length) return;
    i = Math.max(0, Math.min(rows.length - 1, i));
    var tb = document.querySelector(sel);
    if (tb) {
      Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (r) {
        r.setAttribute('tabindex', '-1');
        r.classList.remove('kbrow');
      });
    }
    rows[i].setAttribute('tabindex', '0');
    rows[i].classList.add('kbrow');
    rows[i].focus({ preventScroll: true });
    if (rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
  }

  function wireKeyboard(containerId, bodySel, drawerName) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End' &&
          key !== 'Enter' && key !== 'Escape') return;

      var rows = visibleRows(bodySel);
      if (!rows.length) return;
      var cur = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
      var at = cur ? rows.indexOf(cur) : -1;

      if (key === 'ArrowDown') { ev.preventDefault(); focusRow(rows, at < 0 ? 0 : at + 1, bodySel); return; }
      if (key === 'ArrowUp')   { ev.preventDefault(); focusRow(rows, at < 0 ? 0 : at - 1, bodySel); return; }
      if (key === 'Home')      { ev.preventDefault(); focusRow(rows, 0, bodySel); return; }
      if (key === 'End')       { ev.preventDefault(); focusRow(rows, rows.length - 1, bodySel); return; }

      if (key === 'Enter') {
        if (!cur) return;
        ev.preventDefault();
        cur.click();                                   // the row's existing handler
        try { openDrawer(drawerName); } catch (e) { warn('openDrawer', e); }
        return;
      }
      if (key === 'Escape') {
        ev.preventDefault();
        try { closeDrawer(drawerName); } catch (e) { warn('closeDrawer', e); }
      }
    });
  }

  // Escape also works while focus sits inside an open drawer.
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    var open = document.querySelector('.drawer.open');
    if (!open) return;
    var which = open.id === 'recdrawer' ? 'rfx' : 'lt';
    try { closeDrawer(which); } catch (e) { warn('escape/closeDrawer', e); }
  });

  /* ====================================================================
     4. Bulk administrator marks
        The overrides are priced by the app's own recomputeR(). The struct
        handed to it is assembled from the embedded look-through tree's own
        path parentage, ownership percentages and security market values -
        no value is recomputed here. buildOvStruct() is verified against the
        live engine by tests/subtotal + tests/bulkupload.
     ==================================================================== */

  var OVSTRUCT = null;

  function buildOvStruct() {
    var nodes = EMB.nodes, byPath = new Map();
    nodes.forEach(function (n) { byPath.set(n.path, n); });
    function parentOf(n) {
      var s = n.path.split('/').filter(Boolean);
      s.pop();
      return s.length ? byPath.get(s.join('/') + '/') : null;
    }
    var children = new Map(), secMV = new Map(), scope = new Set(), apex = [], firstOcc = new Map();
    nodes.forEach(function (n) {
      if (n.kind === 'apex' && apex.indexOf(n.code) < 0) apex.push(n.code);
      if (n.kind === 'apex' || n.kind === 'vehicle') scope.add(n.code);
    });
    nodes.forEach(function (n) {
      var p = parentOf(n);
      if (!p) return;
      if (n.kind === 'vehicle') {
        if (!children.has(p.code)) children.set(p.code, []);
        var arr = children.get(p.code);
        if (!arr.some(function (c) { return c.i === n.code; })) {
          arr.push({ i: n.code, ownpct: n.ownpct });
        }
      } else if (n.isLeaf) {
        // a fund's own securities are identical wherever it appears, so count
        // them from its first occurrence only
        if (!firstOcc.has(p.code)) firstOcc.set(p.code, p.path);
        if (firstOcc.get(p.code) === p.path) {
          secMV.set(p.code, (secMV.get(p.code) || 0) + (n.mv100 || 0));
        }
      }
    });
    return { children: children, secMV: secMV, scope: scope, apex: apex.slice().sort() };
  }

  function ovStruct() {
    if (!OVSTRUCT) OVSTRUCT = buildOvStruct();
    return OVSTRUCT;
  }

  /** Product-level figures for one scenario, straight out of the engine. */
  function metricsFor(rows) {
    var base = ovStruct();
    var navMap = {}, live = currentNavMap(), k;
    for (k in live) if (Object.prototype.hasOwnProperty.call(live, k)) navMap[k] = live[k];
    var secMV = new Map(base.secMV);
    (rows || []).forEach(function (r) {
      if (r.kind === 'nav') navMap[r.code] = r.value;
      else secMV.set(r.code, r.value);
    });
    var struct = { children: base.children, secMV: secMV, scope: base.scope, apex: base.apex };
    var R = recomputeR(struct, navMap);
    var rev = 0, nav = 0;
    base.apex.forEach(function (a) {
      rev += (R.get(a) || 0);
      nav += (navMap[a] != null ? navMap[a] : 0);
    });
    return { rev: rev, nav: nav };
  }

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    var out = [], row = [], cur = '', q = false, i, c;
    text = String(text).replace(/^\uFEFF/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
    row.push(cur);
    out.push(row);
    return out.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  var H_CODE = ['code', 'spv', 'spv code', 'spv_code', 'fund', 'fund code', 'entity'];
  var H_MV = ['market value', 'market_value', 'marketvalue', 'mv', 'new market value', 'new_market_value'];
  var H_NAV = ['nav', 'new nav', 'new_nav', 'ending nav', 'ending_nav'];

  function num(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return null;
    var neg = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, '').replace(/[$,\s]/g, '').replace(/−/g, '-');
    if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return NaN;
    var v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }

  function readRows(text) {
    var grid = parseCsv(text);
    if (!grid.length) return { rows: [], header: null };
    var head = grid[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iCode = -1, iMv = -1, iNav = -1, hasHeader = false;
    head.forEach(function (h, i) {
      if (iCode < 0 && H_CODE.indexOf(h) >= 0) { iCode = i; hasHeader = true; }
      if (iMv < 0 && H_MV.indexOf(h) >= 0) { iMv = i; hasHeader = true; }
      if (iNav < 0 && H_NAV.indexOf(h) >= 0) { iNav = i; hasHeader = true; }
    });
    if (!hasHeader) { iCode = 0; iMv = 1; iNav = 2; }
    var body = grid.slice(hasHeader ? 1 : 0);
    return {
      header: { code: iCode, mv: iMv, nav: iNav, present: hasHeader },
      rows: body.map(function (r, i) {
        return {
          line: i + 1 + (hasHeader ? 1 : 0),
          code: String(iCode >= 0 && r[iCode] != null ? r[iCode] : '').trim(),
          mvRaw: iMv >= 0 ? r[iMv] : '',
          navRaw: iNav >= 0 ? r[iNav] : ''
        };
      })
    };
  }

  /** Split the upload into rows the engine can price and rows it cannot. */
  function classify(parsed) {
    var known = ovStruct().scope;
    var accepted = [], rejected = [], seen = {};
    parsed.rows.forEach(function (r) {
      function reject(reason) {
        rejected.push({ line: r.line, code: r.code, mvRaw: r.mvRaw, navRaw: r.navRaw, reason: reason });
      }
      if (!r.code) return reject('no SPV code in this row');
      if (!known.has(r.code)) {
        return reject('unknown SPV code, not in this product look-through');
      }
      if (Object.prototype.hasOwnProperty.call(seen, r.code)) {
        return reject('duplicate code, already supplied on an earlier line');
      }
      var mv = num(r.mvRaw), nav = num(r.navRaw);
      if (mv !== null && isNaN(mv)) return reject('market value is not a number');
      if (nav !== null && isNaN(nav)) return reject('NAV is not a number');
      if (mv === null && nav === null) return reject('no market value or NAV supplied');
      if (mv !== null && nav !== null) {
        return reject('both market value and NAV supplied, provide one');
      }
      seen[r.code] = 1;
      accepted.push({
        line: r.line, code: r.code,
        kind: nav !== null ? 'nav' : 'mv',
        value: nav !== null ? nav : mv
      });
    });
    return { accepted: accepted, rejected: rejected };
  }

  function priceOverrides(text) {
    var parsed = readRows(text);
    var split = classify(parsed);
    var base = metricsFor([]);
    var all = metricsFor(split.accepted);

    // Each accepted row is priced on its own through the same engine, so the
    // per-SPV deltas are engine output rather than a formula written here.
    var perRow = split.accepted.map(function (r) {
      var one = metricsFor([r]);
      return {
        line: r.line, code: r.code, kind: r.kind, value: r.value,
        dRev: one.rev - base.rev,
        dNav: one.nav - base.nav
      };
    });

    return {
      accepted: perRow,
      rejected: split.rejected,
      before: base,
      after: all,
      deltaRev: all.rev - base.rev,
      deltaNav: all.nav - base.nav,
      sumRowRev: perRow.reduce(function (s, r) { return s + r.dRev; }, 0),
      sumRowNav: perRow.reduce(function (s, r) { return s + r.dNav; }, 0)
    };
  }

  /* ---------- report ---------- */
  function signed(v) { return (v >= 0 ? '+' : '') + U(v); }
  function cls(v) { return Math.abs(v) < CENT ? 'zero' : (v < 0 ? 'neg' : 'pos'); }

  function card(label, before, after, delta) {
    return '<div class="bo-card"><div class="l">' + label + '</div>' +
      '<div class="ba"><span class="bf">' + U(before) + '</span>' +
      '<span class="ar">&#8594;</span><span class="af">' + U(after) + '</span></div>' +
      '<div class="dl ' + cls(delta) + '">' + signed(delta) + '</div></div>';
  }

  function renderReport(res) {
    var out = document.getElementById('boout');
    var rej = document.getElementById('borej');
    if (!out || !rej) return;

    if (!res) {
      out.hidden = true; out.innerHTML = '';
      rej.hidden = true; rej.innerHTML = '';
      return;
    }

    var h = '<div class="bo-prod">' +
      card('Product NAV', res.before.nav, res.after.nav, res.deltaNav) +
      card('Revised MV', res.before.rev, res.after.rev, res.deltaRev) +
      '</div>';

    if (res.accepted.length) {
      h += '<div class="bo-sec">Applied marks and propagated impact</div>';
      h += '<table class="botab"><thead><tr>' +
        '<th class="l">SPV</th><th class="l">Mark</th><th>New value</th>' +
        '<th>&#916; Revised MV</th><th>&#916; Product NAV</th></tr></thead><tbody>';
      res.accepted.forEach(function (r) {
        h += '<tr data-ov-code="' + r.code + '">' +
          '<td class="l"><b>' + r.code + '</b></td>' +
          '<td class="l"><span class="bo-kind">' + (r.kind === 'nav' ? 'NAV' : 'market value') + '</span></td>' +
          '<td>' + U(r.value) + '</td>' +
          '<td class="' + cls(r.dRev) + '">' + signed(r.dRev) + '</td>' +
          '<td class="' + cls(r.dNav) + '">' + signed(r.dNav) + '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<div class="bo-sec">No row in this file could be priced</div>';
    }
    out.innerHTML = h;
    out.hidden = false;

    if (res.rejected.length) {
      var r = '<div class="rt">Rejected rows, not applied to any calculation</div>' +
        '<table class="botab" id="borejtab"><thead><tr><th class="l">Line</th>' +
        '<th class="l">Code as supplied</th><th class="l">Reason</th></tr></thead><tbody>';
      res.rejected.forEach(function (x) {
        r += '<tr data-rej-code="' + String(x.code).replace(/"/g, '&quot;') + '">' +
          '<td class="l">' + x.line + '</td>' +
          '<td class="l"><b>' + (x.code === '' ? '(blank)' : x.code) + '</b></td>' +
          '<td class="l bo-reason">' + x.reason + '</td></tr>';
      });
      r += '</tbody></table>';
      rej.innerHTML = r;
      rej.hidden = false;
    } else {
      rej.hidden = true;
      rej.innerHTML = '';
    }
  }

  function applyOverrideCsv(text) {
    var res;
    try {
      res = priceOverrides(text);
    } catch (e) {
      warn('applyOverrideCsv', e);
      throw e;
    }
    window.__phase1 = window.__phase1 || {};
    window.__phase1.lastOverride = res;
    renderReport(res);
    return res;
  }

  function wireBulk() {
    var input = document.getElementById('bofile');
    var clear = document.getElementById('boclear');
    if (input) {
      input.addEventListener('change', function (ev) {
        var f = ev.target.files && ev.target.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function (e) {
          try { applyOverrideCsv(e.target.result); }
          catch (err) { warn('override file', err); }
        };
        fr.readAsText(f);
        input.value = '';
      });
    }
    if (clear) {
      clear.addEventListener('click', function () {
        if (window.__phase1) window.__phase1.lastOverride = null;
        renderReport(null);
      });
    }
  }

  /* ====================================================================
     5. Wiring
     ==================================================================== */

  function wrap(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var r = orig.apply(this, arguments);
      try { after(); } catch (e) { warn(name, e); }
      return r;
    };
  }

  function decoratePricing() { refreshRoving('#rectable .rectbl tbody'); }

  wrap('renderTree', decorateTree);
  wrap('renderWaterfall', function () { decorateWaterfall(); renderFilterNote(); });
  wrap('renderRFX', decoratePricing);

  function init() {
    try { decorateTree(); } catch (e) { warn('init/decorateTree', e); }
    try { decorateWaterfall(); } catch (e) { warn('init/decorateWaterfall', e); }
    try { decoratePricing(); } catch (e) { warn('init/decoratePricing', e); }
    wireKeyboard('lttablewrap', '#tree tbody', 'lt');
    wireKeyboard('rectable', '#rectable .rectbl tbody', 'rfx');
    wireBulk();

    window.__phase1 = window.__phase1 || {};
    window.__phase1.applyOverrideCsv = applyOverrideCsv;
    window.__phase1.metricsFor = metricsFor;
    window.__phase1.ovStruct = ovStruct;
    window.__phase1.setFilter = setFilter;
    // exposed so a later decorator that changes the identity cell's width can
    // re-measure the frozen-column offset after its own mutation
    window.__phase1.syncFrozenOffset = syncFrozenOffset;
    window.__phase1.activeFilter = function () { return WF; };
    window.__phase1.ready = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
