/**
 * The in-page extractor, in its own module because it is the harness's single most defect-prone
 * surface: it runs inside the browser, it decides what "resolved" means, and Phase 1 found three
 * map defects here that were reading the wrong figures while appearing to resolve.
 *
 * The exported function is handed to page.evaluate(), so it must stay self-contained: no imports,
 * no closure over module scope.
 */
/* ------------------------------------------------------------------ in-page extraction */
/**
 * Runs in the browser. Returns { [key]: string } for one entry of the map.
 *
 * `data-parity="<semantic key>"` WINS over the map's selector, for every entry type. The map's
 * selectors describe the ORIGINAL's markup; the rebuilt app is free to move, relabel and re-home
 * anything, and publishes each figure by tagging the element that renders it. So the harness asks
 * for the key first and only falls back to the original's selector when nothing is tagged — which
 * is why the original, which has no data-parity attributes anywhere, still extracts identically.
 *
 * Row collections: the row element carries data-parity="<keyPrefix>.<id>" and each cell
 * data-parity="<keyPrefix>.<id>.<suffix>". Tagging is allowed to be partial — an untagged cell
 * falls back to the map's cell selector *within that row*.
 *
 * A tagged element is read whole, WITHOUT the map's `exclude`: `exclude` is a selector into the
 * original's markup (it strips a badge nested in the same cell), whereas a data-parity element is
 * by contract the figure itself. If the rebuild tags a wrapper that also contains a badge, the
 * value differs and the gate says so — loudly, which is the correct direction to fail.
 */
export function extractEntry(entry) {
  const norm = (s) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim());
  const textOf = (el, opts = {}) => {
    if (!el) return null;
    if (opts.exclude) {
      const c = el.cloneNode(true);
      c.querySelectorAll(opts.exclude).forEach((n) => n.remove());
      return norm(c.textContent);
    }
    return norm(el.textContent);
  };
  const parseNum = (s) => {
    if (s == null) return null;
    const t = String(s).replace(/[\s,$%]/g, '').replace(/bps/gi, '');
    const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
    const d = t.replace(/[()\-+]/g, '');
    if (d === '' || !/^[0-9.]+$/.test(d)) return null;
    const v = parseFloat(d);
    return isNaN(v) ? null : neg ? -v : v;
  };
  const out = {};
  /** The rebuilt app's published element for a semantic key, or null. */
  const tagged = (key) => document.querySelector(`[data-parity="${String(key).replace(/"/g, '\\"')}"]`);
  /** Text of the published element for a key, or null when the app does not publish it. */
  const taggedText = (key) => {
    const el = tagged(key);
    return el ? textOf(el) : null;
  };

  if (entry.type === 'single') {
    for (const [key, spec] of Object.entries(entry.keys)) {
      const pub = tagged(key);
      out[key] = pub ? textOf(pub) : textOf(document.querySelector(spec.selector), spec);
    }
    return out;
  }

  if (entry.type === 'count') {
    for (const [key, spec] of Object.entries(entry.keys)) {
      // Two ways a target can answer a count. If it tags MANY elements with the key, each tagged
      // element is one of the counted things, so the answer is how many. If it tags exactly one and
      // that element renders a number, the answer is that number. Otherwise fall back to counting
      // the original's selector.
      const tagged = document.querySelectorAll(`[data-parity="${key}"]`);
      if (tagged.length > 1) {
        out[key] = String(tagged.length);
        continue;
      }
      const pub = taggedText(key);
      const publishedNumber = pub != null && /^\d+$/.test(pub) ? pub : null;
      out[key] = publishedNumber ?? String(document.querySelectorAll(spec.selector).length);
    }
    return out;
  }

  if (entry.type === 'rows' || entry.type === 'list') {
    const prefix = entry.keyPrefix + '.';
    const countKey = `${entry.keyPrefix}.__row_count`;
    const suffixes = Object.keys(entry.cells || {});
    const published = Array.from(document.querySelectorAll('[data-parity]')).filter((el) => {
      const v = el.getAttribute('data-parity');
      return v && v.startsWith(prefix) && v !== countKey;
    });

    if (published.length) {
      const byKey = new Map();
      const rowKeys = [];
      for (const el of published) {
        const v = el.getAttribute('data-parity');
        if (!byKey.has(v)) byKey.set(v, el); // first occurrence wins, as in the selector path
        const suffix = suffixes.find((s) => v.endsWith('.' + s));
        const rowKey = suffix ? v.slice(0, v.length - suffix.length - 1) : v;
        if (rowKey.length > prefix.length && !rowKeys.includes(rowKey)) rowKeys.push(rowKey);
      }
      for (const rowKey of rowKeys) {
        const rowEl = byKey.get(rowKey) || null;
        for (const [suffix, spec] of Object.entries(entry.cells || {})) {
          const cs = typeof spec === 'string' ? { selector: spec } : spec;
          const cellKey = `${rowKey}.${suffix}`;
          const pub = byKey.get(cellKey);
          if (pub) out[cellKey] = textOf(pub);
          else if (!rowEl) out[cellKey] = null;
          else out[cellKey] = textOf(cs.selector === '.' ? rowEl : rowEl.querySelector(cs.selector), cs);
        }
        if (!entry.cells) out[rowKey] = textOf(rowEl);
      }
      out[countKey] = taggedText(countKey) ?? String(rowKeys.length);
      return out;
    }

    const rowSel = entry.rowSelector || entry.selector;
    let rows = Array.from(document.querySelectorAll(rowSel));
    if (entry.where) {
      rows = rows.filter((r) => {
        const w = r.querySelector(entry.where.selector);
        return textOf(w) === entry.where.equals;
      });
    }
    const ids = new Set();
    for (const r of rows) {
      let id = null;
      if (entry.idFrom.attr) id = r.getAttribute(entry.idFrom.attr);
      else if (entry.idFrom.selector) id = textOf(r.querySelector(entry.idFrom.selector));
      else if (entry.idFrom.text) id = textOf(r);
      if (id && entry.idFrom.strip) id = norm(String(id).replace(new RegExp(entry.idFrom.strip), ''));
      if (!id) continue;
      id = String(id).replace(/[^A-Za-z0-9_.>-]+/g, '_');
      if (ids.has(id)) continue; // first occurrence wins; duplicates are reported as row_count drift
      ids.add(id);
      for (const [suffix, spec] of Object.entries(entry.cells || {})) {
        const cs = typeof spec === 'string' ? { selector: spec } : spec;
        const cell = cs.selector === '.' ? r : r.querySelector(cs.selector);
        out[`${entry.keyPrefix}.${id}.${suffix}`] = textOf(cell, cs);
      }
      if (!entry.cells) out[`${entry.keyPrefix}.${id}`] = textOf(r);
    }
    out[`${entry.keyPrefix}.__row_count`] = String(ids.size);
    return out;
  }

  if (entry.type === 'digest') {
    // A digest key is a statistic, not an element, so the rebuilt app publishes each statistic
    // directly (data-parity="<keyPrefix>.<column>.sum" and so on). Anything it does not publish is
    // computed from the original's column indices exactly as before.
    const rows = Array.from(document.querySelectorAll(entry.rowSelector));
    const countKey = `${entry.keyPrefix}.row_count`;
    out[countKey] = taggedText(countKey) ?? String(rows.length);
    for (const [name, colIdx] of Object.entries(entry.columns)) {
      let sum = 0;
      let n = 0;
      let min = null;
      let max = null;
      for (const r of rows) {
        const cell = r.querySelector(`td:nth-child(${colIdx})`);
        const v = parseNum(textOf(cell));
        if (v == null) continue;
        n++;
        sum += v;
        min = min == null ? v : Math.min(min, v);
        max = max == null ? v : Math.max(max, v);
      }
      const fx = (x) => (x == null ? null : x.toFixed(2));
      const put = (stat, computed) => {
        const key = `${entry.keyPrefix}.${name}.${stat}`;
        out[key] = taggedText(key) ?? computed;
      };
      put('count', String(n));
      put('sum', fx(sum));
      put('min', fx(min));
      put('max', fx(max));
    }
    return out;
  }

  throw new Error('unknown entry type: ' + entry.type);
}
