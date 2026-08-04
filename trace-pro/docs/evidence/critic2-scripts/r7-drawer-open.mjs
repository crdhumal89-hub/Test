/**
 * R7's fourth clause: one action to the glossary WITH A DRAWER ALREADY OPEN.
 * Both drawers on Reconciliation, and the Pricing fund-detail drawer.
 */
import { openBrowser, go, settle, save, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const page = await context.newPage();
const out = {};

async function probe(name, open) {
  await go(page, open.hash);
  await open.act(page);
  await settle(page);
  const state = await page.evaluate(() => {
    const g = document.getElementById('open-glossary');
    const b = g.getBoundingClientRect();
    const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      drawerOpen: [...document.querySelectorAll('.drawer')].filter((d) => !d.hidden).map((d) => d.id),
      glossaryButtonBox: { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) },
      elementAtItsCentre: at ? `${at.tagName.toLowerCase()}#${at.id || ''}.${String(at.className)}` : null,
      isTheButton: at === g || g.contains(at),
      scrim: (() => { const s = document.querySelector('.scrim, .backdrop, .drawer-scrim, #screen > div[class*=scrim]');
        return s ? { cls: String(s.className), z: getComputedStyle(s).zIndex, pe: getComputedStyle(s).pointerEvents } : null; })(),
    };
  });
  let clickOk = true, clickErr = null;
  try { await page.locator('#open-glossary').click({ timeout: 4000 }); } catch (e) { clickOk = false; clickErr = String(e).split('\n')[0]; }
  await settle(page);
  const afterClick = await page.evaluate(() => ({ glossaryOpen: !!document.querySelector('#glossary-drawer:not([hidden])') ||
    [...document.querySelectorAll('.drawer')].some((d) => !d.hidden && /gloss/i.test(d.id)) }));
  // reset and try the documented keypress instead
  await go(page, open.hash);
  await open.act(page);
  await settle(page);
  await page.keyboard.press('g');
  await settle(page);
  const afterKey = await page.evaluate(() => ({
    open: [...document.querySelectorAll('.drawer')].filter((d) => !d.hidden).map((d) => d.id),
    terms: document.querySelectorAll('.glscard').length,
  }));
  await page.screenshot({ path: path.join(EVIDENCE, `critic2-r7-${name}.png`) });
  out[name] = { ...state, clickOk, clickErr, afterClick, afterKeyG: afterKey };
  console.log(name, JSON.stringify(out[name], null, 1));
}

await probe('recon-row-detail', { hash: '#/reconciliation',
  act: async (p) => { await p.locator('#tree tbody tr.rowv').nth(1).click(); } });
await probe('pricing-fund-detail', { hash: '#/pricing',
  act: async (p) => { await p.locator('#pricing-price-table tbody tr').first().click(); } });
save('critic2-r7-drawer-open.json', out);
await browser.close();
