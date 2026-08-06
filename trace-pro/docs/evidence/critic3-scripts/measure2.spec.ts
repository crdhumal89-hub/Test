/**
 * Critic-3 second pass: R3 with a wider unit lexicon and full reading context for every remaining
 * candidate, R7 with the drawer-already-open case measured rather than clicked blind, and R10/R11
 * with the basis reset between views.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..');
const ROUTES = [
  ['reconciliation', '#/reconciliation'],
  ['pricing', '#/pricing'],
  ['structure', '#/diagnose/structure'],
  ['ownership', '#/diagnose/ownership'],
  ['data-quality', '#/diagnose/data-quality'],
  ['simulator', '#/diagnose/simulator'],
] as const;

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
async function go(page: import('@playwright/test').Page, hash: string): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settled(page);
}
function write(name: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n');
}

test('R3 pass 2 — a wide unit lexicon, and the full reading context of every remaining bare figure', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const [id, hash] of ROUTES) {
    await go(page, hash);
    out[id] = await page.evaluate(() => {
      const UNIT =
        /\$|%|\bbps\b|\bunits?\b|\bqty\b|×|\bshares?\b|\bnodes?\b|\bedges?\b|\blinks?\b|\bfeeders?\b|\bpositions?\b|\bowners?\b|\bentit(y|ies)\b|\bissues?\b|\bholders?\b|\brows?\b|\bfunds?\b|\bsecurit(y|ies)\b|\bbn\b|\bm\b|\bk\b|\bpx\b|\bprice\b|\blevel\b|\bof\b/i;
      const FIGURE = /(?<![A-Za-z])[-+(]?\$?\d[\d,]*(\.\d+)?\)?/;
      const rows: Record<string, unknown>[] = [];
      const screen = document.querySelector('#screen');
      if (!screen) return rows;
      for (const el of screen.querySelectorAll<HTMLElement>('*')) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .filter(Boolean)
          .join(' ');
        if (!own || !FIGURE.test(own)) continue;
        if (/^\d{4}-\d{2}-\d{2}$/.test(own)) continue;
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.width === 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        let unitFrom: string | null = null;
        if (UNIT.test(own)) unitFrom = 'own text';
        if (!unitFrom && el.closest('.figure')?.querySelector('.figure-unit')) unitFrom = 'figure-unit';
        if (!unitFrom) {
          const cell = el.closest('td, th') as HTMLTableCellElement | null;
          const tr = cell?.closest('tr');
          const table = cell?.closest('table');
          if (cell && tr && table) {
            const index = [...tr.children].indexOf(cell);
            const th = table.querySelector('thead tr')?.children[index] as HTMLElement | undefined;
            const headText = (th?.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (UNIT.test(headText)) unitFrom = `column header "${headText.slice(0, 40)}"`;
          }
        }
        if (!unitFrom) {
          let p: HTMLElement | null = el.parentElement;
          for (let d = 0; p && d < 4; d += 1, p = p.parentElement) {
            const t = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (t.length < 260 && UNIT.test(t)) {
              unitFrom = `ancestor "${t.slice(0, 60)}"`;
              break;
            }
          }
        }
        if (unitFrom) continue;
        const panel = el.closest('section, .panel, .card, .tile, .box, .dq-bucket, .chip') as HTMLElement | null;
        rows.push({
          where: el.id ? '#' + el.id : el.className || el.tagName,
          parity: el.getAttribute('data-parity'),
          text: own.slice(0, 80),
          parentText: (el.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
          panelText: (panel?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
          top: Math.round(box.top),
        });
      }
      return rows;
    });
  }
  write('critic3-r3-pass2.json', out);
  const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v as unknown[]).length]));
  console.log('bare per route:', JSON.stringify(counts));
  console.log(JSON.stringify(out, null, 1).slice(0, 7000));
});

test('R7 pass 2 — is one action really enough with a drawer already open', async ({ page }) => {
  const out: Record<string, unknown> = {};
  await go(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  out.geometry = await page.evaluate(() => {
    const btn = document.getElementById('open-glossary');
    if (!btn) return { error: 'no button' };
    const r = btn.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      buttonBox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      elementAtItsCentre: at ? `${at.tagName.toLowerCase()}.${String(at.className)}` : null,
      insideDrawerHost: !!at?.closest('#drawer-host'),
      activeElement: document.activeElement
        ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id}`
        : null,
    };
  });
  // A real user's single click, dispatched at the button's centre exactly as a mouse would.
  out.singleClickResult = await page.evaluate(() => {
    const btn = document.getElementById('open-glossary');
    const r = btn!.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return {
      clickLandedOn: target ? `${target.tagName.toLowerCase()}.${String(target.className)}` : null,
      glossaryCardsNow: document.querySelectorAll('.glscard').length,
      sourcesStillOpen: !!document.getElementById('sources-drawer'),
    };
  });
  await settled(page);
  out.afterSingleClick = {
    glossaryCards: await page.locator('.glscard').count(),
    sourcesDrawer: await page.locator('#sources-drawer').count(),
  };

  // The documented keypress, with the drawer open and focus wherever the drawer put it.
  await go(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  const focused = await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`);
  await page.keyboard.press('g');
  await settled(page);
  out.keypressWithDrawerOpen = {
    focusWasOn: focused,
    glossaryCards: await page.locator('.glscard').count(),
    sourcesDrawer: await page.locator('#sources-drawer').count(),
  };

  // And the deep link from a label to its term.
  await go(page, '#/pricing');
  const term = page.locator('#screen .gterm').first();
  const label = (await term.textContent())?.trim() ?? '';
  await term.click();
  await settled(page);
  out.deepLink = {
    label,
    drawerText: (await page.locator('#drawer-host').innerText()).replace(/\s+/g, ' ').slice(0, 300),
    cards: await page.locator('.glscard').count(),
    focusedTermCards: await page.locator('#drawer-host [data-focus-term], #drawer-host .glscard.on, #drawer-host .glscard.focused').count(),
  };
  await page.screenshot({ path: path.join(OUT, 'critic3-r7-deeplink.png') });
  write('critic3-r7.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R10 + R11 pass 2 — labels and bases, basis reset between views', async ({ page }) => {
  const out: Record<string, unknown> = {};
  const collect = async (): Promise<unknown> =>
    page.evaluate(() => {
      const headers = [...document.querySelectorAll('table')].flatMap((table) => {
        const head = table.querySelector('thead tr');
        if (!head) return [];
        const body = table.querySelector('tbody tr');
        return [...head.children].map((th, i) => {
          const cell = body?.children[i] as HTMLElement | undefined;
          return {
            table: (table as HTMLElement).id || table.className,
            label: (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
            firstCellParity:
              cell?.getAttribute('data-parity') ??
              cell?.querySelector('[data-parity]')?.getAttribute('data-parity') ??
              null,
          };
        });
      });
      const steps = [...document.querySelectorAll('.wf-step, .wf-op, .score-tile, .chip, .kv')].map((n) => ({
        cls: n.className,
        text: (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
        parity: n.getAttribute('data-parity') ?? n.querySelector('[data-parity]')?.getAttribute('data-parity') ?? null,
      }));
      return { headers, steps };
    });

  for (const view of ['before', 'after'] as const) {
    const per: Record<string, unknown> = {};
    for (const [id, hash] of ROUTES) {
      await go(page, hash);
      const toggle = page.locator(`#view-toggle button[data-view="${view}"]`);
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await settled(page);
      }
      per[id] = await collect();
    }
    out[view] = per;
  }

  // R11: the two product NAVs.
  await go(page, '#/reconciliation');
  out.productNavSumFeeders = await page.evaluate(() => {
    const fig = document.querySelector('[data-parity="reconciliation.waterfall.nav"]');
    const step = fig?.closest('.wf-step');
    return {
      figure: (fig?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      stepText: (step?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  await go(page, '#/diagnose/structure');
  out.productNavFundEntity = await page.evaluate(() => {
    const fig = document.querySelector('[data-parity="structure.fullscreen.product_nav"]');
    return {
      figure: (fig?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      readout: (document.getElementById('structure-readout')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  });

  const dupes: Record<string, unknown> = {};
  for (const v of ['before', 'after']) {
    const map = new Map<string, Set<string>>();
    const routes = out[v] as Record<string, { headers: { label: string; firstCellParity: string | null }[] }>;
    for (const route of Object.values(routes)) {
      for (const h of route.headers) {
        if (!h.label) continue;
        const fam = h.firstCellParity ? h.firstCellParity.replace(/\.[A-Z0-9]{3,}\./g, '.<CODE>.') : 'no-parity';
        const set = map.get(h.label) ?? new Set<string>();
        set.add(fam);
        map.set(h.label, set);
      }
    }
    dupes[v] = [...map.entries()].filter(([, s]) => s.size > 1).map(([label, s]) => ({ label, families: [...s] }));
  }
  write('critic3-r10-r11.json', out);
  write('critic3-r10-duplicates.json', dupes);
  console.log('DUPLICATE LABELS:', JSON.stringify(dupes, null, 1));
  console.log('PRODUCT NAVS:', JSON.stringify({ a: out.productNavSumFeeders, b: out.productNavFundEntity }, null, 1));
});
