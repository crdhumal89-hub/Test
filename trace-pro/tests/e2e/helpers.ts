import { expect, type Page, type ConsoleMessage } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const EVIDENCE = path.resolve(import.meta.dirname, '../../docs/evidence');

/** The three screens and the four Diagnose lenses, as the routes the suite walks. */
export const ROUTES = [
  { id: 'reconciliation', hash: '#/reconciliation', label: 'Reconciliation' },
  { id: 'pricing', hash: '#/pricing', label: 'Pricing' },
  { id: 'diagnose-structure', hash: '#/diagnose/structure', label: 'Structure' },
  { id: 'diagnose-ownership', hash: '#/diagnose/ownership', label: 'Ownership' },
  { id: 'diagnose-data-quality', hash: '#/diagnose/data-quality', label: 'Data quality' },
  { id: 'diagnose-simulator', hash: '#/diagnose/simulator', label: 'Simulator' },
] as const;

/**
 * Attach a recorder that fails the test on any console error or unhandled rejection.
 * A swallowed exception in the original made a broken panel look like an empty one; this is the
 * check that stops that pattern coming back (rubric R14).
 */
export function recordProblems(page: Page): { problems: string[] } {
  const problems: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error)}`));
  return { problems };
}

/** Wait until the DOM stops mutating, rather than sleeping a fixed amount. */
export async function settled(page: Page, quietMs = 250): Promise<void> {
  await page.evaluate(
    (quiet) =>
      new Promise<void>((resolve) => {
        let last = Date.now();
        const observer = new MutationObserver(() => {
          last = Date.now();
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        const tick = (): void => {
          if (Date.now() - last >= quiet) {
            observer.disconnect();
            resolve();
          } else {
            setTimeout(tick, 40);
          }
        };
        setTimeout(tick, 40);
      }),
    quietMs
  );
}

export async function gotoRoute(page: Page, hash: string): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'load' });
  await settled(page);
}

/** Read the string a parity key resolves to in the running app. */
export async function parityValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => {
    const node = document.querySelector(`[data-parity="${k}"]`);
    return node ? (node.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
  }, key);
}

/** Is this element fully inside the viewport on load? Evidence for rubric R5. */
export async function isAboveFold(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight && box.height > 0;
  }, selector);
}

/** Walk the tab order, returning a description of each stop. Evidence for rubric R6. */
export async function tabOrder(page: Page, maxStops = 120): Promise<string[]> {
  const stops: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const node = document.activeElement as HTMLElement | null;
      if (!node || node === document.body) return null;
      const styles = getComputedStyle(node);
      const name =
        node.getAttribute('aria-label') ??
        node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) ??
        '';
      return {
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') ?? '',
        name,
        outline: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
      };
    });
    if (!stop) break;
    const id = `${stop.tag}${stop.role ? `[${stop.role}]` : ''} "${stop.name}"`;
    if (stops.length && stops[stops.length - 1] === id && i > 4) break;
    stops.push(id);
  }
  return stops;
}

export function writeEvidence(name: string, data: unknown): void {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(data, null, 1) + '\n');
}

/** Assert no problems were recorded, with the list in the failure message. */
export function expectClean(problems: string[]): void {
  expect(problems, `console problems:\n${problems.join('\n')}`).toEqual([]);
}
