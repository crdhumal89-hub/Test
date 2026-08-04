/** R7 with a drawer open — measured by "35 glossary cards visible", not by a hidden attribute. */
import { openBrowser, go, settle, save, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const out = {};
const STATE = () => {
  const cards = [...document.querySelectorAll('.glscard')].filter((c) => c.getBoundingClientRect().height > 0);
  const g = document.getElementById('open-glossary');
  const b = g.getBoundingClientRect();
  const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    visibleGlossaryCards: cards.length,
    openDrawers: [...document.querySelectorAll('.drawer')].filter((d) => d.getBoundingClientRect().height > 0).map((d) => d.id),
    glossaryButtonHitTest: at ? `${at.tagName.toLowerCase()}#${at.id || ''}.${String(at.className)}` : null,
    glossaryButtonReceivesPointer: at === g || g.contains(at),
    coveringElement: (() => { if (at === g || g.contains(at)) return null;
      return { tag: at?.tagName, id: at?.id, cls: String(at?.className), z: at ? getComputedStyle(at).zIndex : null,
        pos: at ? getComputedStyle(at).position : null, outer: at?.outerHTML?.slice(0, 160) }; })(),
  };
};
async function scenario(name, hash, act) {
  const page = await context.newPage();
  await go(page, hash);
  await act(page);
  await settle(page);
  const before = await page.evaluate(STATE);
  // route 1: the click
  let clickOk = true, err = null;
  try { await page.locator('#open-glossary').click({ timeout: 3500 }); } catch (e) { clickOk = false; err = String(e).split('\n')[0]; }
  await settle(page);
  const afterClick = await page.evaluate(STATE);
  await page.close();
  // route 2: the documented keypress, from a clean repeat of the same scenario
  const p2 = await context.newPage();
  await go(p2, hash);
  await act(p2);
  await settle(p2);
  await p2.keyboard.press('g');
  await settle(p2);
  const afterKey = await p2.evaluate(STATE);
  await p2.screenshot({ path: path.join(EVIDENCE, `critic2-r7b-${name}.png`) });
  await p2.close();
  out[name] = { before, clickOk, clickErr: err, afterClick, afterKeyG: afterKey };
  console.log(name,
    '| glossary button clickable:', before.glossaryButtonReceivesPointer,
    '| cards after click:', afterClick.visibleGlossaryCards,
    '| cards after G:', afterKey.visibleGlossaryCards,
    '| covered by:', JSON.stringify(before.coveringElement?.outer ?? null));
}
await scenario('no-drawer-reconciliation', '#/reconciliation', async () => {});
await scenario('recon-row-detail-open', '#/reconciliation', async (p) => { await p.locator('#tree tbody tr.rowv').nth(1).click(); });
await scenario('pricing-fund-detail-open', '#/pricing', async (p) => { await p.locator('#pricing-price-table tbody tr').first().click(); });
await scenario('sources-drawer-open', '#/pricing', async (p) => { await p.locator('#open-sources').click(); });
save('critic2-r7b.json', out);
await browser.close();
