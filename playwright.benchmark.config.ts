/**
 * playwright.benchmark.config.ts
 *
 * Production benchmark configuration used exclusively by `pnpm benchmark`
 * (run-benchmarks.sh). The shell script is responsible for starting and
 * stopping a production Next.js server (`pnpm start`) for each library build
 * before invoking Playwright with this config.
 *
 * Key differences from playwright.config.ts (the development convenience config):
 *  - No fallback `command` that could silently switch to a dev build.
 *  - If no server is already listening on :3000 when Playwright starts, the
 *    run fails immediately with a clear error rather than spinning up a dev server.
 *  - Short `timeout` to surface infrastructure failures quickly rather than
 *    waiting 30 s for a server that was never started.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Run tests serially — no concurrency artifacts in render count measurements.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Timing tests loop N=20 times per scenario. On slow CI runners (macos-14 shared M1,
  // ubuntu-latest 2-core) a single scenario run can take 4–6s, so N=20 × 6s = 120s
  // per test. 5 minutes provides headroom for every timing test on any runner.
  timeout: 5 * 60 * 1000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/playwright-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    // Disable traces/video/screenshots to avoid overhead affecting metrics.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // No `command` fallback — the benchmark script owns the server lifecycle.
    // If this config is invoked without a running production server on :3000,
    // Playwright will fail immediately rather than starting a dev build.
    command: 'echo "ERROR: start the production server first via pnpm benchmark" && exit 1',
    url: 'http://localhost:3000',
    // reuseExistingServer: true lets Playwright pick up the server started by
    // run-benchmarks.sh without running the error command above.
    reuseExistingServer: true,
    timeout: 10_000,
  },
})
