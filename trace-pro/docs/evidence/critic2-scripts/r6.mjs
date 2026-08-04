/**
 * R6 — all four clauses, measured independently.
 * (a) outline:none scan  (b) tab walk vs an INDEPENDENT census of click targets (the shipped test
 * never checks that the walk reached everything)  (c) role/name/keyboard on the five named
 * non-native target classes  (d) drawers: Esc, focus RESTORE and focus TRAP (trap is untested in
 * tests/e2e/rubric-focus.spec.ts).
 */
import { openBrowser, watch, go, settle, save, ROUTES, EVIDENCE } from './lib.mjs';
import path from 'node:path';

const lum = ([r, g, b]) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s ?? ''); if (!m) return null;
  const p = m[1].split(/[,\s/]+/).map(Number); return [p[0], p[1], p[2]]; };
const contrast = (a, b) => { const [x, y] = [parse(a), parse(b)]; if (!x || !y) return 0;
  const [l1, l2] = [lum(x), lum(y)]; return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)); };

const CENSUS = () => {
  const sel = 'button, a[href], input, select, textarea, [role=button], [role=tab], [role=columnheader], [role=option], [role=checkbox], [role=switch], [tabindex]';
  const out = [];
  for (const el of document.querySelectorAll('#masthead ' + sel.split(', ').join(', #masthead ') + ', #screen ' + sel.split(', ').join(', #screen '))) {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (el.closest('[hidden]') || s.display === 'none' || s.visibility === 'hidden' || b.width === 0 || b.height === 0) continue;
    out.push({
      key: `${el.tagName.toLowerCase()}[${el.getAttribute('role') ?? ''}]#${el.id || ''}.${String(el.className).split(' ')[0] || ''}`,
        name: (el.getAttribute('aria-label') ?? (el.labels?.[0]?.textContent) ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      tabindex: el.getAttribute('tabindex'),
      native: /^(button|a|input|select|textarea)$/.test(el.tagName.toLowerCase()),
      role: el.getAttribute('role') ?? '',
      w: Math.round(b.width), h: Math.round(b.height),
    });
  }
  return out;
};

const WALK_STEP = () => {
  const n = document.activeElement;
  if (!n || n === document.body) return null;
  if (n.getAttribute('data-c2seen')) return { repeat: true, key: n.getAttribute('data-c2key') };
  const s = getComputedStyle(n); const b = n.getBoundingClientRect();
  const key = `${n.tagName.toLowerCase()}[${n.getAttribute('role') ?? ''}]#${n.id || ''}.${String(n.className).split(' ')[0] || ''}`;
  n.setAttribute('data-c2seen', '1'); n.setAttribute('data-c2key', key);
  let fill = 'rgb(255,255,255)';
  for (let p = n; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
    if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { fill = c; break; } }
  return { key, name: (n.getAttribute('aria-label') ?? (n.labels?.[0]?.textContent) ?? n.textContent ?? '').replace(/\s+/g,' ').trim().slice(0,40),
    tag: n.tagName.toLowerCase(), role: n.getAttribute('role') ?? '',
    w: Math.round(b.width), h: Math.round(b.height),
    hiddenAncestor: !!n.closest('[hidden]'),
    offscreen: b.bottom < 0 || b.top > innerHeight + document.documentElement.scrollHeight,
    outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth,
    tones: [s.outlineColor, ...(s.boxShadow.match(/rgba?\([^)]+\)/g) ?? [])], fill };
};

const { browser, context } = await openBrowser();
const report = { routes: {}, css: null, namedTargets: {}, drawers: {} };

// (a) stylesheet scan
{
  const page = await context.newPage();
  await go(page, '#/reconciliation');
  report.css = await page.evaluate(() => {
    const bare = [], focusRules = [];
    for (const sheet of [...document.styleSheets]) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of [...rules]) {
        if (!(r instanceof CSSStyleRule)) continue;
        if (/outline\s*:\s*none/.test(r.cssText) && !/:focus-visible/.test(r.selectorText)) bare.push(r.selectorText);
        if (/:focus-visible/.test(r.selectorText)) focusRules.push(r.selectorText);
      }
    }
    return { bareOutlineNone: bare, focusVisibleRuleCount: focusRules.length, focusVisibleRules: focusRules.slice(0, 40) };
  });
  await page.close();
}

for (const route of ROUTES) {
  const page = await context.newPage();
  const problems = watch(page);
  await go(page, route.hash);
  const census = await page.evaluate(CENSUS);
  const stops = [];
  // The app focuses `#screen` on load, so a walk that stops at the first BODY would miss the whole
  // masthead. One wrap is allowed, which is what a real Tab cycle does.
  let wraps = 0;
  for (let i = 0; i < 500; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(WALK_STEP);
    if (!s) { if (++wraps > 1) break; continue; }
    if (s.repeat) break;           // cycle closed
    stops.push(s);
  }
  const stopKeys = new Set(stops.map((s) => s.key));
  const unreached = census.filter((c) => !stopKeys.has(c.key));
  const graded = stops.map((s) => ({ ...s, ringContrast: Math.max(...s.tones.map((t) => contrast(t, s.fill))) }));
  report.routes[route.id] = {
    censusCount: census.length, stopCount: stops.length,
    unreachedControls: unreached,
    zeroArea: graded.filter((s) => s.w < 1 || s.h < 1).map((s) => s.key),
    untyped: graded.filter((s) => /^(div|span|td|tr|th)$/.test(s.tag) && !s.role).map((s) => s.key),
    thinRing: graded.filter((s) => s.outlineStyle === 'none' || parseFloat(s.outlineWidth) < 2).map((s) => `${s.key} ${s.outlineStyle} ${s.outlineWidth}`),
    dimRing: graded.filter((s) => s.ringContrast < 3).map((s) => `${s.key} ${s.ringContrast}:1`),
    hiddenStops: graded.filter((s) => s.hiddenAncestor).map((s) => s.key),
    unnamed: graded.filter((s) => !s.name).map((s) => s.key),
    consoleProblems: problems,
  };
  console.log(route.id, '| census', census.length, 'stops', stops.length, '| unreached', unreached.length,
    '| zeroArea', report.routes[route.id].zeroArea.length, '| thin', report.routes[route.id].thinRing.length,
    '| dim', report.routes[route.id].dimRing.length, '| unnamed', report.routes[route.id].unnamed.length);
  await page.close();
}

/* (c) the five named non-native click-target classes: role, name, keyboard activation. */
const NAMED = [
  ['sortable price-table header', '#/pricing', '#pricing-price-table thead th[data-col]'],
  ['sortable walk header', '#/pricing', '#pricing-walk-table thead th[data-col]'],
  ['reconciliation tree header', '#/reconciliation', '#tree thead th'],
  ['accordion bucket header', '#/diagnose/data-quality', '.dq-bucket summary, .dq-bucket [role="button"], .dq-bucket button'],
  ['graph node', '#/diagnose/structure', '#structure-stage .strnode'],
  ['ribbon segment', '#/diagnose/ownership', '#ownership-ribbon .own-seg'],
  ['flag chip', '#/reconciliation', '#reconciliation-exceptions .chip'],
];
for (const [label, hash, selector] of NAMED) {
  const page = await context.newPage();
  await go(page, hash);
  if (label === 'sortable walk header') { await page.locator('#pricing-subview button[data-subview="walk"]').click(); await settle(page); }
  const info = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return { count: els.length, sample: els.slice(0, 3).map((e) => ({
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role') ?? '',
      name: (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g,' ').trim().slice(0, 50),
      tabindex: e.getAttribute('tabindex'), focusable: e.tabIndex >= 0,
      box: (() => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    })) };
  }, selector);
  // keyboard activation: focus the first one, press Enter, see if the screen text changed
  let activated = null;
  if (info.count) {
    const first = page.locator(selector).first();
    try {
      await first.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => document.getElementById('screen').textContent);
      await first.focus();
      const focused = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
      await page.keyboard.press('Enter');
      await settle(page);
      const after = await page.evaluate(() => document.getElementById('screen').textContent);
      activated = { focusReceived: focused, enterChangedScreen: before !== after };
    } catch (e) { activated = { error: String(e).slice(0, 120) }; }
  }
  report.namedTargets[label] = { selector, ...info, keyboard: activated };
  console.log('named:', label, JSON.stringify({ count: info.count, role: info.sample[0]?.role, focusable: info.sample[0]?.focusable, kbd: activated }));
  await page.close();
}

/* (d) drawers: Esc, restore, TRAP */
for (const [label, opener] of [['glossary', '#open-glossary'], ['sources', '#open-sources']]) {
  const page = await context.newPage();
  await go(page, '#/pricing');
  await page.locator(opener).click();
  await settle(page);
  const inside = await page.evaluate(() => !!document.activeElement?.closest('#drawer-host'));
  const trap = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    trap.push(await page.evaluate(() => {
      const a = document.activeElement;
      return { inDrawer: !!a?.closest('#drawer-host'), key: `${a?.tagName?.toLowerCase()}#${a?.id || ''}` };
    }));
  }
  await page.keyboard.press('Escape');
  await settle(page);
  const closed = await page.evaluate(() => !document.querySelector('#drawer-host .drawer'));
  const restored = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? '');
  report.drawers[label] = { focusMovedInside: inside, escapeClosed: closed, focusRestoredTo: restored,
    trapEscapes: trap.filter((t) => !t.inDrawer), trapStops: trap.length };
  console.log('drawer', label, 'inside', inside, 'closed', closed, 'restored', restored, 'escapes', report.drawers[label].trapEscapes.length);
  await page.close();
}

save('critic2-r6.json', report);
await browser.close();
