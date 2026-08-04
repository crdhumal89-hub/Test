/**
 * R13 — all four exports, both bases; every tied figure checked for VISIBILITY on the screen at the
 *       moment of export (the shipped test reads textContent, which a hidden subview also has).
 * R15 — the same four exports plus both drawers with every off-origin request aborted.
 */
import { openBrowser, watch, settle, save, BASE, EVIDENCE } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const TMP = '/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/dl';
fs.mkdirSync(TMP, { recursive: true });

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i+1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const usd = (x) => (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 });
const count = (x) => (x ? Math.round(x).toLocaleString('en-US') : '0');
const price = (x) => x.toFixed(6);

/** Read the string a parity key renders AND whether the operator can see it right now. */
async function screenValue(page, key) {
  return page.evaluate((k) => {
    const n = document.querySelector(`[data-parity="${k}"]`);
    if (!n) return null;
    const b = n.getBoundingClientRect();
    const s = getComputedStyle(n);
    return { text: (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
      visible: b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !n.closest('[hidden]'),
      inHiddenSubtree: !!n.closest('[hidden]'),
      hiddenAncestorId: n.closest('[hidden]')?.id ?? null };
  }, key);
}

async function download(page, buttonRe, tag) {
  const wait = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: new RegExp(buttonRe, 'i') }).first().click();
  const d = await wait;
  const target = path.join(TMP, `${tag}-${d.suggestedFilename()}`);
  await d.saveAs(target);
  return { target, bytes: fs.statSync(target).size, name: d.suggestedFilename() };
}

const { browser, context } = await openBrowser();
const out = { r13: {}, r15: {} };

/* --------------------------------- R13 --------------------------------- */
for (const basis of ['before', 'after']) {
  const page = await context.newPage();
  const problems = watch(page);
  await page.goto(`${BASE}/#/pricing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  await page.locator(`#view-toggle button[data-view="${basis}"]`).click();
  await settle(page);

  const sendTo = await download(page, 'export pricing', `sendto-${basis}`);
  const table = parseCsv(fs.readFileSync(sendTo.target, 'utf8'));
  const header = table[0];
  const rows = table.slice(1).filter((r) => r.length > 1);
  const col = (r, name) => r[header.indexOf(name)];

  const ties = [];
  for (const code of ['ASCHON', 'SPORTHLD', 'APCAXXII']) {
    const sym = await screenValue(page, `pricing.fund.${code}.symbol`);
    const row = rows.find((r) => col(r, 'Symbol') === sym?.text);
    if (!row) { ties.push({ code, error: 'no row for symbol ' + sym?.text }); continue; }
    for (const [fileCol, key, fmt] of [
      ['Local Price', `pricing.fund.${code}.publish_px`, price],
      ['Respective Qty', `pricing.walk.fund.${code}.global_qty`, count],
      ['Local MV', `pricing.walk.fund.${code}.nav`, usd],
    ]) {
      const fileNum = Number(String(col(row, fileCol)).replace(/[$,()]/g, ''));
      const sv = await screenValue(page, key);
      ties.push({ code, fileColumn: fileCol, fileValue: col(row, fileCol), formatted: fmt(fileNum),
        parityKey: key, screenText: sv?.text ?? null, tie: sv ? fmt(fileNum) === sv.text : false,
        visibleOnScreenAtExport: sv?.visible ?? false, hiddenInside: sv?.hiddenAncestorId ?? null });
    }
  }
  // what does the operator see for Respective Qty / Local MV if they open the walk subview?
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settle(page);
  const afterOpeningWalk = {};
  for (const code of ['ASCHON']) for (const slot of ['global_qty', 'nav']) {
    afterOpeningWalk[`${code}.${slot}`] = await screenValue(page, `pricing.walk.fund.${code}.${slot}`);
  }
  const walkHeaders = await page.evaluate(() => [...document.querySelectorAll('#pricing-walk-table thead th')].map((t) => (t.textContent ?? '').trim()));

  out.r13[`sendToPricing-${basis}`] = { file: sendTo, header, rowCount: rows.length, ties,
    afterOpeningWalkSubview: afterOpeningWalk, walkHeaders, problems };
  await page.close();
}
console.log('R13 send-to-pricing:', JSON.stringify(out.r13['sendToPricing-before'].ties.map((t) => ({ c: t.fileColumn, tie: t.tie, vis: t.visibleOnScreenAtExport, hid: t.hiddenInside })), null, 0));
console.log('walk headers:', JSON.stringify(out.r13['sendToPricing-before'].walkHeaders));
console.log('after opening walk:', JSON.stringify(out.r13['sendToPricing-before'].afterOpeningWalkSubview));
console.log('files identical in both bases:',
  fs.readFileSync(out.r13['sendToPricing-before'].file.target, 'utf8') === fs.readFileSync(out.r13['sendToPricing-after'].file.target, 'utf8'));

/* --------------------------------- R15 --------------------------------- */
{
  const page = await context.newPage();
  const problems = watch(page);
  const blocked = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url); return route.abort();
  });
  const files = [];
  for (const hash of ['#/reconciliation', '#/pricing', '#/diagnose/structure', '#/diagnose/ownership', '#/diagnose/data-quality', '#/diagnose/simulator']) {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.dataset.fetching);
    await settle(page);
  }
  // both drawers
  await page.goto(`${BASE}/#/pricing`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  const drawerTerms = [];
  for (const opener of ['#open-glossary', '#open-sources']) {
    await page.keyboard.press('Escape'); await settle(page);
    await page.locator(opener).click(); await settle(page);
    drawerTerms.push({ opener, visible: await page.evaluate(() => [...document.querySelectorAll('.drawer')].filter((d) => d.getBoundingClientRect().height > 0).map((d) => d.id)),
      glossaryCards: await page.evaluate(() => document.querySelectorAll('.glscard').length) });
  }
  await page.keyboard.press('Escape'); await settle(page);
  // all four exports
  files.push(await download(page, 'export pricing', 'offline-sendto'));
  files.push(await download(page, 'download excel', 'offline-pricing-xlsx'));
  await page.goto(`${BASE}/#/reconciliation`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
  files.push(await download(page, 'export csv', 'offline-lookthrough'));
  files.push(await download(page, 'download excel', 'offline-recon-xlsx'));
  // are the workbooks real?
  const workbooks = files.filter((f) => f.name.endsWith('.xlsx')).map((f) => {
    const b = XLSX.read(fs.readFileSync(f.target), { type: 'buffer' });
    return { name: f.name, bytes: f.bytes, sheets: b.SheetNames };
  });
  out.r15 = { blockedRequests: blocked, consoleProblems: problems, files, workbooks, drawerTerms };
  console.log('R15 blocked:', blocked.length, '| problems:', problems.length, '| files:', files.map((f) => `${f.name}=${f.bytes}B`).join(' | '));
  console.log('R15 workbooks:', JSON.stringify(workbooks));
  console.log('R15 drawers:', JSON.stringify(drawerTerms));
  await page.close();
}

save('critic2-r13-r15.json', out);
await browser.close();
