import { defineConfig, devices } from '@playwright/test';

/**
 * Critic-3's own Playwright project. Points at an already-running `vite preview` on 5199 (the
 * grader starts it by hand, after `npm run build`, so the bundle under test is the current source),
 * and its testDir is this scripts folder so nothing under tests/ is touched.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: '../../../test-results/critic3',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE ?? 'http://127.0.0.1:5199/',
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  },
});
