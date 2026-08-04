/** The Simulator lens's error path: is there ANY state, anywhere on the page, and is it plain English? */
import { openBrowser, watch, settle, save, BASE, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const out = {};
const CASES = {
  'apex-not-an-array': 'body.apex = "broken";',
  'edges-missing': 'delete body.edges;',
  'funds-emptied': 'body.funds = {};',
};
for (const [name, patch] of Object.entries(CASES)) {
  for (const hash of ['#/diagnose/simulator', '#/reconciliation']) {
    const page = await context.newPage();
    const problems = watch(page);
    await page.route('**/simulator.json', async (r) => {
      const resp = await r.fetch(); const body = await resp.json();
      (new Function('body', patch))(body); await r.fulfill({ json: body });
    });
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(2000);
    out[`${name}|${hash}`] = { ...await page.evaluate(() => ({
      screenText: (document.getElementById('screen')?.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 200),
      bodyText: (document.body.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 300),
      errorStatesAnywhere: [...document.querySelectorAll('.state-error')].length,
      recoveryButtons: [...document.querySelectorAll('.state-error button, #boot-error button, [role=alert] button')].map((b) => b.textContent?.trim()),
      mastheadPresent: !!document.getElementById('masthead')?.getBoundingClientRect().height,
    })), problems };
    await page.screenshot({ path: path.join(EVIDENCE, `critic2-r4c-${name}${hash.replace(/\W+/g,'_')}.png`) });
    console.log(`${name} ${hash}`, JSON.stringify(out[`${name}|${hash}`], null, 1).slice(0, 900));
    await page.close();
  }
}
save('critic2-r4c-simulator-error.json', out);
await browser.close();
