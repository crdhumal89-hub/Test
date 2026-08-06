/**
 * Critic-3 fourth pass.
 *   R6  — the roving-tabindex keyboard path on the 46 graph nodes, and the real accordion control.
 *   R7  — a screenshot of the occluded glossary button.
 *   R15 — the criterion's OWN scope: both drawers AND all four exports, off-origin blocked. The
 *         shipped offline test opens only the glossary and runs no export, and the exports are the
 *         one feature that needs the vendored spreadsheet library.
 *   R13 — one independent tie-out per export, parsed from the downloaded bytes.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const OUT = path.resolve(import.meta.dirname, '..');
const DL = path.resolve(import.meta.dirname, '../../../test-results/critic3-downloads');
let visit = 0;

async function settled(page: import('@playwright/test').Page, quiet = 300): Promise<void> {
  await page.evaluate(
    (q) =>
      new Promise<void>((res) => {
        let last = Date.now();
        const mo = new MutationObserver(() => {
          last = Date.now();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        const tick = (): void => {
          if (Date.now() - last >= q) {
            mo.disconnect();
            res();
          } else setTimeout(tick, 40);
        };
        setTimeout(tick, 40);
      }),
    quiet
  );
}
async function fresh(page: import('@playwright/test').Page, hash: string): Promise<void> {
  visit += 1;
  await page.goto(`/?v=${visit}${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settled(page);
}
function write(name: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n');
}

test('R6 — the graph nodes and the accordion headers, by keyboard', async ({ page }) => {
  const out: Record<string, unknown> = {};
  await fresh(page, '#/diagnose/structure');
  await page.locator('#structure-stage svg .strnode').first().focus();
  const trail: string[] = [];
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'End', 'Home']) {
    await page.keyboard.press(key);
    trail.push(
      `${key} -> ${await page.evaluate(() => document.activeElement?.getAttribute('data-code') ?? document.activeElement?.tagName ?? 'none')}`
    );
  }
  out.graphRoving = {
    nodes: await page.locator('#structure-stage svg .strnode').count(),
    tabbable: await page.locator('#structure-stage svg .strnode[tabindex="0"]').count(),
    trail,
  };
  // Enter must select the focused node.
  const focusedCode = await page.evaluate(() => document.activeElement?.getAttribute('data-code'));
  await page.keyboard.press('Enter');
  await settled(page);
  out.graphActivate = {
    focusedCode,
    selectedAfterEnter: (await page.locator('#structure-focus').inputValue().catch(() => null)) ??
      (await page.locator('#diagnose-entity').inputValue()),
  };

  await fresh(page, '#/diagnose/data-quality');
  out.accordion = await page.evaluate(() => {
    const buckets = [...document.querySelectorAll('.dq-bucket')];
    return buckets.map((b) => {
      const btn = b.querySelector('button, [role="button"]') as HTMLElement | null;
      return {
        control: btn ? `${btn.tagName.toLowerCase()}[role=${btn.getAttribute('role') ?? ''}]` : null,
        ariaExpanded: btn?.getAttribute('aria-expanded') ?? null,
        tabIndex: btn?.tabIndex ?? null,
        name: (btn?.getAttribute('aria-label') ?? btn?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    });
  });
  // And it toggles from the keyboard.
  const first = page.locator('.dq-bucket button, .dq-bucket [role="button"]').first();
  await first.focus();
  const before = await page.locator('.dq-bucket .dq-body:visible, .dq-bucket [id^="dq-body"]:visible').count();
  await page.keyboard.press('Enter');
  await settled(page);
  out.accordionKeyboard = {
    visibleBodiesBefore: before,
    visibleBodiesAfter: await page.locator('.dq-bucket .dq-body:visible, .dq-bucket [id^="dq-body"]:visible').count(),
    ariaExpandedAfter: await first.getAttribute('aria-expanded'),
  };
  write('critic3-r6-keyboard.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R7 — a picture of the glossary button under the open sources drawer', async ({ page }) => {
  await fresh(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  await page.screenshot({ path: path.join(OUT, 'critic3-r7-drawer-covers-glossary.png') });
  const box = await page.locator('#open-glossary').boundingBox();
  if (box) {
    await page.screenshot({
      path: path.join(OUT, 'critic3-r7-glossary-button-occluded.png'),
      clip: { x: Math.max(0, box.x - 30), y: 0, width: box.width + 200, height: 70 },
    });
  }
  expect(true).toBe(true);
});

test('R15 — offline: both drawers AND all four exports', async ({ page, baseURL }) => {
  const blocked: string[] = [];
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const own = url.startsWith(baseURL ?? 'http://127.0.0.1:5199') || url.startsWith('data:') || url.startsWith('blob:');
    if (own) return route.continue();
    blocked.push(url);
    return route.abort();
  });

  fs.mkdirSync(DL, { recursive: true });
  const produced: { label: string; file: string; bytes: number }[] = [];
  const grab = async (label: string, tag: string): Promise<string> => {
    const wait = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    const download = await wait;
    const target = path.join(DL, `${tag}-${download.suggestedFilename()}`);
    await download.saveAs(target);
    produced.push({ label, file: target, bytes: fs.statSync(target).size });
    return target;
  };

  const routes = ['#/reconciliation', '#/pricing', '#/diagnose/structure', '#/diagnose/ownership', '#/diagnose/data-quality', '#/diagnose/simulator'];
  const screens: Record<string, unknown> = {};
  for (const hash of routes) {
    await fresh(page, hash);
    screens[hash] = {
      questionVisible: await page.locator('.screen-question, .lens-question').first().isVisible(),
      figures: await page.locator('[data-parity]').count(),
    };
  }
  // Both drawers, offline. The sources drawer is the one the shipped offline test never opens.
  await fresh(page, '#/reconciliation');
  await page.locator('#open-glossary').click();
  await settled(page);
  const glossaryCards = await page.locator('.glscard').count();
  await page.keyboard.press('Escape');
  await settled(page);
  await page.locator('#open-sources').click();
  await settled(page);
  const sourcesText = (await page.locator('#sources-drawer').innerText()).length;
  const fileInputs = await page.locator('input[type="file"]').count();
  await page.locator('#sources-close').click();
  await settled(page);

  // All four exports, offline.
  const csv = await grab('export csv', 'lookthrough');
  const wb1 = await grab('download excel', 'recon');
  await fresh(page, '#/pricing');
  const sendCsv = await grab('export pricing', 'send-to-pricing');
  const wb2 = await grab('download excel', 'pricing');

  const out = {
    blockedRequests: blocked,
    consoleProblems: problems,
    screens,
    drawers: { glossaryCards, sourcesDrawerTextLength: sourcesText, fileInputs },
    exports: produced,
    csvFirstLines: fs.readFileSync(csv, 'utf8').split('\n').slice(0, 3),
    sendCsvFirstLines: fs.readFileSync(sendCsv, 'utf8').split('\n').slice(0, 3),
    workbookSheets: { recon: XLSX.read(fs.readFileSync(wb1)).SheetNames, pricing: XLSX.read(fs.readFileSync(wb2)).SheetNames },
  };
  write('critic3-r15-offline.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R13 — my own tie-out: one figure per export, parsed from the file', async ({ page }) => {
  fs.mkdirSync(DL, { recursive: true });
  const out: Record<string, unknown> = {};
  const grab = async (label: string, tag: string): Promise<string> => {
    const wait = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
    const download = await wait;
    const target = path.join(DL, `tie-${tag}-${download.suggestedFilename()}`);
    await download.saveAs(target);
    return target;
  };
  const onScreen = async (key: string): Promise<string | null> =>
    page.evaluate((k) => document.querySelector(`[data-parity="${k}"]`)?.textContent?.trim() ?? null, key);

  // Reconciliation, AFTER basis — the basis the rubric names explicitly.
  await fresh(page, '#/reconciliation');
  await page.locator('#view-toggle button[data-view="after"]').click();
  await settled(page);
  const navOnScreen = await onScreen('reconciliation.after.nav') ?? await onScreen('reconciliation.waterfall.nav');
  const csv = await grab('export csv', 'after');
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  const header = lines[1].split(',').map((s) => s.replace(/^"|"$/g, ''));
  const navCol = header.findIndex((h) => /^NAV USD$/.test(h));
  const productRow = lines.slice(2).find((l) => /^"?product/i.test(l) || l.includes('product'));
  out.reconCsvAfter = {
    basisRow: lines[0],
    navColumn: header[navCol],
    navOnScreen,
    productRowNav: productRow?.split(',')[navCol],
  };
  const wb = await grab('download excel', 'after');
  const book = XLSX.read(fs.readFileSync(wb));
  out.reconWorkbook = { sheets: book.SheetNames, bytes: fs.statSync(wb).size };

  await fresh(page, '#/pricing');
  const publish = await onScreen('pricing.fund.SPORTHFC.publish_px');
  const send = await grab('export pricing', 'send');
  const sendLines = fs.readFileSync(send, 'utf8').split('\n');
  out.sendToPricing = {
    header: sendLines[0],
    sporthfcLine: sendLines.find((l) => l.includes('SPORTHFC')),
    publishOnScreen: publish,
  };
  const pw = await grab('download excel', 'pricing');
  out.pricingWorkbook = { sheets: XLSX.read(fs.readFileSync(pw)).SheetNames, bytes: fs.statSync(pw).size };
  write('critic3-r13.json', out);
  console.log(JSON.stringify(out, null, 1));
});
