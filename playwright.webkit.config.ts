/**
 * playwright.webkit.config.ts
 *
 * WebKit/Safari cross-validation run used by `pnpm benchmark:webkit`.
 * Runs only the render-count tests (not timing) against the production
 * server already started by run-benchmarks.sh (or manually via `pnpm start`).
 *
 * Results confirm that render counts are browser-engine-independent across
 * Chromium (V8), Firefox (SpiderMonkey), and WebKit/Safari (JavaScriptCore),
 * addressing the Safari/WebKit gap noted in §5.4 (Threats to Validity).
 *
 * The timing suite is excluded: TIMING_RUNS is forced to 1 so only the
 * render-count tests execute. Timing under WebKit is collected separately
 * via TIMING_RUNS=20 when a full cross-browser timing table is desired.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/playwright-results-webkit.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'echo "ERROR: start the production server first" && exit 1',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10_000,
  },
})
