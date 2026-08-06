/**
 * R6 — keyboard focus, measured. Split out of rubric.spec.ts because the bar has four clauses and
 * measuring them properly (geometry, ring width, ring contrast, whether the ring is painted at all,
 * and focus restoration on every overlay) is more code than the rest of the rubric spec put together.
 *
 * What the shipped check did instead, and why this file exists: it walked the tab order collecting a
 * STRING per stop and rejected only stops whose tag was div/span/td/tr/th with no role. It therefore
 * passed 39 ribbon segments that were 0px high, a focus ring that `overflow: hidden` clipped to
 * nothing, a measured 2.81:1 ring on four different controls, and three overlays that dropped focus
 * on BODY. Nothing here reads a role and stops.
 */
import { test, expect } from '@playwright/test';
import { ROUTES, settled, gotoRoute, writeEvidence, recordProblems, expectClean } from './helpers.js';


/** sRGB relative luminance, WCAG 2.x. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const rgb = (s: string): [number, number, number] | null => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).map(Number);
    return [p[0], p[1], p[2]];
  };
  const [x, y] = [rgb(a), rgb(b)];
  if (!x || !y) return 0;
  const [l1, l2] = [luminance(x), luminance(y)];
  return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
}

interface Stop {
  key: string;
  tag: string;
  role: string;
  w: number;
  h: number;
  outlineStyle: string;
  outlineWidth: string;
  tones: string[];
  fill: string;
}

/**
 * Walk the whole tab order and MEASURE each stop. Deliberately not `tabOrder()` from helpers.ts:
 * that returns a string per stop and looks at neither geometry nor colour, which is how 39
 * zero-height ribbon segments and a focus ring clipped to nothing passed a green suite. Stops are
 * marked as they are visited, so the walk ends when the cycle wraps rather than when two adjacent
 * controls happen to share an accessible name.
 */
async function measuredWalk(page: import('@playwright/test').Page, max = 400): Promise<Stop[]> {
  const stops: Stop[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const node = document.activeElement as HTMLElement | null;
      if (!node || node === document.body) return null;
      if (node.getAttribute('data-rubric-seen')) return null;
      node.setAttribute('data-rubric-seen', '1');
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      // The colour the ring is actually drawn over: the nearest painted background.
      let fill = 'rgb(255, 255, 255)';
      for (let p: Element | null = node; p; p = p.parentElement) {
        const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          fill = c;
          break;
        }
      }
      const tones = [style.outlineColor, ...(style.boxShadow.match(/rgba?\([^)]+\)/g) ?? [])];
      return {
        key: `${node.tagName.toLowerCase()}[${node.getAttribute('role') ?? ''}] ${(node.getAttribute('aria-label') ?? node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)}`,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') ?? '',
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        tones,
        fill,
      };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

test.describe('R6 — focus is visible and everything is reachable by keyboard', () => {
  test('no bare outline:none survives in the stylesheets', async ({ page }) => {
    await gotoRoute(page, ROUTES[0].hash);
    const bare = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (/outline\s*:\s*none/.test(rule.cssText) && !/:focus-visible/.test(rule.selectorText)) {
            offenders.push(rule.selectorText);
          }
        }
      }
      return offenders;
    });
    expect(bare, 'outline:none without a :focus-visible replacement').toEqual([]);
  });

  for (const route of ROUTES) {
    test(`${route.label} — every tab stop has a box, a role and a ≥3:1 ring`, async ({ page }) => {
      await gotoRoute(page, route.hash);
      const stops = await measuredWalk(page);
      const graded = stops.map((s) => ({
        ...s,
        ringContrast: Math.max(...s.tones.map((t) => contrast(t, s.fill))),
        toneSeparation: s.tones.length > 1 ? contrast(s.tones[0], s.tones[1]) : 0,
      }));
      writeEvidence(`tab-order-${route.id}.json`, graded);
      expect(stops.length, 'must have reachable controls').toBeGreaterThan(3);

      // (a) geometry: a stop with no box is a stop a sighted keyboard user cannot see.
      const noBox = graded.filter((s) => s.w < 1 || s.h < 1).map((s) => `${s.key} ${s.w}x${s.h}`);
      expect(noBox, `zero-area focus stops: ${noBox.join(' | ')}`).toEqual([]);
      // (b) a role and a name on everything that is not a native control.
      const untyped = graded.filter((s) => /^(div|span|td|tr|th)$/.test(s.tag) && !s.role);
      expect(untyped.map((s) => s.key), 'stops with no role').toEqual([]);
      // (c) at least 2px of ring.
      const thin = graded.filter((s) => s.outlineStyle === 'none' || parseFloat(s.outlineWidth) < 2);
      expect(thin.map((s) => `${s.key} ${s.outlineStyle} ${s.outlineWidth}`), 'ring under 2px').toEqual([]);
      // (d) contrast ≥ 3:1 against the colour the ring is drawn over. The ring is dual tone (see
      // app.css --focus / --focus-halo), because no single tone can clear 3:1 against both a navy
      // segment and a cream page; for every fill at least one tone must clear the bar, and the two
      // tones must clear it against each other so the pair reads as one indicator.
      const dim = graded.filter((s) => s.ringContrast < 3).map((s) => `${s.key} ${s.ringContrast}:1 on ${s.fill}`);
      expect(dim, `focus ring under 3:1: ${dim.join(' | ')}`).toEqual([]);
      const flat = graded.filter((s) => s.tones.length > 1 && s.toneSeparation < 3);
      expect(flat.map((s) => `${s.key} ${s.toneSeparation}:1`), 'ring tones indistinguishable').toEqual([]);
    });
  }

  /**
   * Contrast arithmetic cannot see a ring that is never painted. `.view-toggle{overflow:hidden}`
   * clipped a correctly-specified 2px outline to nothing, and the computed style still read
   * `solid 2px`. So: photograph the control's neighbourhood focused and unfocused, and require the
   * pixels to differ.
   */
  test('the ring is actually painted, not clipped away by an ancestor', async ({ page }) => {
    const targets: [string, string][] = [
      ['pricing basis segment', '#view-toggle button[data-view="before"]'],
      ['pricing subview segment', '#pricing-subview button, #pricing-tools .seg'],
      ['ownership ribbon segment', '#ownership-ribbon .own-seg'],
      ['ownership owner row', '#ownership-tree tbody tr'],
    ];
    const report: Record<string, boolean> = {};
    for (const [label, selector] of targets) {
      await gotoRoute(page, label.startsWith('ownership') ? '#/diagnose/ownership' : '#/pricing');
      const node = page.locator(selector).first();
      await node.scrollIntoViewIfNeeded();
      const clip = await node.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.left - 7), y: Math.max(0, r.top - 7), width: r.width + 14, height: r.height + 14 };
      });
      await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).blur(), selector);
      const off = await page.screenshot({ clip });
      await node.focus();
      const on = await page.screenshot({ clip });
      report[label] = !off.equals(on);
      expect(report[label], `${label} (${selector}): focusing it changed not one pixel — the ring is invisible`).toBe(true);
      if (label === 'pricing basis segment') {
        await page.screenshot({ path: 'docs/evidence/focus-ring-view-toggle.png', clip });
      }
      if (label === 'ownership ribbon segment') {
        await page.screenshot({ path: 'docs/evidence/focus-ring-own-seg.png', clip });
      }
    }
    writeEvidence('focus-ring-painted.json', report);
  });

  /** R6d: every overlay hands focus back to the control that opened it. All three landed on BODY. */
  test('every overlay restores focus to the control that opened it', async ({ page }) => {
    const report: Record<string, string> = {};
    for (const [label, opener] of [['glossary', '#open-glossary'], ['sources', '#open-sources']]) {
      await gotoRoute(page, '#/pricing');
      await page.locator(opener).click();
      await settled(page);
      expect(
        await page.evaluate(() => !!document.activeElement?.closest('#drawer-host')),
        `${label}: focus must move into the overlay`
      ).toBe(true);
      await page.keyboard.press('Escape');
      await settled(page);
      const active = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? '');
      report[label] = active;
      expect(active, `${label}: focus must return to ${opener}`).toBe(opener.slice(1));
    }
    // The row-detail drawer is opened by a tree row, which the screen re-renders while it is open.
    await gotoRoute(page, '#/reconciliation');
    const row = page.locator('#reconciliation-tree tbody tr[data-node-id]').first();
    const id = await row.getAttribute('data-node-id');
    await row.click();
    await settled(page);
    await page.keyboard.press('Escape');
    await settled(page);
    report['row detail'] = await page.evaluate(() => document.activeElement?.getAttribute('data-node-id') ?? document.activeElement?.tagName ?? '');
    expect(report['row detail'], 'the row detail must return focus to its row').toBe(id);
    writeEvidence('focus-restore.json', report);
  });
});

/**
 * R7's failing clause, which had no test at all: "one action" from ANYWHERE, including from inside
 * another overlay — and an overlay you can open but not dismiss is not one action either.
 *
 * Two measured defects sat in this gap. The `g` shortcut skipped any `INPUT`, and the Data sources
 * drawer's two upload slots are file inputs one Tab from its default focus, so from there the glossary
 * took two actions (close the drawer, then press g); the masthead's own Glossary button could not
 * supply the missing one, because a modal drawer at `z-index: 40` covers the masthead at `35` and a
 * click at the button's coordinates lands on `header.drawer-head`. And when one drawer replaced
 * another, focus ended on `#screen` rather than inside the new drawer, so Escape — which `trapFocus`
 * listens for on the drawer CONTAINER — did nothing, leaving the glossary open with no keyboard exit.
 */
test('R7 — the glossary opens in one action from inside another drawer, and closes again', async ({ page }) => {
  const { problems } = recordProblems(page);
  await gotoRoute(page, '#/reconciliation');

  const openDialogs = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('#drawer-host [role="dialog"]')]
        .filter((d) => !d.hasAttribute('hidden'))
        .map((d) => d.id)
    );

  await page.locator('#open-sources').click();
  await expect(page.locator('#sources-drawer')).toBeVisible();

  // The masthead button really is occluded here — this is why the keyboard route has to carry it.
  const occludedBy = await page.evaluate(() => {
    const button = document.getElementById('open-glossary');
    if (!button) return null;
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit?.id || hit?.className || hit?.tagName || null;
  });
  expect(occludedBy, 'a modal drawer is expected to cover the masthead button').not.toBe('open-glossary');

  // ONE action, from a file input inside the other drawer.
  await page.locator('#sources-file-nav').focus();
  await page.keyboard.press('g');
  await expect(page.locator('#glossary-drawer')).toBeVisible();
  expect(await page.locator('.glscard').count(), 'the glossary must render its cards').toBeGreaterThan(10);
  expect(await openDialogs()).toEqual(['glossary-drawer']);

  // Focus must be INSIDE it, or Escape cannot reach the container that listens for Escape.
  const landed = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return active?.closest('[role="dialog"]')?.id ?? null;
  });
  expect(landed, 'focus must land inside the drawer that just opened').toBe('glossary-drawer');

  await page.keyboard.press('Escape');
  await expect(page.locator('#glossary-drawer')).toBeHidden();
  expect(await openDialogs(), 'Escape must leave no drawer open').toEqual([]);
  expectClean(problems);
});
