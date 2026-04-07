import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Run tests serially for consistent, reproducible metrics
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/playwright-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    // Disable traces to avoid overhead affecting timing metrics
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
  // Development convenience server — starts automatically for `pnpm test:e2e`.
  // WARNING: this is a DEVELOPMENT build (React StrictMode enabled, no minification).
  // Render counts and bundle sizes measured here do NOT match the paper's results.
  // For reproducible benchmark measurements use `pnpm benchmark`, which invokes
  // run-benchmarks.sh with a production build and playwright.benchmark.config.ts.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
