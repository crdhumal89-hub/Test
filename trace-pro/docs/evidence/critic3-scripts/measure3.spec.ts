/**
 * Critic-3 third pass. Every navigation forces a real document load (a cache-busting query), because
 * `page.goto` to an identical URL is a same-document hash navigation and leaves an open drawer open —
 * which is how pass 2 timed out.
 *
 * Measures: R7 with a drawer already open (click and keypress), R11 on both product NAVs and on the
 * basis-sensitive column headers, R10 on the two traps the rubric names by name ("Repriced MV" and
 * "Applied"), R3's two remaining bare figures in full, and R6 on the click targets the rubric
 * enumerates.
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

test('R7 — with a drawer already open: the click, and the documented keypress', async ({ page }) => {
  const out: Record<string, unknown> = {};

  /* (a) the CLICK. */
  await fresh(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  out.withSourcesOpen_click = await page.evaluate(() => {
    const btn = document.getElementById('open-glossary');
    const r = btn!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const at = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const before = document.querySelectorAll('.glscard').length;
    at?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
    return {
      sourcesDrawerOpen: !!document.getElementById('sources-drawer'),
      glossaryButtonBox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      whatIsAtItsCentre: at ? `${at.tagName.toLowerCase()}.${String(at.className)}` : null,
      centreIsInsideDrawer: !!at?.closest('#drawer-host'),
      glossaryCardsBefore: before,
      glossaryCardsAfterTheClick: document.querySelectorAll('.glscard').length,
    };
  });

  /* (b) the KEYPRESS, focus left exactly where the drawer put it. */
  await fresh(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  const focusWasOn = await page.evaluate(
    () => `${document.activeElement?.tagName.toLowerCase()}#${document.activeElement?.id}[type=${(document.activeElement as HTMLInputElement)?.type ?? ''}]`
  );
  await page.keyboard.press('g');
  await settled(page);
  out.withSourcesOpen_keypress = {
    focusWasOn,
    glossaryCards: await page.locator('.glscard').count(),
    sourcesDrawerStillOpen: await page.locator('#sources-drawer').count(),
  };

  /* (c) the keypress with focus on the drawer's file input, which is what a user reaches next. */
  await fresh(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  await page.locator('#sources-file-nav').focus();
  await page.keyboard.press('g');
  await settled(page);
  out.withSourcesOpen_keypress_fromFileInput = {
    glossaryCards: await page.locator('.glscard').count(),
    sourcesDrawerStillOpen: await page.locator('#sources-drawer').count(),
  };

  /* (d) the deep link from a glossary-linked label. */
  await fresh(page, '#/pricing');
  const term = page.locator('#screen .gterm').first();
  const label = (await term.textContent())?.trim() ?? '';
  await term.click();
  await settled(page);
  out.deepLink = {
    label,
    cards: await page.locator('.glscard').count(),
    drawerText: (await page.locator('#drawer-host').innerText()).replace(/\s+/g, ' ').slice(0, 320),
  };
  await page.screenshot({ path: path.join(OUT, 'critic3-r7-deeplink.png') });

  /* (e) one action from every lens, and selection preserved. */
  const perLens: Record<string, unknown> = {};
  for (const lens of ['structure', 'ownership', 'data-quality', 'simulator']) {
    await fresh(page, `#/diagnose/${lens}`);
    const before = await page.locator('#diagnose-entity').inputValue();
    await page.locator('#open-glossary').click();
    await settled(page);
    const cards = await page.locator('.glscard').count();
    await page.keyboard.press('Escape');
    await settled(page);
    perLens[lens] = { cards, entityBefore: before, entityAfter: await page.locator('#diagnose-entity').inputValue() };
  }
  out.perLens = perLens;
  write('critic3-r7.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R11 — both product NAVs, and the basis-sensitive headers in both views', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const view of ['before', 'after'] as const) {
    await fresh(page, '#/reconciliation');
    if (view === 'after') {
      await page.locator('#view-toggle button[data-view="after"]').click();
      await settled(page);
    }
    out[`reconciliation_${view}`] = await page.evaluate(() => ({
      waterfall: (document.getElementById('reconciliation-waterfall')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
      treeHeaders: [...document.querySelectorAll('#tree thead th')].map((t) => (t as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
      viewNote: (document.getElementById('view-note')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    }));
    await fresh(page, '#/pricing');
    if (view === 'after') {
      await page.locator('#view-toggle button[data-view="after"]').click();
      await settled(page);
    }
    out[`pricing_${view}`] = await page.evaluate(() => ({
      priceHeaders: [...document.querySelectorAll('#rectable thead th')].map((t) => (t as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
      scoreStrip: (document.getElementById('pricing-score')?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    }));
  }
  await fresh(page, '#/diagnose/structure');
  out.structureReadout = (await page.locator('#structure-readout').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400);
  out.structureBasis = (await page.locator('#structure-basis').innerText()).replace(/\s+/g, ' ').trim().slice(0, 300);

  // The two traps R10 names: "Repriced MV" for two quantities, and "Applied" for a price and a share.
  const hunt = async (hash: string, word: string): Promise<unknown> => {
    await fresh(page, hash);
    const before = await page.evaluate((w) => {
      const hits: { where: string; text: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('#screen *')) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).join(' ');
        if (own && new RegExp(`\\b${w}\\b`, 'i').test(own)) hits.push({ where: el.id || el.className || el.tagName, text: own.slice(0, 90) });
      }
      return hits;
    }, word);
    const toggle = page.locator('#view-toggle button[data-view="after"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await settled(page);
    }
    const after = await page.evaluate((w) => {
      const hits: { where: string; text: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('#screen *')) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? '').trim()).join(' ');
        if (own && new RegExp(`\\b${w}\\b`, 'i').test(own)) hits.push({ where: el.id || el.className || el.tagName, text: own.slice(0, 90) });
      }
      return hits;
    }, word);
    return { before, after };
  };
  out.trap_Applied_pricing = await hunt('#/pricing', 'Applied');
  out.trap_Applied_ownership = await hunt('#/diagnose/ownership', 'Applied');
  out.trap_RepricedMV_pricing = await hunt('#/pricing', 'Repriced');
  write('critic3-r11.json', out);
  console.log(JSON.stringify(out, null, 1).slice(0, 9000));
});

test('R3 — the two data-quality bucket counts, in full, plus the KPI strip above them', async ({ page }) => {
  await fresh(page, '#/diagnose/data-quality');
  const out = await page.evaluate(() => ({
    kpi: (document.getElementById('data-quality-kpi')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    badge: (document.getElementById('data-quality-badge')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    buckets: [...document.querySelectorAll('.dq-bucket')].map((b) => ({
      head: ((b.querySelector('.dq-head, [role="button"], button') as HTMLElement)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      countText: ((b.querySelector('.dq-count') as HTMLElement)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      countAria: b.querySelector('.dq-count')?.getAttribute('aria-label'),
      headAria: (b.querySelector('.dq-head, [role="button"], button') as HTMLElement)?.getAttribute('aria-label'),
    })),
  }));
  await page.screenshot({ path: path.join(OUT, 'critic3-r3-dq-buckets.png') });
  write('critic3-r3-dq.json', out);
  console.log(JSON.stringify(out, null, 1));
});

test('R6 — the click targets the rubric enumerates by name', async ({ page }) => {
  const out: Record<string, unknown> = {};
  const probe = async (hash: string, label: string, selector: string): Promise<void> => {
    await fresh(page, hash);
    out[label] = await page.evaluate((sel) => {
      const nodes = [...document.querySelectorAll<HTMLElement>(sel)];
      return {
        count: nodes.length,
        sample: nodes.slice(0, 3).map((n) => ({
          tag: n.tagName.toLowerCase(),
          role: n.getAttribute('role'),
          name: n.getAttribute('aria-label') ?? (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
          tabindex: n.getAttribute('tabindex'),
          w: Math.round(n.getBoundingClientRect().width),
          h: Math.round(n.getBoundingClientRect().height),
        })),
        allHaveRole: nodes.every((n) => n.getAttribute('role') || /^(button|a|input|select|textarea)$/.test(n.tagName.toLowerCase())),
        allFocusable: nodes.every((n) => n.tabIndex >= 0),
        allNamed: nodes.every((n) => (n.getAttribute('aria-label') ?? n.textContent ?? '').trim().length > 0),
      };
    }, selector);
  };
  await probe('#/pricing', 'sortable table headers', '#rectable thead th');
  await probe('#/diagnose/data-quality', 'accordion headers', '#data-quality-buckets .dq-bucket > *:first-child');
  await probe('#/diagnose/structure', 'graph nodes', '#structure-stage svg .strnode');
  await probe('#/diagnose/ownership', 'ribbon segments', '#ownership-ribbon .own-seg');
  await probe('#/reconciliation', 'flag chips', '#reconciliation-exceptions .chip');
  await probe('#/reconciliation', 'tree rows', '#tree tbody tr');
  write('critic3-r6.json', out);
  console.log(JSON.stringify(out, null, 1));
});
