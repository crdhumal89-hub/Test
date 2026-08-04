import { defineConfig, devices } from '@playwright/test';

/**
 * The headless suite. Two projects share one build:
 *
 *   app     — the functional and rubric checks
 *   offline — the same suite with every off-origin request aborted, proving the app needs no
 *             network. xlsx 0.18.5 and d3 7.8.5 are served from vendor/.
 *
 * The viewport matches the parity harness exactly (1600x1000), because layout reads
 * clientWidth/clientHeight and rubric R5 asserts the primary answer is above the fold at that size.
 * Locale and timezone are pinned for the same reason the harness pins them: formatters call
 * toLocaleString('en-US').
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  webServer: {
    /*
     * BUILD, then serve. `vite preview` serves whatever is already in `dist/` and never builds, so
     * without the `npm run build` here the entire headless suite silently tests the last build
     * instead of the current source. That is not hypothetical: it is how a real R1 defect survived
     * a deliberate attempt to reproduce it — the fix was removed from `components.css`, the suite
     * was re-run, and all six tests passed against the stale bundle that still contained it.
     * A suite that can pass against code that is not the code under test proves nothing.
     */
    command: 'npm run build && npx vite preview --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4178/',
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    // The simulator and both graphs jump to their final state under reduced motion, which makes
    // the suite fast and the assertions stable.
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /offline\.spec\.ts/ },
    { name: 'offline', testMatch: /offline\.spec\.ts/ },
  ],
});
