import { chromium } from '/home/user/Test/trace-pro/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4178/';
const ROUTES = [
  ['reconciliation', '#/reconciliation'],
  ['pricing', '#/pricing'],
  ['diagnose-structure', '#/diagnose/structure'],
  ['diagnose-ownership', '#/diagnose/ownership'],
  ['diagnose-data-quality', '#/diagnose/data-quality'],
  ['diagnose-simulator', '#/diagnose/simulator'],
];

const lum = (rgb) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const parse = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).map(Number);
  return [p[0], p[1], p[2]];
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const report = {};

for (const [id, hash] of ROUTES) {
  await page.goto(BASE + hash, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const stops = [];
  await page.evaluate(() => document.activeElement?.blur?.());
  for (let i = 0; i < 260; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const n = document.activeElement;
      if (!n || n === document.body) return null;
      const cs = getComputedStyle(n);
      const b = n.getBoundingClientRect();
      // walk up for an effective background
      let bg = 'rgba(0, 0, 0, 0)';
      let p = n;
      while (p) {
        const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          bg = c;
          break;
        }
        p = p.parentElement;
      }
      return {
        tag: n.tagName.toLowerCase(),
        role: n.getAttribute('role') ?? '',
        name: (n.getAttribute('aria-label') ?? n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        w: Math.round(b.width),
        h: Math.round(b.height),
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 1 && b.height > 1,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
        bg,
        inViewport: b.top >= -2 && b.bottom <= window.innerHeight + 2,
      };
    });
    if (!s) break;
    const key = `${s.tag}[${s.role}] ${s.name}`;
    if (stops.length && stops[stops.length - 1].key === key && i > 3) break;
    const oc = parse(s.outlineColor);
    const bgc = parse(s.bg);
    let contrast = null;
    if (oc && bgc) {
      const l1 = lum(oc), l2 = lum(bgc);
      contrast = +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2);
    }
    stops.push({ key, ...s, contrast });
  }
  report[id] = {
    total: stops.length,
    invisibleStops: stops.filter((s) => !s.visible).map((s) => ({ key: s.key, w: s.w, h: s.h })),
    noOutline: stops.filter((s) => s.outlineStyle === 'none' || s.outlineWidth === '0px').map((s) => s.key),
    lowContrast: stops.filter((s) => s.contrast !== null && s.contrast < 3).map((s) => ({ key: s.key, contrast: s.contrast, oc: s.outlineColor, bg: s.bg })),
    thin: stops.filter((s) => parseFloat(s.outlineWidth) < 2).map((s) => ({ key: s.key, w: s.outlineWidth })),
    stops,
  };
  console.log(`=== ${id}: ${stops.length} stops; invisible=${report[id].invisibleStops.length}; noOutline=${report[id].noOutline.length}; contrast<3=${report[id].lowContrast.length}; outline<2px=${report[id].thin.length}`);
  for (const x of report[id].invisibleStops.slice(0, 6)) console.log('    INVISIBLE STOP', JSON.stringify(x));
  for (const x of report[id].lowContrast.slice(0, 4)) console.log('    LOW CONTRAST', JSON.stringify(x));
  for (const x of report[id].thin.slice(0, 4)) console.log('    THIN RING', JSON.stringify(x));
}
fs.writeFileSync('/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/r6.json', JSON.stringify(report, null, 1));
await browser.close();
