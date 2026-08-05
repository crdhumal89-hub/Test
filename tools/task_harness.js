'use strict';
/**
 * task_harness.js - measures the cost of the 5 canonical controller tasks.
 *
 *   node tools/task_harness.js --baseline                  # record baseline/harness.json
 *   node tools/task_harness.js                             # measure dist/
 *   node tools/task_harness.js --compare baseline/harness.json --target T3
 *
 * WHAT IS COUNTED
 * "clicks" is the number of discrete user interactions a controller must perform:
 * pointer clicks, one per committed keyboard entry, and one per scroll step. Scrolling
 * is counted because reading a 149-row table is work, and a tool that removes the need
 * to scroll has genuinely made the task cheaper.
 *
 * THE READING RULE
 * A task may only read values that are actually on screen. `__visibleRows` returns just
 * the rows inside the scroll container's visible box, so to see more of a table the
 * harness must scroll, and pays for it. Without this rule every task costs one click and
 * no improvement is measurable, because a headless browser can read the whole DOM at once
 * and a human cannot.
 *
 * PROOF OF WORK
 * Every task computes its expected answer independently from the app's data and asserts
 * the answer it read off the screen matches. A path that clicks less but does not produce
 * the right answer fails rather than scoring well.
 *
 * Each task also declares a fast path. If the affordance exists it is used, otherwise the
 * manual path runs. That is what makes a before/after comparison meaningful: the same task
 * definition, measured against whatever the UI offers at the time.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const VIEWPORT = { width: 1600, height: 1000 };
const FIXTURE_12 = path.resolve('fixtures/overrides_12.csv');

/* -------------------------------------------------------------- page helpers */
function PAGE_HELPERS() {
  // ":document" means the table has no scroll box of its own and rides the page,
  // which is how the Ownership Breakout table behaves.
  window.__scrollBox = function (sel) {
    return sel === ':document' ? document.scrollingElement : document.querySelector(sel);
  };
  window.__searchRoot = function (sel) {
    return sel === ':document' ? document : document.querySelector(sel);
  };
  /** Rows currently inside the scroll container's visible box. */
  window.__visibleRows = function (containerSel, rowSel) {
    var root = window.__searchRoot(containerSel);
    var box = window.__scrollBox(containerSel);
    if (!root || !box) return [];
    var top = 0, bottom = window.innerHeight;
    if (containerSel !== ':document') {
      var cr = box.getBoundingClientRect();
      top = Math.max(cr.top, 0);
      bottom = Math.min(cr.bottom, window.innerHeight);
    }
    return Array.prototype.filter.call(root.querySelectorAll(rowSel), function (el) {
      if (el.offsetParent === null) return false;
      var r = el.getBoundingClientRect();
      return r.bottom > top + 1 && r.top < bottom - 1;
    }).map(function (el) {
      var o = { cells: [], data: {} };
      Array.prototype.forEach.call(el.cells || [], function (td) {
        o.cells.push((td.innerText || '').replace(/\s+/g, ' ').trim());
      });
      Array.prototype.forEach.call(el.attributes, function (a) {
        if (a.name.indexOf('data-') !== 0) return;
        // data-var-code -> varCode, matching how a dataset key reads
        var k = a.name.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
        o.data[k] = a.value;
      });
      // the entity code a controller reads off the row
      var tag = el.querySelector('.codetag');
      o.codetag = tag ? (tag.textContent || '').trim() : null;
      o.text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      return o;
    });
  };
  /**
   * How much of the scroll box is actually on screen. A table can be 654px tall and
   * still show only 193px of itself if it sits low on a long page, and a scroll step
   * that advanced by the full height would skip the rows in between.
   */
  window.__visibleHeight = function (containerSel) {
    if (containerSel === ':document') return window.innerHeight;
    var b = window.__scrollBox(containerSel);
    if (!b) return 0;
    var cr = b.getBoundingClientRect();
    return Math.max(0, Math.min(cr.bottom, window.innerHeight) - Math.max(cr.top, 0));
  };
  /** Scroll one visible page down. Returns true if the position actually moved. */
  window.__scrollStep = function (containerSel) {
    var c = window.__scrollBox(containerSel);
    if (!c) return false;
    var before = c.scrollTop;
    c.scrollTop = before + Math.max(60, window.__visibleHeight(containerSel) - 40);
    return c.scrollTop > before + 0.5;
  };
  /** Scroll the page itself so the table occupies as much of the screen as it can. */
  window.__pageScroll = function () {
    var d = document.scrollingElement;
    var before = d.scrollTop;
    d.scrollTop = before + Math.max(120, Math.round(window.innerHeight * 0.6));
    return d.scrollTop > before + 0.5;
  };
  window.__atBottom = function (containerSel) {
    var c = window.__scrollBox(containerSel);
    if (!c) return true;
    return c.scrollTop + c.clientHeight >= c.scrollHeight - 2;
  };
}

/** "$1,234" / "($1,234)" / "-$1,234" / en-dash placeholder -> number or null */
function money(text) {
  if (text == null) return null;
  var m = String(text).match(/\(?-?\$\s?-?[\d,]+(?:\.\d+)?\)?/);
  if (!m) return null;
  var s = m[0];
  var neg = /^\(/.test(s) || /-/.test(s.replace(/[^-]/g, '-').slice(0, 2)) || /^-/.test(s.replace(/[()$\s]/g, ''));
  var n = parseFloat(s.replace(/[()$,\s-]/g, ''));
  if (!isFinite(n)) return null;
  return (/^\(/.test(s) || /^-/.test(s.replace(/[()\s]/g, ''))) ? -n : n;
}

/* ------------------------------------------------------------------ context */
class Ctx {
  constructor(frame, page) {
    this.frame = frame; this.page = page; this.clicks = 0; this.log = [];
  }
  note(s) { this.log.push(s); }
  async click(sel, why) {
    this.clicks++;
    this.note('click ' + sel + (why ? ' (' + why + ')' : ''));
    await this.frame.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('no element for ' + s);
      el.click();
    }, sel);
    await this.page.waitForTimeout(120);
  }
  async clickHandle(handle, why) {
    this.clicks++;
    this.note('click <handle>' + (why ? ' (' + why + ')' : ''));
    await handle.evaluate(el => el.click());
    await this.page.waitForTimeout(120);
  }
  async type(sel, text) {
    this.clicks++;
    this.note('type "' + text + '" into ' + sel);
    await this.frame.fill(sel, text);
    await this.page.waitForTimeout(350);
  }
  async pressKey(sel, key) {
    this.clicks++;
    this.note('press ' + key);
    const h = await this.frame.$(sel);
    if (h) await h.press(key);
    await this.page.waitForTimeout(100);
  }
  async upload(sel, file) {
    this.clicks++;
    this.note('upload ' + path.basename(file));
    await this.frame.setInputFiles(sel, file);
  }
  async tab(name) { await this.click('.tab[data-tab="' + name + '"]', 'open ' + name + ' tab'); }
  async scrollStep(container) {
    this.clicks++;
    this.note('scroll ' + container);
    const moved = await this.frame.evaluate(c => window.__scrollStep(c), container);
    await this.page.waitForTimeout(70);
    return moved;
  }
  visible(container, rowSel) {
    return this.frame.evaluate(a => window.__visibleRows(a.c, a.r), { c: container, r: rowSel });
  }
  /** Before scanning a long table, a controller scrolls the page to give it the screen. */
  async bringIntoView(container) {
    for (let i = 0; i < 8; i++) {
      const state = await this.frame.evaluate(s => ({
        vis: window.__visibleHeight(s),
        full: window.__scrollBox(s) ? window.__scrollBox(s).clientHeight : 0
      }), container);
      if (state.vis >= state.full - 2) break;
      this.clicks++;
      this.note('scroll page to reveal ' + container);
      const moved = await this.frame.evaluate(() => window.__pageScroll());
      await this.page.waitForTimeout(70);
      const after = await this.frame.evaluate(s => window.__visibleHeight(s), container);
      if (!moved || after <= state.vis) break;
    }
  }
  exists(sel) { return this.frame.evaluate(s => !!document.querySelector(s), sel); }
}

/* ------------------------------------------------------------------- tasks */
const TASKS = [];

/* T1 ---------------------------------------------------------------------- */
TASKS.push({
  id: 'T1',
  title: 'Name the SPV contributing the largest delta Pricing, and state its value',
  async expected(ctx) {
    return ctx.frame.evaluate(() => {
      let best = null;
      document.querySelectorAll('#tree tbody tr.rowv').forEach(tr => {
        const k = tr.getAttribute('data-kind');
        if (k !== 'vehicle' && k !== 'apex') return;
        const id = +tr.getAttribute('data-id');
        const n = MODEL.nodes.find(x => x.id === id);
        if (!n) return;
        const v = revMVof(n) - liveMVof(n);
        if (!isFinite(v)) return;
        if (!best || Math.abs(v) > Math.abs(best.value)) best = { code: n.code, value: v };
      });
      return best;
    });
  },
  async run(ctx) {
    await ctx.tab('lt');
    // fast path: a sortable delta Pricing column
    if (await ctx.exists('#tree thead th[data-sort-key="dpricing"]')) {
      await ctx.click('#tree thead th[data-sort-key="dpricing"]', 'sort by delta Pricing');
      const rows = await ctx.visible('#lttablewrap', 'tbody tr.rowv');
      for (const r of rows) {
        if (r.data.kind === 'vehicle' || r.data.kind === 'apex') {
          return { code: r.codetag, value: money(r.cells[5]) };
        }
      }
      return null;
    }
    // manual path: expand everything and scan the column by eye, scrolling as you go
    await ctx.click('#expand', 'expand all');
    await ctx.bringIntoView('#lttablewrap');
    let best = null, guard = 0;
    for (;;) {
      const rows = await ctx.visible('#lttablewrap', 'tbody tr.rowv');
      for (const r of rows) {
        if (r.data.kind !== 'vehicle' && r.data.kind !== 'apex') continue;
        const v = money(r.cells[5]);
        if (v == null) continue;
        if (!best || Math.abs(v) > Math.abs(best.value)) {
          best = { code: r.codetag, value: v, name: r.cells[0] };
        }
      }
      if (await ctx.frame.evaluate(() => window.__atBottom('#lttablewrap'))) break;
      if (!(await ctx.scrollStep('#lttablewrap'))) break;
      if (++guard > 200) break;
    }
    return best;
  },
  check(answer, expected) {
    if (!answer || !expected) return 'no answer';
    if (answer.code !== expected.code) return 'wrong SPV: ' + answer.code + ' vs ' + expected.code;
    if (Math.abs(answer.value - Math.round(expected.value)) > 1.5) {
      return 'wrong value: ' + answer.value + ' vs ' + expected.value;
    }
    return null;
  }
});

/* T2 ---------------------------------------------------------------------- */
TASKS.push({
  id: 'T2',
  title: "State today's product NAV and whether the additive bridge ties within tolerance",
  async expected(ctx) {
    return ctx.frame.evaluate(() => ({
      nav: Math.round(REVISE.N),
      ties: Math.abs((REVISE.dPricing + REVISE.dNonPos) - (REVISE.N - REVISE.D)) < 0.5
    }));
  },
  async run(ctx) {
    await ctx.tab('lt');
    const seg = await ctx.frame.evaluate(() => {
      const nav = document.querySelector('#ltwf [data-wf-seg="nav"] .wv');
      const tie = document.querySelector('#ltwf .wftie');
      if (!nav || !tie) return null;
      const r = nav.getBoundingClientRect(), t = tie.getBoundingClientRect();
      return {
        navText: (nav.innerText || '').trim(),
        tieText: (tie.innerText || '').replace(/\s+/g, ' ').trim(),
        onScreen: r.top >= 0 && r.bottom <= window.innerHeight &&
                  t.top >= 0 && t.bottom <= window.innerHeight
      };
    });
    if (!seg || !seg.onScreen) return null;
    return { nav: money(seg.navText), ties: /ties to the cent/i.test(seg.tieText) };
  },
  check(a, e) {
    if (!a) return 'no answer';
    if (a.nav !== e.nav) return 'wrong NAV: ' + a.nav + ' vs ' + e.nav;
    if (a.ties !== e.ties) return 'wrong tie verdict';
    return null;
  }
});

/* T3 ---------------------------------------------------------------------- */
/**
 * bps is measured against the SPV's own derived MV, which is defined for all 26 SPVs
 * (five have no NAV of their own). The definition is fixed and identical before and
 * after; on the other two denominators the breach count is 12 (own NAV) and 8 (product
 * NAV), and the ranking outcome is the same either way.
 */
TASKS.push({
  id: 'T3',
  title: 'List every SPV whose derived MV and position MV differ by more than 10 bps',
  async expected(ctx) {
    return ctx.frame.evaluate(() => {
      const seen = new Map();
      EMB.nodes.forEach(n => {
        if (n.kind !== 'vehicle' && n.kind !== 'apex') return;
        if (!seen.has(n.code)) seen.set(n.code, n);
      });
      const out = [];
      seen.forEach((n, code) => {
        if (!n.derived) return;
        const bps = (n.derived - n.position) / n.derived * 1e4;
        if (Math.abs(bps) > 10) out.push(code);
      });
      return out.sort();
    });
  },
  async run(ctx) {
    await ctx.tab('lt');
    // fast path: a position-variance exception report
    if (await ctx.exists('#ltvarbtn')) {
      await ctx.click('#ltvarbtn', 'open position variance exceptions');
      await ctx.bringIntoView('#ltvarwrap');
      const codes = [];
      let guard = 0;
      for (;;) {
        const rows = await ctx.visible('#ltvarwrap', 'tbody tr[data-var-code]');
        rows.forEach(r => { if (codes.indexOf(r.data.varCode) < 0) codes.push(r.data.varCode); });
        if (await ctx.frame.evaluate(() => window.__atBottom('#ltvarwrap'))) break;
        if (!(await ctx.scrollStep('#ltvarwrap'))) break;
        if (++guard > 200) break;
      }
      return codes.sort();
    }
    // manual path: position MV exists only inside the per-row detail drawer, so each SPV
    // has to be opened one at a time. Opening the next row replaces the drawer contents,
    // so no dismiss click is counted - the conservative reading of the baseline cost.
    await ctx.click('#expand', 'expand all');
    await ctx.bringIntoView('#lttablewrap');
    const done = new Set(), breach = [];
    let guard = 0;
    for (;;) {
      for (;;) {
        const rows = await ctx.visible('#lttablewrap', 'tbody tr.rowv');
        const next = rows.find(r =>
          (r.data.kind === 'vehicle' || r.data.kind === 'apex') &&
          r.codetag && !done.has(r.codetag));
        if (!next) break;
        await ctx.click('#tree tbody tr[data-id="' + next.data.id + '"]', 'open ' + next.codetag);
        const d = await ctx.frame.evaluate(() =>
          (document.getElementById('ltdetail').innerText || '').replace(/\s+/g, ' '));
        const der = money((d.match(/Derived MV[^$]*(\$[\d,]+)/) || [])[1]);
        const pos = money((d.match(/Position MV[^$]*(\$[\d,]+)/) || [])[1]);
        if (der && pos != null && Math.abs((der - pos) / der * 1e4) > 10) breach.push(next.codetag);
        done.add(next.codetag);
        if (++guard > 400) break;
      }
      if (await ctx.frame.evaluate(() => window.__atBottom('#lttablewrap'))) break;
      if (!(await ctx.scrollStep('#lttablewrap'))) break;
      if (++guard > 400) break;
    }
    return breach.sort();
  },
  check(a, e) {
    if (!a) return 'no answer';
    const A = JSON.stringify(a), E = JSON.stringify(e);
    return A === E ? null : 'wrong SPV set: ' + A + ' vs ' + E;
  }
});

/* T4 ---------------------------------------------------------------------- */
TASKS.push({
  id: 'T4',
  title: 'Load administrator marks for 12 SPVs and state the resulting product NAV change',
  async expected(ctx) {
    return ctx.frame.evaluate(() => null); // filled after the run, from the engine
  },
  async run(ctx) {
    await ctx.tab('lt');
    await ctx.upload('#bofile', FIXTURE_12);
    await ctx.frame.waitForFunction(
      () => window.__phase1 && window.__phase1.lastOverride, null, { timeout: 20000 });
    const seen = await ctx.frame.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#boout .bo-card'));
      const nav = cards.find(c => /product nav/i.test(c.querySelector('.l').textContent));
      if (!nav) return null;
      const r = nav.getBoundingClientRect();
      return {
        delta: (nav.querySelector('.dl').textContent || '').trim(),
        rows: document.querySelectorAll('#boout tbody tr[data-ov-code]').length,
        onScreen: r.width > 0 && r.height > 0
      };
    });
    if (!seen || !seen.onScreen) return null;
    return { delta: money(seen.delta), rows: seen.rows };
  },
  async truth(ctx) {
    return ctx.frame.evaluate(() => {
      const r = window.__phase1.lastOverride;
      return { delta: Math.round(r.deltaNav), rows: r.accepted.length };
    });
  },
  check(a, e) {
    if (!a) return 'no answer';
    if (a.rows !== 12) return 'expected 12 marks, saw ' + a.rows;
    if (Math.abs(a.delta - e.delta) > 1.5) return 'wrong NAV change: ' + a.delta + ' vs ' + e.delta;
    return null;
  }
});

/* T5 ---------------------------------------------------------------------- */
const T5_QUERY = 'Crimson';
TASKS.push({
  id: 'T5',
  title: 'Trace a named security to its ultimate owners and state each effective percentage',
  async expected(ctx) {
    return ctx.frame.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#revtree tbody tr.rowv'));
      return rows.filter(r => /Ult\. owner/i.test(r.cells[0].innerText || ''))
        .map(r => (r.cells[2].innerText || '').trim() + '=' + (r.cells[5].innerText || '').trim())
        .sort();
    });
  },
  async run(ctx) {
    await ctx.tab('own');
    await ctx.type('#objinput', T5_QUERY);
    const first = await ctx.frame.$('#objlist li');
    if (!first) return null;
    const label = await first.evaluate(el => (el.innerText || '').trim());
    if (/no matches/i.test(label)) return null;
    await ctx.clickHandle(first, 'select ' + label.slice(0, 24));
    await ctx.page.waitForTimeout(500);
    // the roll-up shows only the top few owners until asked for the rest
    if (await ctx.exists('#rollupmore')) await ctx.click('#rollupmore', 'show all ultimate owners');

    // this table has no scroll box of its own; it rides the page
    const owners = [];
    let guard = 0;
    for (;;) {
      const rows = await ctx.visible(':document', '#revtree tbody tr.rowv');
      rows.forEach(r => {
        if (!/Ult\. owner/i.test(r.cells[0] || '')) return;
        const key = (r.cells[2] || '') + '=' + (r.cells[5] || '');
        if (owners.indexOf(key) < 0) owners.push(key);
      });
      if (await ctx.frame.evaluate(() => window.__atBottom(':document'))) break;
      if (!(await ctx.scrollStep(':document'))) break;
      if (++guard > 200) break;
    }
    return owners.sort();
  },
  check(a, e) {
    if (!a || !a.length) return 'no owners read';
    const A = JSON.stringify(a), E = JSON.stringify(e);
    return A === E ? null : 'owner set mismatch (' + a.length + ' read vs ' + e.length + ' present)';
  }
});

/* -------------------------------------------------------------------- runner */
async function openApp(file) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce'
  });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    return (u.startsWith('file:') || u.startsWith('about:') ||
            u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
  });
  await ctx.addInitScript(PAGE_HELPERS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
  await page.evaluate(() => window.__platform.openModule('pro'));
  const frame = await (await page.waitForSelector('#frame-pro')).contentFrame();
  await frame.waitForSelector('.tabbar .tab', { timeout: 30000 });
  await frame.waitForSelector('#tree tbody tr', { timeout: 30000 });
  await frame.waitForFunction(() => window.__phase1 && window.__phase1.ready === true,
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { browser, page, frame, errors };
}

async function runAll(file) {
  const results = {};
  for (const task of TASKS) {
    const app = await openApp(file);
    const ctx = new Ctx(app.frame, app.page);
    const t0 = Date.now();
    let answer = null, err = null;
    try {
      answer = await task.run(ctx);
    } catch (e) {
      err = e.message;
    }
    const seconds = (Date.now() - t0) / 1000;
    let expected = null, problem = err;
    if (!err) {
      try {
        expected = task.truth ? await task.truth(ctx) : await task.expected(ctx);
        problem = task.check(answer, expected);
      } catch (e) { problem = 'expected/check failed: ' + e.message; }
    }
    results[task.id] = {
      id: task.id, title: task.title,
      clicks: ctx.clicks, seconds: +seconds.toFixed(2),
      ok: !problem, problem: problem || null,
      answer: answer, expected: expected,
      trail: ctx.log.slice(0, 8),
      consoleErrors: app.errors.length
    };
    await app.browser.close();
  }
  return results;
}

/* ------------------------------------------------------------------ compare */
function pct(before, after) { return before === 0 ? 0 : ((before - after) / before) * 100; }

function compare(base, cur, target) {
  const lines = [];
  let fail = false;
  lines.push('task  clicks              seconds             verdict');
  for (const id of Object.keys(base)) {
    const b = base[id], c = cur[id];
    if (!c) { lines.push(id + '  MISSING from current run'); fail = true; continue; }
    const dc = pct(b.clicks, c.clicks), ds = pct(b.seconds, c.seconds);
    let verdict;
    if (id === target) {
      const win = dc >= 30 || ds >= 30;
      verdict = win ? 'TARGET improved ' + dc.toFixed(1) + '% clicks / ' + ds.toFixed(1) + '% s'
                    : 'TARGET FAILED to improve 30% (clicks ' + dc.toFixed(1) + '%, s ' + ds.toFixed(1) + '%)';
      if (!win) fail = true;
    } else {
      const regressed = dc < -5 || ds < -5;
      verdict = regressed
        ? 'REGRESSED (clicks ' + dc.toFixed(1) + '%, s ' + ds.toFixed(1) + '%)'
        : 'ok';
      if (regressed) fail = true;
    }
    if (!c.ok) { verdict += ' | ANSWER WRONG: ' + c.problem; fail = true; }
    lines.push(
      id + '   ' + String(b.clicks).padStart(4) + ' -> ' + String(c.clicks).padEnd(9) +
      String(b.seconds.toFixed(2)).padStart(6) + ' -> ' + String(c.seconds.toFixed(2)).padEnd(9) +
      verdict);
  }
  return { fail, lines };
}

/* --------------------------------------------------------------------- main */
(async () => {
  const argv = process.argv.slice(2);
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const isBaseline = argv.indexOf('--baseline') >= 0;
  const cmp = arg('--compare');
  const target = arg('--target');
  let file = argv.find(a => !a.startsWith('--') && /\.html$/.test(a));
  if (!file) file = isBaseline ? 'baseline/precycle_TRACE_Platform.html' : 'dist/TRACE_Platform.html';

  if (!fs.existsSync(file)) { console.error('task_harness: no such file: ' + file); process.exit(2); }

  console.log('task_harness: ' + file + (isBaseline ? '  [BASELINE]' : ''));
  const results = await runAll(file);

  let bad = 0;
  console.log('');
  console.log('task  clicks  seconds  ok   title');
  for (const id of Object.keys(results)) {
    const r = results[id];
    if (!r.ok) bad++;
    console.log(id + '   ' + String(r.clicks).padStart(5) + '  ' +
      String(r.seconds.toFixed(2)).padStart(7) + '  ' + (r.ok ? 'yes' : 'NO ') + '  ' +
      r.title.slice(0, 62));
    if (!r.ok) console.log('        problem: ' + r.problem);
    if (r.consoleErrors) console.log('        console errors: ' + r.consoleErrors);
  }

  const out = arg('--out') || (isBaseline ? 'baseline/harness.json' : null);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(results, null, 1) + '\n');
    console.log('\nwritten to ' + out);
  }

  if (bad) {
    console.error('\nHARNESS FAIL: ' + bad + ' task(s) did not produce the correct answer');
    process.exit(1);
  }

  if (cmp) {
    if (!target) { console.error('\n--compare requires --target <taskId>'); process.exit(2); }
    if (!fs.existsSync(cmp)) { console.error('\nno baseline at ' + cmp); process.exit(2); }
    const base = JSON.parse(fs.readFileSync(cmp, 'utf8'));
    const { fail, lines } = compare(base, results, target);
    console.log('\nCOMPARE vs ' + cmp + '  (target ' + target + ')');
    lines.forEach(l => console.log('  ' + l));
    if (fail) { console.error('\nHARNESS COMPARE FAIL'); process.exit(1); }
    console.log('\nHARNESS COMPARE PASS');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
