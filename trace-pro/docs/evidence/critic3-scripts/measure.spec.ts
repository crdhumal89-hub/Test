/**
 * Critic-3's own measurements for the criteria whose shipped test is weaker than the criterion, or
 * where no shipped test exists at all: R1 (per-LENS question), R3 (units on EVERY figure — the
 * shipped R3 test measures only the as-of), R7 (one action with a drawer already open; deep link from
 * a label to its term), R10 (label uniqueness in both views — no machine check ships), R11 (basis
 * adjacent on both product NAVs and on view-sensitive headers — no test ships), R16 (expanded rows,
 * sort column, filter text across navigation, and selection across a basis toggle — the shipped test
 * covers none of these), R17 (bps at two precisions on one screen — no test ships), R18 (all three
 * comboboxes).
 */
import { test, expect, type Page } from '@playwright/test';
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

async function settled(page: Page, quiet = 300): Promise<void> {
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
async function go(page: Page, hash: string): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.dataset.fetching);
  await settled(page);
}
function write(name: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n');
}

/* ================================================================= R1 */

test('R1 — every question element on every route, measured', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const [id, hash] of ROUTES) {
    await go(page, hash);
    out[id] = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.screen-question, .lens-question')];
      return nodes.map((n) => {
        const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        const box = n.getBoundingClientRect();
        return {
          id: n.id || null,
          cls: n.className,
          text,
          length: text.length,
          endsWithQuestionMark: /\?$/.test(text),
          visible: box.height > 0 && box.width > 0,
          top: Math.round(box.top),
        };
      });
    });
  }
  write('critic3-r1.json', out);
  console.log(JSON.stringify(out, null, 1));
});

/* ================================================================= R3 — units on every figure */

test('R3 — every figure-bearing element, and the unit it resolves to', async ({ page }) => {
  const out: Record<string, unknown> = {};
  for (const [id, hash] of ROUTES) {
    await go(page, hash);
    out[id] = await page.evaluate(() => {
      const UNIT = /\$|%|\bbps\b|\bunits?\b|\bqty\b|×|\bx\b|\bshares?\b|\bcount\b|\bentities\b|\bissues?\b|\bholders?\b|\brows?\b|\bfunds?\b|\bbn\b|\bm\b|\bk\b/i;
      // A figure: an element whose OWN text carries a digit run that is not part of a word or a date.
      const FIGURE = /(?<![A-Za-z])[-+(]?\$?\d[\d,]*(\.\d+)?\)?/;
      const rows: Record<string, unknown>[] = [];
      const screen = document.querySelector('#screen');
      if (!screen) return rows;
      const asofBox = document.getElementById('asof')?.getBoundingClientRect();
      const asofVisible = !!asofBox && asofBox.height > 0;
      for (const el of screen.querySelectorAll<HTMLElement>('*')) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .filter(Boolean)
          .join(' ');
        if (!own || !FIGURE.test(own)) continue;
        // Skip pure dates and codes.
        if (/^\d{4}-\d{2}-\d{2}$/.test(own)) continue;
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.width === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;

        let unitFrom: string | null = null;
        if (UNIT.test(own)) unitFrom = 'own text';
        // the .figure wrapper's unit span
        if (!unitFrom) {
          const fig = el.closest('.figure');
          if (fig?.querySelector('.figure-unit')) unitFrom = 'figure-unit sibling';
        }
        // a table column header
        if (!unitFrom) {
          const cell = el.closest('td, th') as HTMLTableCellElement | null;
          const tr = cell?.closest('tr');
          const table = cell?.closest('table');
          if (cell && tr && table) {
            const index = [...tr.children].indexOf(cell);
            const head = table.querySelector('thead tr');
            const th = head?.children[index] as HTMLElement | undefined;
            const headText = (th?.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (UNIT.test(headText)) unitFrom = `column header "${headText.slice(0, 40)}"`;
          }
        }
        // the nearest labelled ancestor's text (a key/value pair, a tile)
        if (!unitFrom) {
          let p: HTMLElement | null = el.parentElement;
          for (let depth = 0; p && depth < 3; depth += 1, p = p.parentElement) {
            const t = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (t.length < 200 && UNIT.test(t)) {
              unitFrom = `ancestor text "${t.slice(0, 50)}"`;
              break;
            }
          }
        }
        rows.push({
          where: el.id ? '#' + el.id : el.className || el.tagName,
          parity: el.getAttribute('data-parity'),
          text: own.slice(0, 70),
          unitFrom,
          top: Math.round(box.top),
          asofVisibleSimultaneously: asofVisible && box.top < window.innerHeight && box.bottom > 0,
        });
      }
      return rows;
    });
  }
  const summary: Record<string, unknown> = {};
  for (const [id, rows] of Object.entries(out)) {
    const list = rows as Record<string, unknown>[];
    const bare = list.filter((r) => r.unitFrom === null);
    summary[id] = { figures: list.length, bare: bare.length, bareSamples: bare.slice(0, 25) };
  }
  write('critic3-r3-units.json', { summary, detail: out });
  console.log(JSON.stringify(summary, null, 1));
});

/* ================================================================= R7 */

test('R7 — one action with a drawer already open, and a label deep-links to its term', async ({ page }) => {
  const out: Record<string, unknown> = {};
  // (a) with the SOURCES drawer already open, one action must reach the glossary.
  await go(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  const sourcesOpen = await page.locator('#sources-drawer').isVisible();
  await page.locator('#open-glossary').click();
  await settled(page);
  out.fromOpenSourcesDrawer = {
    sourcesWasOpen: sourcesOpen,
    glossaryVisible: await page.locator('#drawer-host .drawer').isVisible(),
    terms: await page.locator('.glscard').count(),
  };
  // (b) keyboard route with a drawer already open.
  await go(page, '#/pricing');
  await page.locator('#open-sources').click();
  await settled(page);
  await page.locator('#screen').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.press('g');
  await settled(page);
  out.keyboardWithSourcesOpen = {
    glossaryVisible: await page.locator('#drawer-host .drawer').isVisible(),
    cards: await page.locator('.glscard').count(),
  };
  // (c) deep link: clicking a glossary-linked label opens the glossary AT that term.
  await go(page, '#/pricing');
  const term = page.locator('#screen .gterm').first();
  const termText = (await term.textContent())?.trim() ?? '';
  await term.click();
  await settled(page);
  out.deepLink = {
    label: termText,
    drawerVisible: await page.locator('#drawer-host .drawer').isVisible(),
    focusedCard: await page
      .locator('.glscard.focus, .glscard[data-focus="true"], .glscard.current, #glossary-card, .glscard-focus')
      .count(),
    drawerHeadingText: (await page.locator('#drawer-host').innerText()).slice(0, 260),
  };
  // (d) selection survives the glossary from a Diagnose lens.
  await go(page, '#/diagnose/ownership');
  const before = await page.locator('#diagnose-entity').inputValue();
  await page.keyboard.press('g');
  await settled(page);
  await page.keyboard.press('Escape');
  await settled(page);
  out.selectionSurvives = { before, after: await page.locator('#diagnose-entity').inputValue() };
  write('critic3-r7.json', out);
  console.log(JSON.stringify(out, null, 1));
});

/* ================================================================= R10 / R11 */

test('R10 + R11 — labels and bases in both views', async ({ page }) => {
  const collect = async (): Promise<unknown> =>
    page.evaluate(() => {
      const headers = [...document.querySelectorAll('table')].flatMap((table) => {
        const head = table.querySelector('thead tr');
        if (!head) return [];
        const body = table.querySelector('tbody tr');
        return [...head.children].map((th, i) => {
          const cell = body?.children[i] as HTMLElement | undefined;
          return {
            table: table.id || table.className,
            index: i,
            label: (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
            firstCellParity: cell?.getAttribute('data-parity') ?? cell?.querySelector('[data-parity]')?.getAttribute('data-parity') ?? null,
          };
        });
      });
      const kv = [...document.querySelectorAll('.kv, .kv-row, .pair, .wf-step, .wf-op, .tile, .card')].map((n) => ({
        cls: n.className,
        text: (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        parity: n.getAttribute('data-parity') ?? n.querySelector('[data-parity]')?.getAttribute('data-parity') ?? null,
      }));
      return { headers, kv };
    });

  const out: Record<string, unknown> = {};
  for (const view of ['before', 'after'] as const) {
    const perRoute: Record<string, unknown> = {};
    for (const [id, hash] of ROUTES) {
      await go(page, hash);
      const toggle = page.locator(`#view-toggle button[data-view="${view}"]`);
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await settled(page);
      }
      perRoute[id] = await collect();
    }
    out[view] = perRoute;
  }

  // R11: the two product NAVs and their bases.
  await go(page, '#/reconciliation');
  const navFigure = await page.locator('[data-parity="reconciliation.waterfall.nav"]').innerText();
  const navBasis = await page.locator('#reconciliation-waterfall .wf-basis').allInnerTexts();
  await go(page, '#/diagnose/structure');
  const readout = await page.locator('#structure-readout').innerText();
  out.productNavs = {
    sumOfFeeders: { figure: navFigure.replace(/\s+/g, ' ').trim(), bases: navBasis.map((t) => t.replace(/\s+/g, ' ').trim()) },
    fundEntity: { readout: readout.replace(/\s+/g, ' ').trim().slice(0, 400) },
  };
  write('critic3-r10-r11.json', out);

  // Duplicate-label analysis: the same header string against two different parity families.
  const families = (v: string): Map<string, Set<string>> => {
    const map = new Map<string, Set<string>>();
    const routes = (out as Record<string, Record<string, { headers: { label: string; firstCellParity: string | null }[] }>>)[v];
    for (const route of Object.values(routes)) {
      for (const h of route.headers) {
        if (!h.label) continue;
        const fam = h.firstCellParity ? h.firstCellParity.replace(/\.[A-Z0-9_]+\./g, '.<CODE>.') : 'no-parity';
        const set = map.get(h.label) ?? new Set<string>();
        set.add(fam);
        map.set(h.label, set);
      }
    }
    return map;
  };
  const report: Record<string, unknown> = {};
  for (const v of ['before', 'after']) {
    const map = families(v);
    report[v] = [...map.entries()]
      .filter(([, s]) => s.size > 1)
      .map(([label, s]) => ({ label, families: [...s] }));
  }
  write('critic3-r10-duplicates.json', report);
  console.log(JSON.stringify(report, null, 1));
  console.log(JSON.stringify(out.productNavs, null, 1));
});

/* ================================================================= R16 */

test('R16 — expanded rows, sort column, filter text and selection across navigation', async ({ page }) => {
  const out: Record<string, unknown> = {};

  // (a) expanded tree rows survive leaving and returning to the screen.
  await go(page, '#/reconciliation');
  await page.locator('#expand-all').click();
  await settled(page);
  const expanded = await page.locator('#tree tbody tr').count();
  await page.evaluate(() => (location.hash = '#/pricing'));
  await settled(page);
  await page.evaluate(() => (location.hash = '#/reconciliation'));
  await settled(page);
  const afterReturn = await page.locator('#tree tbody tr').count();
  out.expandedRows = { expanded, afterReturn, survived: expanded === afterReturn };

  // (b) filter text survives leaving and returning to Pricing.
  await go(page, '#/pricing');
  await page.locator('#pricing-filter').fill('SPORT');
  await settled(page);
  const filteredRows = await page.locator('#rectable tbody tr.row').count();
  await page.evaluate(() => (location.hash = '#/reconciliation'));
  await settled(page);
  await page.evaluate(() => (location.hash = '#/pricing'));
  await settled(page);
  out.filterText = {
    typed: 'SPORT',
    filteredRows,
    afterReturnValue: await page.locator('#pricing-filter').inputValue(),
    afterReturnRows: await page.locator('#rectable tbody tr.row').count(),
  };

  // (c) sort column survives leaving and returning.
  await go(page, '#/pricing');
  const sortable = page.locator('#rectable thead th').nth(2);
  await sortable.click();
  await settled(page);
  const sortedFirst = await page.locator('#rectable tbody tr.row').first().innerText();
  const ariaSort = await page.locator('#rectable thead th[aria-sort]:not([aria-sort="none"])').count();
  await page.evaluate(() => (location.hash = '#/reconciliation'));
  await settled(page);
  await page.evaluate(() => (location.hash = '#/pricing'));
  await settled(page);
  out.sortColumn = {
    sortedFirstRow: sortedFirst.replace(/\s+/g, ' ').slice(0, 60),
    ariaSortCellsAfterSort: ariaSort,
    afterReturnFirstRow: (await page.locator('#rectable tbody tr.row').first().innerText()).replace(/\s+/g, ' ').slice(0, 60),
    afterReturnAriaSortCells: await page.locator('#rectable thead th[aria-sort]:not([aria-sort="none"])').count(),
  };

  // (d) Diagnose selection survives a pricing-basis toggle (the rubric names this explicitly).
  await go(page, '#/diagnose/simulator');
  const input = page.locator('#diagnose-entity');
  await input.click();
  await input.fill('SPORTHFC');
  await settled(page);
  await page.locator('.combo-option').first().click();
  await settled(page);
  const chosen = await input.inputValue();
  await page.locator('#view-toggle button[data-view="after"]').click();
  await settled(page);
  out.selectionAcrossBasis = { chosen, afterToggle: await input.inputValue() };

  write('critic3-r16.json', out);
  console.log(JSON.stringify(out, null, 1));
});

/* ================================================================= R17 */

test('R17 — the decimal count of every bps, money and price column as rendered', async ({ page }) => {
  const out: Record<string, unknown> = {};
  await go(page, '#/pricing');
  const readColumn = async (table: string, header: RegExp): Promise<unknown> =>
    page.evaluate(
      ({ t, h }) => {
        const el = document.querySelector(t);
        if (!el) return { error: 'no table ' + t };
        const ths = [...(el.querySelector('thead tr')?.children ?? [])];
        const index = ths.findIndex((th) => new RegExp(h, 'i').test((th.textContent ?? '').trim()));
        if (index < 0) return { error: 'no header matching ' + h, headers: ths.map((x) => (x.textContent ?? '').trim()) };
        const cells = [...el.querySelectorAll('tbody tr')].map((tr) => (tr.children[index]?.textContent ?? '').trim());
        const dp = (s: string): number => {
          const m = /\.(\d+)/.exec(s);
          return m ? m[1].length : 0;
        };
        return {
          header: (ths[index]?.textContent ?? '').trim(),
          samples: cells.slice(0, 6),
          decimalCounts: [...new Set(cells.filter((c) => /\d/.test(c)).map(dp))].sort(),
        };
      },
      { t: table, h: header.source }
    );

  out.priceTable_bps = await readColumn('#rectable', /^bps$/);
  out.priceTable_publish = await readColumn('#rectable', /price to publish/);
  out.priceTable_ltv = await readColumn('#rectable', /look-through value/);
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settled(page);
  out.walk_deltaBps = await readColumn('#pricing-walk-table', /bps/);
  out.walk_deltaPrice = await readColumn('#pricing-walk-table', /Price/);

  // The same fund, both tables, side by side.
  await go(page, '#/pricing');
  const cell = async (parity: string): Promise<string | null> =>
    page.evaluate((k) => document.querySelector(`[data-parity="${k}"]`)?.textContent?.trim() ?? null, parity);
  const pnl = await cell('pricing.fund.ASCHON.pnl_bps');
  await page.locator('#pricing-subview button[data-subview="walk"]').click();
  await settled(page);
  const walk = await cell('pricing.walk.fund.ASCHON.delta_bps');
  await go(page, '#/pricing');
  const bridge = await cell('pricing.bridge.driver.ASCHON.gap_bps');
  out.sameQuantityThreeWays = { 'price table pnl_bps': pnl, 'walk delta_bps': walk, 'bridge gap_bps': bridge };
  // And the reconciliation tree's own bps, for a fourth reading of the same class.
  await go(page, '#/reconciliation');
  out.reconciliationWaterfallBps = {
    pricing: await cell('reconciliation.waterfall.delta_pricing_bps'),
    nonposition: await cell('reconciliation.waterfall.delta_nonposition_bps'),
  };
  write('critic3-r17.json', out);
  console.log(JSON.stringify(out, null, 1));
});

/* ================================================================= R18 */

test('R18 — every combobox, every filter and a lens with no data', async ({ page }) => {
  const out: Record<string, unknown> = {};
  const emptyOf = async (input: string, list: string): Promise<unknown> => {
    const box = page.locator(input);
    if (!(await box.count())) return { error: 'no such combobox ' + input };
    await box.click();
    await box.fill('zzzznothing');
    await settled(page);
    const empty = page.locator(`${list} .combo-empty`);
    const n = await empty.count();
    return {
      present: n > 0,
      text: n ? (await empty.first().innerText()).replace(/\s+/g, ' ').trim() : null,
      namesRecovery: n ? /clear|try|widen|every|another/i.test(await empty.first().innerText()) : false,
      hasButton: n ? await empty.first().locator('button').count() : 0,
    };
  };
  await go(page, '#/diagnose/structure');
  out.diagnoseEntity = await emptyOf('#diagnose-entity', '#diagnose-entity-list');
  await go(page, '#/diagnose/ownership');
  out.ownershipSearch = await emptyOf('#ownership-search', '#ownership-search-list');
  await go(page, '#/diagnose/data-quality');
  out.dataQualityScope = await emptyOf('#data-quality-scope', '#data-quality-scope-list');
  await go(page, '#/pricing');
  await page.locator('#pricing-filter').fill('zzzz');
  await settled(page);
  out.pricingFilter = {
    text: (await page.locator('#pricing-price-table .state-empty').innerText()).replace(/\s+/g, ' ').trim(),
    buttons: await page.locator('#pricing-price-table .state-empty button').allInnerTexts(),
  };
  write('critic3-r18.json', out);
  console.log(JSON.stringify(out, null, 1));
});
