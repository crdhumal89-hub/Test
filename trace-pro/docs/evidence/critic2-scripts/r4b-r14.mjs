/**
 * The failure R4 names in its own words ("fetch rejected -> error") applied to each of the five
 * fixtures, on each route. R14's bar is the same run: zero uncaught errors, every caught error
 * surfaced in the UI.
 */
import { openBrowser, watch, settle, save, BASE, EVIDENCE } from './lib.mjs';
import path from 'node:path';
const { browser, context } = await openBrowser();
const out = {};
const FIXTURES = ['lookthrough.json', 'repricing.json', 'simulator.json', 'universe.json', 'manifest.json'];
const MODES = {
  abort:    async (r) => r.abort(),
  http500:  async (r) => r.fulfill({ status: 500, body: 'server error' }),
  notJson:  async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{ this is not json' }),
  emptyObj: async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
};
const ROUTES = ['#/reconciliation', '#/pricing', '#/diagnose/structure', '#/diagnose/simulator'];

for (const fixture of FIXTURES) {
  for (const [mode, handler] of Object.entries(MODES)) {
    for (const hash of ROUTES) {
      const page = await context.newPage();
      const problems = watch(page);
      await page.route(`**/${fixture}`, handler);
      await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' }).catch(() => {});
      await page.waitForTimeout(1800);
      const s = await page.evaluate(() => {
        const screen = document.getElementById('screen');
        const t = (screen?.innerText ?? '').replace(/\s+/g, ' ').trim();
        return { screenBlank: t.length === 0, screenChars: t.length,
          errorStates: [...document.querySelectorAll('.state-error')].map((n) => (n.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 90)),
          bootError: (document.body.innerText ?? '').replace(/\s+/g,' ').trim().slice(0, 120),
          questionVisible: !!document.querySelector('#screen .screen-question')?.getBoundingClientRect().height };
      });
      const uncaught = problems.filter((p) => p.startsWith('pageerror'));
      const key = `${fixture}|${mode}|${hash}`;
      out[key] = { ...s, uncaught, allProblems: problems };
      if (s.screenBlank || uncaught.length) {
        console.log('DEFECT', key, '| blank:', s.screenBlank, '| uncaught:', JSON.stringify(uncaught), '| body:', s.bootError.slice(0, 90));
        await page.screenshot({ path: path.join(EVIDENCE, `critic2-r4b-${fixture.replace('.json','')}-${mode}-${hash.replace(/\W+/g,'_')}.png`) });
      }
      await page.close();
    }
  }
}
const bad = Object.entries(out).filter(([, v]) => v.screenBlank || v.uncaught.length);
console.log('\nTOTAL scenarios:', Object.keys(out).length, '| blank-or-uncaught:', bad.length);
const noErrorState = Object.entries(out).filter(([, v]) => !v.screenBlank && v.errorStates.length === 0);
console.log('scenarios with no visible error state at all:', noErrorState.length);
console.log(noErrorState.map(([k]) => k).slice(0, 30).join('\n'));
save('critic2-r4b-r14-fixture-failures.json', out);
await browser.close();
