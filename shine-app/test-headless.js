// Headless integration test for SHINE app
// Walks the major flows, captures screenshots, reports console errors / 404s.

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BASE = 'http://localhost:8088';
const errors = [];
const warnings = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE ERROR: ' + m.text());
    if (m.type() === 'warning') warnings.push('CONSOLE WARN: ' + m.text());
  });
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQ FAILED: ' + r.url() + ' ' + r.failure().errorText));
  page.on('response', r => { if (r.status() === 404) errors.push('404: ' + r.url()); });

  async function shot(name) {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name + '.png'), fullPage: false });
    console.log('  📸 ' + name);
  }

  async function step(name, fn) {
    process.stdout.write('▶ ' + name + ' ... ');
    try { await fn(); console.log('OK'); } catch (e) { console.log('FAIL: ' + e.message); errors.push(name + ': ' + e.message); }
  }

  // ============================================
  await step('load reviews list', async () => {
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('.review-card');
    const cards = await page.$$('.review-card');
    if (cards.length !== 3) throw new Error('expected 3 review cards, got ' + cards.length);
    await shot('01-reviews-list');
  });

  await step('open primary review', async () => {
    await page.click('.review-card[data-rid="AAA-COINV-A-FY2025-D1.1"]');
    await page.waitForSelector('.finding-card');
    const cards = await page.$$('.finding-card');
    if (cards.length === 0) throw new Error('no findings rendered');
    console.log('     (' + cards.length + ' findings)');
    await shot('02-dashboard');
  });

  await step('readiness banner shows NOT_READY', async () => {
    const state = await page.$eval('#readiness-state', el => el.className);
    if (!state.includes('NOT_READY')) throw new Error('expected NOT_READY, got ' + state);
  });

  await step('group by severity toggle', async () => {
    await page.click('#group-mode [data-group="severity"]');
    await page.waitForTimeout(120);
    const headers = await page.$$eval('.group-header-label', els => els.map(e => e.textContent));
    if (!headers.includes('Critical')) throw new Error('no Critical group');
    await shot('03-by-severity');
    await page.click('#group-mode [data-group="statement"]');
    await page.waitForTimeout(120);
  });

  await step('group by layer toggle', async () => {
    await page.click('#group-mode [data-group="layer"]');
    await page.waitForTimeout(120);
    await shot('04-by-layer');
    await page.click('#group-mode [data-group="statement"]');
    await page.waitForTimeout(120);
  });

  await step('severity filter Critical', async () => {
    await page.click('#severity-filter [data-severity="CRITICAL"]');
    await page.waitForTimeout(120);
    const cards = await page.$$('.finding-card');
    if (cards.length === 0) throw new Error('no critical findings shown after filter');
    await page.click('#severity-filter [data-severity="all"]');
    await page.waitForTimeout(120);
  });

  await step('search', async () => {
    await page.fill('#findings-search', 'level 3');
    await page.waitForTimeout(150);
    const cards = await page.$$('.finding-card');
    if (cards.length === 0) throw new Error('no findings after search');
    await page.fill('#findings-search', '');
    await page.waitForTimeout(120);
  });

  await step('open drawer for F-004 (reconciler root cause)', async () => {
    await page.click('.finding-card[data-fid="F-004"]');
    await page.waitForSelector('.drawer.open');
    await shot('05-drawer-reconciler');
  });

  await step('drawer shows constituents', async () => {
    const constituents = await page.$$('.constituent-row');
    if (constituents.length === 0) throw new Error('no constituents rendered');
    await page.click('#drawer-close');
    await page.waitForTimeout(150);
  });

  await step('discard a finding', async () => {
    await page.click('.finding-card[data-fid="F-016"] [data-action="reopen"]').catch(() => {});
    await page.waitForTimeout(120);
    // F-016 starts DISCARDED so we'll reopen it and then test the modal flow on someone else
  });

  await step('accept finding F-006', async () => {
    await page.click('.finding-card[data-fid="F-006"] [data-action="accept"]');
    await page.waitForTimeout(120);
    const state = await page.$eval('.finding-card[data-fid="F-006"] .chip-state', el => el.textContent.trim());
    if (state !== 'ACCEPTED') throw new Error('expected ACCEPTED, got ' + state);
    await shot('06-after-accept');
  });

  await step('undo via Ctrl+Z', async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    const state = await page.$eval('.finding-card[data-fid="F-006"] .chip-state', el => el.textContent.trim());
    if (state !== 'OPEN') throw new Error('undo did not revert; state = ' + state);
  });

  await step('open settings & toggle theme dark', async () => {
    await page.click('.nav-tab[data-view="settings"]');
    await page.waitForSelector('#view-settings.active');
    await shot('07-settings-light');
    await page.click('#theme-seg [data-theme="dark"]');
    await page.waitForTimeout(120);
    await shot('08-settings-dark');
  });

  await step('coverage view', async () => {
    await page.click('.nav-tab[data-view="coverage"]');
    await page.waitForSelector('#view-coverage.active');
    await shot('09-coverage-dark');
  });

  await step('back to dashboard in dark', async () => {
    await page.click('.nav-tab[data-view="dashboard"]');
    await page.waitForSelector('#view-dashboard.active');
    await page.waitForTimeout(150);
    await shot('10-dashboard-dark');
  });

  await step('back to light', async () => {
    await page.click('.nav-tab[data-view="settings"]');
    await page.click('#theme-seg [data-theme="light"]');
    await page.waitForTimeout(120);
    await page.click('.nav-tab[data-view="dashboard"]');
    await page.waitForTimeout(120);
  });

  await step('mobile viewport check', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await shot('11-mobile-dashboard');
    await page.click('.nav-tab[data-view="reviews"]');
    await page.waitForTimeout(120);
    await shot('12-mobile-reviews');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await step('PDF export — preparer', async () => {
    await page.click('.nav-tab[data-view="dashboard"]');
    await page.waitForTimeout(120);
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.click('#btn-export-preparer');
    const dl = await downloadPromise;
    const dest = path.join(SCREENSHOTS_DIR, 'preparer-export.pdf');
    await dl.saveAs(dest);
    const sz = fs.statSync(dest).size;
    if (sz < 500) throw new Error('PDF too small: ' + sz + ' bytes');
    console.log('     (' + sz + ' bytes saved)');
  });

  await step('discard >20% triggers attestation modal', async () => {
    // Reset to seed (F-016 already DISCARDED = 1/16 = 6.25%).
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.review-card');
    await page.click('.review-card[data-rid="AAA-COINV-A-FY2025-D1.1"]');
    await page.waitForSelector('.finding-card');
    // Two background discards land below the 20% gate:
    //   F-009 → projected 2/16 = 12.5%
    //   F-010 → projected 3/16 = 18.75%
    await page.click('.finding-card[data-fid="F-009"] [data-action="discard"]');
    await page.waitForTimeout(80);
    await page.click('.finding-card[data-fid="F-010"] [data-action="discard"]');
    await page.waitForTimeout(80);
    // Third discard (F-014) → projected 4/16 = 25% → MODAL EXPECTED
    await page.click('.finding-card[data-fid="F-014"] [data-action="discard"]');
    await page.waitForTimeout(200);
    const modalOpen = await page.evaluate(() => document.getElementById('modal-discard').classList.contains('open'));
    if (!modalOpen) throw new Error('discard attestation modal did not open at projected 25%');
    await shot('13-discard-attestation-modal');
    // Confirm with attestation
    await page.fill('#discard-reason', 'Below clearly-trivial threshold; preparer aware.');
    await page.click('#discard-confirm');
    await page.waitForTimeout(120);
    const f14state = await page.$eval('.finding-card[data-fid="F-014"] .chip-state', el => el.textContent.trim());
    if (f14state !== 'DISCARDED') throw new Error('F-014 not discarded after attestation; state = ' + f14state);
  });

  await step('modal click-outside-to-close', async () => {
    // Trigger modal again
    await page.click('.finding-card[data-fid="F-013"] [data-action="discard"]');
    await page.waitForTimeout(150);
    const opened = await page.evaluate(() => document.getElementById('modal-discard').classList.contains('open'));
    if (!opened) throw new Error('modal did not reopen');
    // Click on the backdrop at position (5, 5) relative to the backdrop element.
    // The backdrop has padding 24px around the centered modal, so (5,5) is on the backdrop, not on .modal.
    await page.locator('#modal-discard').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(120);
    const closed = await page.evaluate(() => !document.getElementById('modal-discard').classList.contains('open'));
    if (!closed) throw new Error('click outside modal did not close it');
  });

  await step('evergreen mark on LOW finding', async () => {
    // F-016 was DISCARDED but we reopened earlier; let's discard rate has settled.
    // Use a LOW finding: F-016 (LOW formatting). First reopen it.
    await page.click('.finding-card[data-fid="F-016"] [data-action="reopen"]').catch(() => {});
    await page.waitForTimeout(120);
    await page.click('.finding-card[data-fid="F-016"]');
    await page.waitForSelector('.drawer.open');
    await page.click('.drawer [data-action="evergreen"]');
    await page.waitForTimeout(150);
    const modalOpen = await page.evaluate(() => document.getElementById('modal-evergreen').classList.contains('open'));
    if (!modalOpen) throw new Error('evergreen modal did not open');
    await page.fill('#evergreen-reason', 'Cosmetic; preparer to fix without tracking.');
    await page.click('#evergreen-confirm');
    await page.waitForTimeout(150);
    const badge = await page.$('.finding-card[data-fid="F-016"] .chip-rec.EVERGREEN_ACCEPTED');
    if (!badge) throw new Error('evergreen badge not rendered');
    await shot('14-evergreen-applied');
  });

  await step('drawer overlay closes drawer', async () => {
    // Reset: close any open drawer from prior test
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    await page.click('.finding-card[data-fid="F-004"]');
    await page.waitForSelector('.drawer.open');
    await page.click('#drawer-overlay');
    await page.waitForTimeout(150);
    const open = await page.evaluate(() => document.getElementById('finding-drawer').classList.contains('open'));
    if (open) throw new Error('overlay click did not close drawer');
  });

  await step('clear local state resets dispositions', async () => {
    await page.click('.nav-tab[data-view="settings"]');
    await page.waitForSelector('#view-settings.active');
    page.once('dialog', d => d.accept());
    await page.click('#btn-clear-state');
    await page.waitForTimeout(200);
    // Should be back to seed: F-005 ACCEPTED, F-015 RESOLVED, F-016 DISCARDED
    await page.click('.nav-tab[data-view="dashboard"]');
    await page.waitForTimeout(150);
    const f015 = await page.$eval('.finding-card[data-fid="F-015"] .chip-state', el => el.textContent.trim());
    if (f015 !== 'RESOLVED') throw new Error('clear state did not reset (F-015 = ' + f015 + ')');
  });

  await step('XSS smoke — malicious strings in finding payload are escaped', async () => {
    // Inject a finding whose subagentRaw, section, location, and fix contain HTML/JS.
    await page.evaluate(() => {
      const malicious = {
        brief: { review_id: 'XSS-TEST', fund_code: '<img src=x onerror="window.__xss=1">', fund_legal_name: '<script>window.__xss=1</script>Malice LP', domicile: 'Cayman', structure_type: 'Test', period: 'FY2025', draft: 'Draft 0', regulatory_jurisdictions: ['CIMA'], materiality_planning_value: 0, clearly_trivial_value: 0, materiality_planning_pct: 0, build_date: '2026-05-17' },
        coverage: { subagents_completed: [], layers_covered: [], layers_skipped: [], asc_paragraphs_applicable_count: 0, asc_paragraphs_checked_count: 0, asc_paragraphs_skipped_with_reason: [], coverage_completeness_pct: 1, regulatory_citations_referenced: [], regulatory_corpus_attestation_age_days: {}, subagent_elapsed_seconds: { '<script>alert(1)</script>': 99 }, subagent_timeouts_fired: [], schema_rejections: { total: 0, by_subagent: {} } },
        findings: [{
          id: 'F-001', subagent: 'mechanical', layer: 'L2',
          statement: 'Cover',
          section: '<img src=x onerror="window.__xss=1">',
          sortOrder: 1,
          location: { statement: 'Cover', page: 1, line_id: '<script>window.__xss=1</script>', note_ref: null, column: null, xlsx_cell: null },
          severity: { impact: 'HIGH', confidence: 'CERTAIN' },
          subagentRaw: '<script>window.__xss=1</script>raw',
          voiceNormalized: null, controllerEdited: null,
          fix: '<img src=x onerror="window.__xss=1">',
          fixSubagentRaw: 'fix', fixVoiceNormalized: null,
          merge_key: 'a::b::c::tie_out_break', finding_class: 'tie_out_break',
          prior_review_recurrence: 'NEW', evergreen_accepted: false,
          subagent_version: '8.1.0', prompt_version: 'v8.1.0', reference_versions: {},
          state: 'OPEN'
        }]
      };
      window.__xss = 0;
      window.SHINE_SAMPLE.review = malicious;
      window.SHINE_SAMPLE.reviews_index.unshift({
        review_id: 'XSS-TEST', fund_code: malicious.brief.fund_code, fund_legal_name: malicious.brief.fund_legal_name,
        period: 'FY2025', draft: 'D0', reviewer: '<svg onload="window.__xss=1"></svg>', review_date: '2026-05-17',
        readiness: 'NOT_READY', finding_count: 1, coverage_pct: 1
      });
    });
    // Reload nav to render the reviews list with the malicious entry
    await page.click('.nav-tab[data-view="reviews"]');
    await page.waitForTimeout(200);
    await page.click('.review-card[data-rid="XSS-TEST"]');
    await page.waitForSelector('.finding-card[data-fid="F-001"]');
    await page.click('.finding-card[data-fid="F-001"]');
    await page.waitForSelector('.drawer.open');
    const xssTriggered = await page.evaluate(() => window.__xss === 1);
    if (xssTriggered) throw new Error('XSS payload executed — escaping is broken');
    await page.keyboard.press('Escape');
  });

  await step('PDF export — audit', async () => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.click('#btn-export-audit');
    const dl = await downloadPromise;
    const dest = path.join(SCREENSHOTS_DIR, 'audit-file-export.pdf');
    await dl.saveAs(dest);
    const sz = fs.statSync(dest).size;
    if (sz < 500) throw new Error('PDF too small: ' + sz + ' bytes');
    console.log('     (' + sz + ' bytes saved)');
  });

  // === Report ===
  console.log('\n=== CONSOLE ERRORS ===');
  if (errors.length === 0) console.log('  none');
  else errors.forEach(e => console.log('  ' + e));
  console.log('\n=== CONSOLE WARNINGS ===');
  if (warnings.length === 0) console.log('  none');
  else warnings.slice(0, 10).forEach(w => console.log('  ' + w));

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
