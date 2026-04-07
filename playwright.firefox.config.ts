/**
 * playwright.firefox.config.ts
 *
 * Firefox cross-validation run used by `pnpm benchmark:firefox`.
 * Runs only the render-count tests (not timing) against the production
 * server already started by run-benchmarks.sh (or manually via `pnpm start`).
 * Results confirm that render counts are browser-engine-independent (§5.4).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/playwright-results-firefox.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'echo "ERROR: start the production server first" && exit 1',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10_000,
  },
})
