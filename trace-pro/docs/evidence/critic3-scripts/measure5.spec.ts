/**
 * Critic-3 fifth pass — the R4 clauses the shipped tests assert for some panels and not others:
 * role=alert on the reconciliation tree, price table and repricing walk error states (the three the
 * shipped tests do NOT check), a recovery action on every empty state, and the two comboboxes with no
 * `notice` at all. Plus R12's control visibility, measured per route.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..');
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
async function patch(
  page: import('@playwright/test').Page,
  glob: string,
  fn: (body: Record<string, unknown>) => void
): Promise<void> {
  await page.route(glob, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    fn(body);
    await route.fulfill({ json: body });
  });
}

test('R4 — role=alert and a recovery action on every state the shipped tests skip', async ({ page }) => {
  const out: Record<string, unknown> = {};
  const read = async (selector: string): Promise<unknown> =>
    page.evaluate((sel) => {
      const n = document.querySelector(sel);
      if (!n) return { present: false };
      return {
        present: true,
        role: n.getAttribute('role'),
        ariaLive: n.getAttribute('aria-live'),
        text: (n as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 140),
        buttons: [...n.querySelectorAll('button')].map((b) => b.textContent?.trim()),
      };
    }, selector);

  // tree ERROR
  await patch(page, '**/lookthrough.json', (b) => {
    for (const node of b.nodes as Record<string, unknown>[]) delete node.path;
  });
  await fresh(page, '#/reconciliation');
  out.treeError = await read('#reconciliation-tree .state-error');
  await page.unrouteAll();

  // tree EMPTY
  await patch(page, '**/lookthrough.json', (b) => {
    b.nodes = [];
  });
  await fresh(page, '#/reconciliation');
  out.treeEmpty = await read('#reconciliation-tree .state-empty');
  await page.unrouteAll();

  // price table + walk ERROR
  await patch(page, '**/repricing.json', (b) => {
    for (const f of b.funds as Record<string, unknown>[]) {
      f.ltv = 'n/a';
      f.rev = 'n/a';
    }
  });
  await fresh(page, '#/pricing');
  out.priceTableError = await read('#pricing-price-table .state-error');
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settled(page);
  out.walkError = await read('#pricing-walk-table .state-error');
  await page.unrouteAll();

  // price table EMPTY
  await fresh(page, '#/pricing');
  await page.locator('#pricing-filter').fill('zzzz');
  await settled(page);
  out.priceTableEmpty = await read('#pricing-price-table .state-empty');

  // every .state-error / .state-empty produced by the app: do they all carry the right role?
  out.stateHelperContract = await page.evaluate(() => ({
    errorNodes: [...document.querySelectorAll('.state-error')].map((n) => n.getAttribute('role')),
    emptyNodes: [...document.querySelectorAll('.state-empty')].map((n) => n.getAttribute('role')),
  }));

  // The two comboboxes with no notice: what do they do while the universe is missing?
  await page.unrouteAll();
  await page.route('**/universe.json', (route) => route.abort('failed'));
  await fresh(page, '#/diagnose/ownership');
  out.universeFailed_ownership = {
    lensError: await read('#screen .state-error'),
    ownershipSearchExists: await page.locator('#ownership-search').count(),
  };
  await fresh(page, '#/diagnose/data-quality');
  out.universeFailed_dataQuality = {
    lensError: await read('#screen .state-error'),
    scopeComboExists: await page.locator('#data-quality-scope').count(),
  };
  await page.unrouteAll();

  write('critic3-r4.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R12 — the basis control and the basis note, per route', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const hash of [
    '#/reconciliation',
    '#/pricing',
    '#/diagnose/structure',
    '#/diagnose/ownership',
    '#/diagnose/data-quality',
    '#/diagnose/simulator',
  ]) {
    await fresh(page, hash);
    out[hash] = await page.evaluate(() => {
      const t = document.getElementById('view-toggle');
      const n = document.getElementById('view-note');
      const h = (e: Element | null): number => (e ? Math.round(e.getBoundingClientRect().height) : -1);
      return {
        toggleHeight: h(t),
        toggleHidden: !!t?.hasAttribute('hidden'),
        noteHeight: h(n),
        noteTag: n?.querySelector('.view-tag')?.textContent ?? '',
        pressed: [...(t?.querySelectorAll('button') ?? [])].map((b) => `${b.getAttribute('data-view')}=${b.getAttribute('aria-pressed')}`),
      };
    });
  }
  write('critic3-r12.json', out);
  console.log(JSON.stringify(out, null, 1));
});
