const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'test-screenshots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERR:', e.message));
  await page.goto('http://localhost:8088/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-rid]');
  await page.click('[data-rid="AAA-COINV-A-FY2025-D1.1"]');
  await page.waitForSelector('.finding-card');
  // Open audit report (richer — has reconciler + evergreen)
  await page.click('#btn-export-audit');
  await page.waitForSelector('#report-modal.open');
  const frame = page.frameLocator('#report-frame');
  await frame.locator('.cover h1').waitFor();
  await page.waitForTimeout(300);

  // Scroll iframe to exec summary (second .page)
  await page.evaluate(() => {
    const f = document.getElementById('report-frame');
    const doc = f.contentDocument;
    const pages = doc.querySelectorAll('.page');
    if (pages[1]) pages[1].scrollIntoView();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'report-exec-summary.png') });

  // Scroll to a findings section
  await page.evaluate(() => {
    const f = document.getElementById('report-frame');
    const doc = f.contentDocument;
    const secs = doc.querySelectorAll('.report-section');
    if (secs[1]) secs[1].scrollIntoView();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'report-findings-section.png') });

  await browser.close();
})();
