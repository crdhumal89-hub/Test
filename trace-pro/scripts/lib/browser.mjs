import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/**
 * The two CDN dependencies the ORIGINAL loads from cdnjs. They are vendored under vendor/
 * and fulfilled from disk, so the harness never touches the network. This is also the only
 * way the original renders in a sandboxed environment at all: cdnjs answers 403 here.
 */
export const CDN_MAP = {
  'cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': 'vendor/xlsx.full.min.js',
  'cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js': 'vendor/d3.min.js',
};

/** Fixed for every run: layout reads clientWidth/clientHeight, so viewport is part of the contract. */
export const VIEWPORT = { width: 1600, height: 1000 };

export async function launch() {
  const browser = await chromium.launch({
    args: ['--force-device-scale-factor=1', '--font-render-hinting=none'],
  });
  return browser;
}

/**
 * A deterministic page: fixed viewport, fixed timezone/locale (formatters call
 * toLocaleString('en-US')), empty sessionStorage, offline except for our own origin,
 * and a console/error recorder.
 */
export async function newPage(browser, origin) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  const problems = [];

  // Fulfil the vendored CDN scripts from disk; abort anything else off-origin.
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    for (const [needle, local] of Object.entries(CDN_MAP)) {
      if (url.includes(needle)) {
        return route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: fs.readFileSync(path.join(ROOT, local)),
        });
      }
    }
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    problems.push({ type: 'offline-violation', text: url });
    return route.abort();
  });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push({ type: 'console.error', text: m.text() });
    if (m.type() === 'warning') problems.push({ type: 'console.warn', text: m.text() });
  });
  page.on('pageerror', (e) => problems.push({ type: 'pageerror', text: String(e) }));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.startsWith(origin)) return; // off-origin aborts are recorded above, by design
    problems.push({ type: 'requestfailed', text: u + ' ' + (r.failure()?.errorText || '') });
  });

  return { page, context, problems };
}

/**
 * Wait until the page stops mutating. The original defers renders through setTimeout
 * (20-30ms in activateTab) and animates with d3 transitions, so a fixed sleep would be
 * either flaky or slow. This polls for DOM stability instead.
 */
export async function settle(page, { quietMs = 300, timeoutMs = 20000 } = {}) {
  await page.evaluate(
    ({ quietMs, timeoutMs }) =>
      new Promise((resolve) => {
        let last = Date.now();
        const obs = new MutationObserver(() => {
          last = Date.now();
        });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        const started = Date.now();
        const tick = () => {
          // An in-flight fetch mutates nothing, so DOM quiet alone would let a scene proceed while
          // a fixture was still downloading. The app flags outstanding fetches on <html>.
          const fetching = document.documentElement.hasAttribute('data-fetching');
          if ((!fetching && Date.now() - last >= quietMs) || Date.now() - started >= timeoutMs) {
            obs.disconnect();
            resolve();
          } else {
            setTimeout(tick, 40);
          }
        };
        setTimeout(tick, 40);
      }),
    { quietMs, timeoutMs }
  );
}
