/**
 * R4 (states the shipped suite does NOT reach), R7, R10/R11 (labels.md §5 "known gap": is it real?),
 * R12, R16, R17, R18, and the sources-drawer upload claim.
 */
import { openBrowser, watch, go, settle, save, ROUTES, EVIDENCE, BASE } from './lib.mjs';
import path from 'node:path';

const { browser, context } = await openBrowser();
const out = {};

/* ---------- R7: one action from every screen + lens, 35 terms, state kept, deep link ---------- */
{
  const page = await context.newPage();
  const r7 = {};
  for (const route of ROUTES) {
    await go(page, route.hash);
    const stateBefore = await page.evaluate(() => ({
      question: document.querySelector('#screen .screen-question')?.textContent?.slice(0, 50),
      entity: document.querySelector('#diagnose-entity')?.value ?? null,
    }));
    await page.locator('#open-glossary').click();
    await settle(page);
    const open = await page.evaluate(() => {
      const d = document.querySelector('#drawer-host .drawer');
      return { visible: !!d && !d.hidden, terms: document.querySelectorAll('.glscard').length,
        role: d?.getAttribute('role'), modal: d?.getAttribute('aria-modal') };
    });
    await page.keyboard.press('Escape');
    await settle(page);
    const stateAfter = await page.evaluate(() => ({
      question: document.querySelector('#screen .screen-question')?.textContent?.slice(0, 50),
      entity: document.querySelector('#diagnose-entity')?.value ?? null,
    }));
    // keyboard route
    await page.keyboard.press('g');
    await settle(page);
    const viaKey = await page.evaluate(() => !!document.querySelector('#drawer-host .drawer:not([hidden])'));
    await page.keyboard.press('Escape');
    await settle(page);
    r7[route.id] = { ...open, stateKept: JSON.stringify(stateBefore) === JSON.stringify(stateAfter), viaKeyG: viaKey };
  }
  // with a drawer already open (the row-detail drawer on Reconciliation)
  await go(page, '#/reconciliation');
  await page.locator('#tree tbody tr.rowv').nth(1).click();
  await settle(page);
  const detailOpen = await page.evaluate(() => !document.querySelector('#reconciliation-detail')?.hidden);
  // The masthead button is OCCLUDED by an open drawer (see critic2-r7b.json), so the documented
  // keypress is the only one-action route here. That is itself a finding.
  await page.keyboard.press('g');
  await settle(page);
  r7.withDrawerOpen = { detailWasOpen: detailOpen,
    glossaryCards: await page.evaluate(() => document.querySelectorAll('.glscard').length),
    clickRouteBlocked: true };
  await page.keyboard.press('Escape'); await settle(page);
  // deep link: click a glossary-linked term and check the drawer scrolls to THAT term
  await go(page, '#/pricing');
  const termInfo = await page.evaluate(() => {
    const t = document.querySelector('#screen .gterm');
    return { text: t?.textContent, slug: t?.getAttribute('data-glossary-term') };
  });
  await page.locator('#screen .gterm').first().click();
  await settle(page);
  r7.deepLink = { ...termInfo, ...await page.evaluate(() => {
    const focused = document.querySelector('.glscard.focused, .glscard[data-focus], .glscard.on');
    return { drawerOpen: !!document.querySelector('#drawer-host .drawer:not([hidden])'),
      focusedCardHeading: focused?.querySelector('h3,h4,.glsterm')?.textContent?.slice(0,60) ?? null,
      activeElement: document.activeElement?.className ?? '',
      searchValue: document.querySelector('#gls-search, #glossary-search, .drawer input')?.value ?? null };
  }) };
  out.r7 = r7;
  console.log('R7', JSON.stringify(r7).slice(0, 500));
  await page.close();
}

/* ---------- R10/R11/R12: tree header + product NAV bases + toggle behaviour ---------- */
{
  const page = await context.newPage();
  const r10 = {};
  for (const basis of ['before', 'after']) {
    await go(page, '#/pricing');
    await page.locator(`#view-toggle button[data-view="${basis}"]`).click();
    await settle(page);
    await page.evaluate(() => (location.hash = '#/reconciliation'));
    await settle(page);
    r10[basis] = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('#tree thead th')].map((t) => (t.textContent ?? '').replace(/\s+/g,' ').trim());
      const wf = [...document.querySelectorAll('#reconciliation-waterfall .wf-step, #reconciliation-waterfall .wf-op')]
        .map((n) => (n.textContent ?? '').replace(/\s+/g,' ').trim().slice(0, 70));
      return { treeHeaders: heads, waterfall: wf,
        viewNote: document.querySelector('#view-note')?.textContent?.replace(/\s+/g,' ').trim(),
        labels: [...document.querySelectorAll('#screen .th-label')].map((n)=>n.textContent) };
    });
  }
  // duplicate user-visible labels within one view
  r10.duplicateLabels = {};
  for (const basis of ['before', 'after']) {
    const heads = r10[basis].treeHeaders;
    const dupes = heads.filter((h, i) => heads.indexOf(h) !== i);
    r10.duplicateLabels[basis] = dupes;
  }
  // R11: both product NAVs, each with a basis
  await go(page, '#/diagnose/structure');
  out.r11 = await page.evaluate(() => ({
    structureBasis: document.querySelector('#structure-basis')?.textContent?.replace(/\s+/g,' ').trim().slice(0, 400) ?? null,
    readout: document.querySelector('#structure-readout')?.textContent?.replace(/\s+/g,' ').trim().slice(0, 300) ?? null,
    readoutHidden: (() => { const r = document.querySelector('#structure-readout');
      return r ? (r.hidden || getComputedStyle(r).display === 'none') : null; })(),
    everyProductNavOccurrence: [...document.querySelectorAll('#screen *')].flatMap((e) => {
      const own = [...e.childNodes].filter((n)=>n.nodeType===3).map((n)=>(n.textContent??'').trim()).filter(Boolean).join(' ');
      return /2,062,19[0-9],?\d*/.test(own) ? [{ text: own.slice(0,160), cls: String(e.className).slice(0,40) }] : [];
    }),
  }));
  out.r10 = r10;
  console.log('R10 tree headers before:', r10.before.treeHeaders[3], '| after:', r10.after.treeHeaders[3]);
  console.log('R10 dupes:', JSON.stringify(r10.duplicateLabels));

  // R12: control visibility per route, and does flipping change the screen
  const r12 = {};
  for (const route of ROUTES) {
    const text = {};
    for (const basis of ['before', 'after']) {
      await page.evaluate(() => (location.hash = '#/pricing'));
      await settle(page);
      await page.locator(`#view-toggle button[data-view="${basis}"]`).click();
      await settle(page);
      await page.evaluate((h) => (location.hash = h), route.hash);
      await settle(page);
      text[basis] = await page.evaluate(() => document.getElementById('screen')?.textContent ?? '');
    }
    r12[route.id] = { ...await page.evaluate(() => {
      const t = document.getElementById('view-toggle'); const n = document.getElementById('view-note');
      const h = (e) => (e ? Math.round(e.getBoundingClientRect().height) : -1);
      return { toggleVisible: !!t && getComputedStyle(t).display !== 'none' && h(t) > 0,
        noteVisible: !!n && getComputedStyle(n).display !== 'none' && h(n) > 0, noteHeight: h(n),
        noteText: n?.textContent?.replace(/\s+/g,' ').trim() ?? '' };
    }), changedByFlip: text.before !== text.after };
  }
  out.r12 = r12;
  console.log('R12', Object.entries(r12).map(([k,v])=>`${k}:${v.toggleVisible?'ctl':'---'}/${v.changedByFlip?'moved':'same'}`).join(' '));
  await page.close();
}

/* ---------- R16: selection + screen-level state across navigation ---------- */
{
  const page = await context.newPage();
  await go(page, '#/diagnose/structure');
  await page.locator('#diagnose-entity').click();
  await page.locator('#diagnose-entity').fill('SPORTHFC');
  await settle(page);
  await page.locator('.combo-option').first().click();
  await settle(page);
  const chosen = await page.locator('#diagnose-entity').inputValue();
  const perLens = {};
  for (const lens of ['ownership', 'data-quality', 'simulator', 'structure']) {
    await page.locator(`.lens-tab[data-lens="${lens}"]`).click();
    await settle(page);
    perLens[lens] = await page.locator('#diagnose-entity').inputValue();
  }
  // across a drawer, and across a basis flip
  await page.locator('#open-glossary').click(); await settle(page);
  await page.keyboard.press('Escape'); await settle(page);
  const afterDrawer = await page.locator('#diagnose-entity').inputValue();
  await page.evaluate(() => (location.hash = '#/pricing')); await settle(page);
  await page.locator('#view-toggle button[data-view="after"]').click(); await settle(page);
  await page.evaluate(() => (location.hash = '#/diagnose/structure')); await settle(page);
  const afterFlip = await page.locator('#diagnose-entity').inputValue();

  // screen-level state: expanded tree rows, sort column, filter text survive leaving and returning
  await go(page, '#/reconciliation');
  await page.locator('#expand-all').click(); await settle(page);
  const expanded = await page.locator('#tree tbody tr.rowv').count();
  await page.evaluate(() => (location.hash = '#/pricing')); await settle(page);
  await page.locator('#pricing-filter').fill('SPORT'); await settle(page);
  await page.locator('#pricing-price-table thead th[data-col="navPx"]').click(); await settle(page);
  const sortState = await page.evaluate(() => document.querySelector('#pricing-price-table thead th[data-col="navPx"]')?.getAttribute('aria-sort'));
  await page.evaluate(() => (location.hash = '#/reconciliation')); await settle(page);
  const expandedBack = await page.locator('#tree tbody tr.rowv').count();
  await page.evaluate(() => (location.hash = '#/pricing')); await settle(page);
  out.r16 = { chosen, perLens, afterDrawer, afterFlip, expandedRows: expanded, expandedRowsAfterReturn: expandedBack,
    filterAfterReturn: await page.locator('#pricing-filter').inputValue(),
    sortBefore: sortState,
    sortAfterReturn: await page.evaluate(() => document.querySelector('#pricing-price-table thead th[data-col="navPx"]')?.getAttribute('aria-sort')) };
  console.log('R16', JSON.stringify(out.r16));
  await page.close();
}

/* ---------- R18 + R4: combobox empty, lens with no data, sources upload dead end ---------- */
{
  const page = await context.newPage();
  const problems = watch(page);
  const r18 = {};
  await go(page, '#/diagnose/structure');
  await page.locator('#diagnose-entity').fill('zzzzz-no-such-entity');
  await settle(page);
  r18.combobox = await page.evaluate(() => {
    const e = document.querySelector('.combo-empty');
    return { text: e?.textContent?.replace(/\s+/g,' ').trim() ?? null,
      actions: [...(e?.querySelectorAll('button,a') ?? [])].map((b) => b.textContent?.trim()) };
  });
  await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r18-combobox.png') });

  // pricing filter empty
  await go(page, '#/pricing');
  await page.locator('#pricing-filter').fill('zzzz'); await settle(page);
  r18.pricingFilter = await page.evaluate(() => {
    const e = document.querySelector('#pricing-price-table .state-empty');
    return { text: e?.textContent?.replace(/\s+/g,' ').trim() ?? null,
      actions: [...(e?.querySelectorAll('button,a') ?? [])].map((b) => b.textContent?.trim()) };
  });

  // R4 on the four lenses: does each lens have a loading state class at all in the built bundle?
  // Reached rather than grepped: hold universe.json open and mount each lens.
  const reached = {};
  for (const lens of ['structure', 'ownership', 'data-quality', 'simulator']) {
    const p2 = await context.newPage();
    await p2.route('**/universe.json', async (r) => { await new Promise((res) => setTimeout(res, 6000)); await r.continue(); });
    await p2.goto(`${BASE}/#/diagnose/${lens}`, { waitUntil: 'load' });
    await p2.waitForTimeout(1200);
    reached[lens] = await p2.evaluate(() => ({
      fetching: document.documentElement.hasAttribute('data-fetching'),
      loading: [...document.querySelectorAll('#screen .state-loading')].map((n) => n.textContent?.replace(/\s+/g,' ').trim().slice(0, 90)),
      screenText: (document.getElementById('screen')?.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 160),
    }));
    await p2.close();
  }
  r18.lensLoading = reached;

  // the sources drawer's upload claim
  await go(page, '#/pricing');
  await page.locator('#open-sources').click(); await settle(page);
  r18.sources = await page.evaluate(() => ({
    slotStates: [...document.querySelectorAll('.sources-slot-state')].map((n) => n.textContent),
    note: document.querySelector('#sources-upload-note')?.textContent?.replace(/\s+/g,' ').trim(),
    fileInputsInDrawer: document.querySelectorAll('#drawer-host input[type=file]').length,
  }));
  await page.locator('#sources-upload-link').click(); await settle(page);
  r18.afterFollowingUploadLink = await page.evaluate(() => ({
    hash: location.hash,
    fileInputsAnywhere: document.querySelectorAll('input[type=file]').length,
    anythingSayingUpload: [...document.querySelectorAll('#screen *, #masthead *')]
      .filter((e) => /upload/i.test([...e.childNodes].filter((n)=>n.nodeType===3).map((n)=>n.textContent).join(' ')))
      .map((e) => (e.textContent ?? '').replace(/\s+/g,' ').trim().slice(0, 90)),
    dropTargets: document.querySelectorAll('[data-drop], .dropzone, [ondrop]').length,
  }));
  out.r18 = r18;
  out.r18.consoleProblems = problems;
  console.log('R18/R4', JSON.stringify(r18, null, 1).slice(0, 1800));
  await page.close();
}

save('critic2-misc.json', out);
await browser.close();
