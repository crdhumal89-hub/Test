/**
 * R4 — the ten panels the criterion enumerates, three states each. The shipped states.spec.ts
 * reaches 3 of them (tree, price table, walk) plus one error path on the structure graph.
 */
import { openBrowser, watch, settle, save, BASE, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const out = {};

async function fresh({ hold, patch } = {}) {
  const page = await context.newPage();
  const problems = watch(page);
  if (hold) await page.route(hold, async (r) => { await new Promise((res) => setTimeout(res, 7000)); await r.continue(); });
  if (patch) for (const [glob, fn] of patch) {
    await page.route(glob, async (r) => { const resp = await r.fetch(); const body = await resp.json();
      // eslint-disable-next-line no-eval
      (new Function('body', fn))(body); await r.fulfill({ json: body }); });
  }
  return { page, problems };
}
const READ = (sel) => (s) => s;
async function snap(page, label, selector) {
  return page.evaluate((sel) => {
    const scope = sel ? document.querySelector(sel) : document.getElementById('screen');
    const txt = (n) => (n?.innerText ?? n?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      loading: [...(scope?.querySelectorAll('.state-loading') ?? [])].map(txt),
      empty: [...(scope?.querySelectorAll('.state-empty') ?? [])].map((n) => ({ text: txt(n), actions: [...n.querySelectorAll('button,a')].map((b) => b.textContent?.trim()) })),
      error: [...(scope?.querySelectorAll('.state-error') ?? [])].map((n) => ({ text: txt(n), role: n.getAttribute('role'), actions: [...n.querySelectorAll('button,a')].map((b) => b.textContent?.trim()) })),
      bareDash: txt(scope) === '—',
      blank: txt(scope) === '',
      text: txt(scope).slice(0, 140),
    };
  }, selector);
}

/* ---- 1. the four Diagnose lenses: LOADING ---- */
out.lensLoading = {};
for (const lens of ['structure', 'ownership', 'data-quality', 'simulator']) {
  const { page, problems } = await fresh({ hold: '**/universe.json' });
  await page.goto(`${BASE}/#/diagnose/${lens}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  out.lensLoading[lens] = { ...await snap(page), fetching: await page.evaluate(() => document.documentElement.hasAttribute('data-fetching')), problems };
  await page.close();
}

/* ---- 2. the four Diagnose lenses: EMPTY (an entity with no data for that lens) ---- */
out.lensEmpty = {};
for (const lens of ['structure', 'ownership', 'data-quality', 'simulator']) {
  const { page, problems } = await fresh();
  await page.goto(`${BASE}/#/diagnose/${lens}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  // pick a scoped entity that has no rows for the lens: a leaf security code
  await page.locator('#diagnose-entity').fill('DUNK');
  await settle(page);
  const opt = page.locator('.combo-option').first();
  if (await opt.count()) { await opt.click(); await settle(page); }
  out.lensEmpty[lens] = { ...await snap(page), problems };
  await page.close();
}

/* ---- 3. the four Diagnose lenses: ERROR (malformed fixture) ---- */
out.lensError = {};
for (const lens of ['structure', 'ownership', 'data-quality', 'simulator']) {
  const { page, problems } = await fresh({ patch: [['**/universe.json', 'for (const k of Object.keys(body)) { if (Array.isArray(body[k])) body[k] = "broken"; }']] });
  await page.goto(`${BASE}/#/diagnose/${lens}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  out.lensError[lens] = { ...await snap(page), problems };
  await page.close();
}
/* simulator + structure error via the cascade fixture */
for (const lens of ['structure', 'simulator']) {
  const { page, problems } = await fresh({ patch: [['**/simulator.json', 'for (const k of Object.keys(body)) { if (Array.isArray(body[k])) body[k] = "broken"; }']] });
  await page.goto(`${BASE}/#/diagnose/${lens}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  out.lensError[lens + '-simfixture'] = { ...await snap(page), problems };
  await page.close();
}

/* ---- 4. the two upload slots ---- */
{
  const { page, problems } = await fresh();
  await page.goto(`${BASE}/#/pricing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  await page.locator('#open-sources').click();
  await settle(page);
  out.uploadSlots = await page.evaluate(() => ({
    slots: [...document.querySelectorAll('.sources-slot')].map((s) => ({
      key: s.getAttribute('data-slot'), text: (s.innerText ?? '').replace(/\s+/g,' ').trim(),
      controls: [...s.querySelectorAll('button,input,a')].length,
      states: [...s.querySelectorAll('.state-loading,.state-empty,.state-error')].length,
    })),
    fileInputs: document.querySelectorAll('input[type=file]').length,
    theOneRealControl: document.querySelector('#sources-upload-link')?.textContent,
    claim: document.querySelector('#sources-upload-note')?.textContent?.replace(/\s+/g,' ').trim(),
  }));
  await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r4-upload-slots.png') });
  out.uploadSlots.problems = problems;
  await page.close();
}

/* ---- 5. the combobox result list: loading / empty / error ---- */
{
  const res = {};
  // loading: hold the universe while the combobox is opened
  const a = await fresh({ hold: '**/universe.json' });
  await a.page.goto(`${BASE}/#/diagnose/ownership`, { waitUntil: 'load' });
  await a.page.waitForTimeout(1200);
  await a.page.locator('#diagnose-entity').click().catch(() => {});
  await a.page.locator('#diagnose-entity').fill('AP').catch(() => {});
  await a.page.waitForTimeout(600);
  res.loading = await a.page.evaluate(() => ({
    listbox: document.querySelector('.combo-list, [role=listbox]')?.className ?? null,
    options: document.querySelectorAll('.combo-option').length,
    loadingState: document.querySelectorAll('.combo-list .state-loading, .combo-loading').length,
    text: (document.querySelector('.combo-list, [role=listbox]')?.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 120),
  }));
  await a.page.close();
  // empty
  const b = await fresh();
  await b.page.goto(`${BASE}/#/diagnose/ownership`, { waitUntil: 'load' });
  await b.page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(b.page);
  await b.page.locator('#diagnose-entity').fill('zzzz-nothing');
  await settle(b.page);
  res.empty = await b.page.evaluate(() => { const e = document.querySelector('.combo-empty');
    return { text: (e?.innerText ?? e?.textContent ?? '').replace(/\s+/g,' ').trim(),
      actionElements: [...(e?.querySelectorAll('button,a') ?? [])].map((x) => x.textContent) }; });
  await b.page.close();
  // error
  const c = await fresh({ patch: [['**/universe.json', 'body.positions = "broken";']] });
  await c.page.goto(`${BASE}/#/diagnose/ownership`, { waitUntil: 'load' });
  await c.page.waitForTimeout(2500);
  await c.page.locator('#diagnose-entity').fill('AP').catch(() => {});
  await c.page.waitForTimeout(600);
  res.error = { ...await c.page.evaluate(() => ({
    options: document.querySelectorAll('.combo-option').length,
    comboText: (document.querySelector('.combo-list, [role=listbox], .combo-empty')?.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 160),
    screenError: [...document.querySelectorAll('.state-error')].map((n) => (n.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 120)),
  })), problems: c.problems };
  await c.page.close();
  out.combobox = res;
}

/* ---- 6. the lazily-fetched universe fixture: error ---- */
{
  const { page, problems } = await fresh();
  await page.route('**/universe.json', (r) => r.abort());
  await page.goto(`${BASE}/#/diagnose/ownership`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  out.universeFetchAborted = { ...await snap(page), problems };
  await page.screenshot({ path: path.join(EVIDENCE, 'critic2-r4-universe-aborted.png') });
  await page.close();
}

save('critic2-r4.json', out);
for (const [k, v] of Object.entries(out)) {
  if (k === 'uploadSlots' || k === 'combobox' || k === 'universeFetchAborted') { console.log('==', k, JSON.stringify(v).slice(0, 700)); continue; }
  for (const [k2, v2] of Object.entries(v)) console.log(k, k2, '| loading', v2.loading?.length, 'empty', v2.empty?.length, 'error', v2.error?.length, '| blank', v2.blank, '| problems', (v2.problems ?? []).length, '|', String(v2.text).slice(0, 70));
}
await browser.close();
