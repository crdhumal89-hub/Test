import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';

const BASE = 'http://127.0.0.1:4178/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
page.on('pageerror', (e) => problems.push(String(e)));

// ---------- R7: term count + deep link from a label
await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.click('#open-glossary');
await page.waitForTimeout(600);
const terms = await page.locator('.glscard').count();
const glsHasNav = await page.evaluate(() => document.body.innerText.includes('net asset value'));
console.log('R7 terms=', terms, 'glossary defines net asset value:', glsHasNav);
await page.keyboard.press('Escape');
// is any on-screen label a glossary deep link?
const deepLinks = await page.evaluate(() =>
  document.querySelectorAll('#screen [data-glossary-term], #screen .gterm, #screen a[href*="glossary"]').length
);
console.log('R7 glossary-linked labels on the Reconciliation screen:', deepLinks);

// ---------- R16: screen-level state survives leaving and returning
await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('#expand-all');
await page.waitForTimeout(800);
const expandedRows = await page.locator('#tree tbody tr.rowv').count();
await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
await page.waitForTimeout(800);
// set a filter and a sort on pricing
await page.fill('#pricing-filter, input[placeholder*="Filter by fund"]', 'SPORTA');
await page.waitForTimeout(600);
const filteredRows = await page.locator('#pricing-price-table tbody tr').count();
await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
await page.waitForTimeout(900);
const rowsAfterReturn = await page.locator('#tree tbody tr.rowv').count();
await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
await page.waitForTimeout(900);
const filterAfterReturn = await page.inputValue('#pricing-filter, input[placeholder*="Filter by fund"]').catch(() => 'ERR');
console.log(`R16 tree rows: expanded=${expandedRows} afterReturn=${rowsAfterReturn}; pricing filter after return="${filterAfterReturn}" (rows when filtered=${filteredRows})`);

// R16: selection across the basis toggle
await page.goto(BASE + '#/diagnose/ownership', { waitUntil: 'load' });
await page.waitForTimeout(1200);
const sel0 = await page.inputValue('#diagnose-entity');
await page.click('#view-toggle button[data-view="after"]');
await page.waitForTimeout(800);
const sel1 = await page.inputValue('#diagnose-entity');
console.log(`R16 entity across basis toggle: "${sel0}" -> "${sel1}"`);

// ---------- R10/R11: pricing table headers in both bases
for (const view of ['before', 'after']) {
  await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  if (view === 'after') {
    await page.click('#view-toggle button[data-view="after"]');
    await page.waitForTimeout(900);
  }
  const h = await page.evaluate(() => ({
    headers: Array.from(document.querySelectorAll('#pricing-price-table thead th, #pricing-price-table th')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
    score: Array.from(document.querySelectorAll('#pricing-score [data-parity]')).map((e) => [e.getAttribute('data-parity'), e.textContent.replace(/\s+/g, ' ').trim()]).slice(0, 12),
    viewNote: document.getElementById('view-note')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
    row1: Array.from(document.querySelectorAll('#pricing-price-table tbody tr')).slice(0, 1).map((tr) => Array.from(tr.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim())),
  }));
  console.log(`R10/R11 pricing ${view}:`, JSON.stringify(h, null, 1));
}

// ---------- R18: a lens for an entity with no data
await page.goto(BASE + '#/diagnose/ownership', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.fill('#diagnose-entity', 'CRIMH');
await page.waitForTimeout(500);
const opts = await page.locator('.combo-option').count();
if (opts) await page.locator('.combo-option').first().click();
await page.waitForTimeout(900);
const emptyLens = await page.evaluate(() => ({
  states: Array.from(document.querySelectorAll('.state-empty, .state-error, .state-loading')).map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 120)),
  checks: document.getElementById('ownership-checks')?.textContent.replace(/\s+/g, ' ').trim(),
}));
console.log('R18 ownership lens for CRIMH:', JSON.stringify(emptyLens));

// ---------- issues.md §M: does a non-conserving entity show the real figure?
await page.goto(BASE + '#/diagnose/ownership', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.fill('#diagnose-entity', 'ABFSUB6');
await page.waitForTimeout(600);
const n = await page.locator('.combo-option').count();
if (n) await page.locator('.combo-option').first().click();
await page.waitForTimeout(1000);
const conserve = await page.evaluate(() => ({
  checks: document.getElementById('ownership-checks')?.textContent.replace(/\s+/g, ' ').trim(),
  status: document.getElementById('ownership-status')?.textContent.replace(/\s+/g, ' ').trim(),
}));
console.log('M: ABFSUB6 ->', JSON.stringify(conserve));

console.log('console problems during batch:', problems);
await browser.close();
