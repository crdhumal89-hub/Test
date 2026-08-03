import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';

const BASE = 'http://127.0.0.1:4178/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

// ---- A. focus ring on the segmented pricing-basis control, clipped by overflow:hidden?
await page.goto(BASE + '#/reconciliation', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('#view-toggle button[data-view="before"]').focus());
await page.screenshot({ path: 'docs/evidence/review-focus-view-toggle.png', clip: { x: 1150, y: 5, width: 300, height: 50 } });
const clip = await page.evaluate(() => {
  const t = document.getElementById('view-toggle');
  const b = t.querySelector('button[data-view="before"]');
  return {
    toggleOverflow: getComputedStyle(t).overflow,
    buttonOutline: getComputedStyle(b).outline,
    buttonOffset: getComputedStyle(b).outlineOffset,
  };
});
console.log('A. view-toggle', JSON.stringify(clip));

// ---- B. drawer focus trap, Esc, and focus restore
for (const [label, opener] of [['glossary', '#open-glossary'], ['sources', '#open-sources']]) {
  await page.goto(BASE + '#/pricing', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate((s) => document.querySelector(s).focus(), opener);
  const before = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
  await page.click(opener);
  await page.waitForTimeout(600);
  const afterOpen = await page.evaluate(() => ({
    active: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
    insideDrawer: !!document.activeElement.closest('#drawer-host'),
  }));
  // Tab 60 times and see whether focus ever escapes the drawer
  let escaped = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const out = await page.evaluate(() => {
      const n = document.activeElement;
      if (!n || n === document.body) return 'BODY';
      return n.closest('#drawer-host') ? null : (n.id || n.className || n.tagName);
    });
    if (out) escaped.push(out);
  }
  // Shift-Tab back too
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Shift+Tab');
    const out = await page.evaluate(() => {
      const n = document.activeElement;
      if (!n || n === document.body) return 'BODY';
      return n.closest('#drawer-host') ? null : (n.id || n.className || n.tagName);
    });
    if (out) escaped.push('shift:' + out);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const closed = await page.evaluate(() => {
    const d = document.querySelector('#drawer-host .drawer');
    return { present: !!d, hidden: d ? d.hidden || getComputedStyle(d).display === 'none' : true, restored: document.activeElement.id || document.activeElement.tagName };
  });
  console.log(`B. ${label}: focusBefore=${before} onOpen=${JSON.stringify(afterOpen)} escapes=${escaped.length} ${JSON.stringify([...new Set(escaped)].slice(0, 6))} afterEsc=${JSON.stringify(closed)}`);
}

// ---- C. graph nodes: reachable by keyboard, arrow keys walk, Enter selects
await page.goto(BASE + '#/diagnose/structure', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const graph = await page.evaluate(() => {
  const stage = document.getElementById('structure-stage');
  const svg = stage?.querySelector('svg');
  const focusables = stage ? Array.from(stage.querySelectorAll('[tabindex],button,a[href]')).map((e) => ({ tag: e.tagName, ti: e.getAttribute('tabindex'), role: e.getAttribute('role'), name: e.getAttribute('aria-label')?.slice(0, 40) })) : [];
  const nodeEls = svg ? svg.querySelectorAll('g.node, .node, circle, rect').length : 0;
  return { hasSvg: !!svg, focusables: focusables.slice(0, 6), focusableCount: focusables.length, nodeEls };
});
console.log('C. structure stage', JSON.stringify(graph));
// tab into the stage and try arrows
await page.evaluate(() => {
  const f = document.querySelector('#structure-stage [tabindex]');
  if (f) f.focus();
});
const beforeArrow = await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.tagName);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
const afterArrow = await page.evaluate(() => ({ label: document.activeElement.getAttribute('aria-label') || document.activeElement.tagName, live: document.querySelector('#structure-stage [aria-live]')?.textContent?.slice(0, 60) }));
console.log('C2. arrow walk', JSON.stringify({ beforeArrow, afterArrow }));
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const sel = await page.evaluate(() => document.querySelector('#diagnose-entity')?.value);
console.log('C3. Enter selected entity ->', sel);

await browser.close();
