/**
 * Critic-3 probe 00 — survey. Dumps, per route: the first text in #screen, every control id,
 * every subview button, and the outerHTML skeleton, so later probes can target real selectors.
 * Run: node docs/evidence/critic3-scripts/00-survey.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5199/';
const OUT = path.resolve(import.meta.dirname, '../');
export const ROUTES = [
  '#/reconciliation',
  '#/pricing',
  '#/diagnose/structure',
  '#/diagnose/ownership',
  '#/diagnose/data-quality',
  '#/diagnose/simulator',
];

export async function settled(page, quiet = 300) {
  await page.evaluate(
    (q) =>
      new Promise((res) => {
        let last = Date.now();
        const mo = new MutationObserver(() => (last = Date.now()));
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        const tick = () => (Date.now() - last >= q ? (mo.disconnect(), res()) : setTimeout(tick, 40));
        setTimeout(tick, 40);
      }),
    quiet
  );
}

export async function launch() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  return { browser, context };
}

export async function open(context, hash) {
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e)}`));
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settled(page);
  page.__problems = problems;
  return page;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { browser, context } = await launch();
  const survey = {};
  for (const hash of ROUTES) {
    const page = await open(context, hash);
    survey[hash] = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((n) => n.id);
      const subview = [...document.querySelectorAll('[data-subview]')].map((n) => ({
        id: n.id || null,
        sub: n.dataset.subview,
        text: n.textContent.trim(),
      }));
      const tabs = [...document.querySelectorAll('[role="tab"], .seg button, [data-tab]')].map((n) => ({
        sel: n.id || n.className,
        text: n.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
      }));
      const parity = [...document.querySelectorAll('[data-parity]')].map((n) => n.getAttribute('data-parity'));
      const firstText = (document.querySelector('#screen')?.innerText ?? '').split('\n').slice(0, 4);
      const tableHeaders = [...document.querySelectorAll('th')].map((n) => n.innerText.replace(/\s+/g, ' ').trim());
      return {
        ids,
        subview,
        tabs,
        parityCount: parity.length,
        parity,
        firstText,
        tableHeaders,
        buttons: [...document.querySelectorAll('button')].map((b) => (b.id ? '#' + b.id : b.textContent.replace(/\s+/g, ' ').trim().slice(0, 30))),
        html: (document.querySelector('#screen')?.innerHTML ?? '').length,
      };
    });
    survey[hash].problems = page.__problems;
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'critic3-survey.json'), JSON.stringify(survey, null, 1));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(survey).map(([k, v]) => [k, { subview: v.subview, tabs: v.tabs, firstText: v.firstText, th: v.tableHeaders.length, parity: v.parityCount, problems: v.problems }])), null, 1));
  await browser.close();
}
