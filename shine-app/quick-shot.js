// Quick screenshot of a few key states post-Sprint 1 features.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'test-screenshots');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });

  await page.goto('http://localhost:8088/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.review-card');
  await page.click('.review-card[data-rid="AAA-COINV-A-FY2025-D1.1"]');
  await page.waitForSelector('.finding-card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 's1-dashboard-with-nav.png'), fullPage: false });

  // Open command palette
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 's1-command-palette.png'), fullPage: false });
  await page.keyboard.press('Escape');

  // Help overlay
  await page.keyboard.press('?');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 's1-help-overlay.png'), fullPage: false });
  await page.keyboard.press('Escape');

  // Bulk selection (shift-click range)
  await page.click('.finding-card[data-fid="F-009"]', { modifiers: ['Control'] });
  await page.click('.finding-card[data-fid="F-013"]', { modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  // Scroll back to top so selection-bar is visible
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, 's1-bulk-selected.png'), fullPage: false });

  // Click somewhere to clear
  await page.click('[data-bulk="clear"]');
  await page.waitForTimeout(100);

  // Evidence drill-down
  await page.click('.finding-card[data-fid="F-004"] .finding-citation');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 's1-evidence-popover.png'), fullPage: false });
  await page.keyboard.press('Escape');

  // Drawer with comments + history
  await page.click('.finding-card[data-fid="F-006"]');
  await page.waitForSelector('.drawer.open');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 's1-drawer-comments.png'), fullPage: false });

  await browser.close();
})();
