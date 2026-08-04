/** Shared harness for critic-2 probes. Independent of tests/e2e/helpers.ts on purpose. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.C2_BASE ?? 'http://127.0.0.1:5391';
export const EVIDENCE = path.resolve(import.meta.dirname, '../..', 'evidence');
export const ROUTES = [
  { id: 'reconciliation', hash: '#/reconciliation', label: 'Reconciliation' },
  { id: 'pricing', hash: '#/pricing', label: 'Pricing' },
  { id: 'diagnose-structure', hash: '#/diagnose/structure', label: 'Structure' },
  { id: 'diagnose-ownership', hash: '#/diagnose/ownership', label: 'Ownership' },
  { id: 'diagnose-data-quality', hash: '#/diagnose/data-quality', label: 'Data quality' },
  { id: 'diagnose-simulator', hash: '#/diagnose/simulator', label: 'Simulator' },
];

export async function openBrowser() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  return { browser, context };
}

export function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e)));
  return problems;
}

export async function settle(page, quiet = 300) {
  await page.evaluate((q) => new Promise((res) => {
    let last = Date.now();
    const o = new MutationObserver(() => { last = Date.now(); });
    o.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    const tick = () => { if (Date.now() - last >= q) { o.disconnect(); res(); } else setTimeout(tick, 40); };
    setTimeout(tick, 40);
  }), quiet);
}

export async function go(page, hash) {
  await page.goto(BASE + '/' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settle(page);
}

export function save(name, data) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(data, null, 1) + '\n');
  console.log('wrote docs/evidence/' + name);
}
