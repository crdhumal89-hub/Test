import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const ROUTES = [
  ['reconciliation', '#/reconciliation'],
  ['pricing', '#/pricing'],
  ['diagnose-structure', '#/diagnose/structure'],
  ['diagnose-ownership', '#/diagnose/ownership'],
  ['diagnose-data-quality', '#/diagnose/data-quality'],
  ['diagnose-simulator', '#/diagnose/simulator'],
];
const BASE = 'http://127.0.0.1:4178/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const out = {};
for (const [id, hash] of ROUTES) {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const texts = await page.evaluate(() => {
    const collect = (host) => {
      if (!host) return [];
      const parts = [];
      const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let n = w.nextNode();
      while (n) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (t) {
          const p = n.parentElement;
          const r = p?.getBoundingClientRect();
          const vis = !!r && r.width > 0 && r.height > 0;
          parts.push({ t, tag: p?.tagName.toLowerCase(), cls: p?.className?.toString?.() ?? '', vis });
        }
        n = w.nextNode();
      }
      return parts;
    };
    return {
      masthead: collect(document.getElementById('masthead')),
      screen: collect(document.getElementById('screen')),
      svgText: Array.from(document.querySelectorAll('#screen svg text, #screen svg title')).map((e) => e.textContent.trim()),
      titles: Array.from(document.querySelectorAll('#screen [title]')).map((e) => e.getAttribute('title')),
      ariaLabels: Array.from(document.querySelectorAll('#screen [aria-label]')).map((e) => e.getAttribute('aria-label')),
    };
  });
  out[id] = texts;
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
await browser.close();
console.log('done');
