import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser drives the real frontend against the real backend.
 *
 *   cd web && npx playwright test            # headless, prints a summary
 *   cd web && npx playwright test --ui       # watch every step in Playwright's own browser
 *   cd web && npx playwright show-report     # HTML report of the last run
 *
 * Servers that are already running (backend on 8001, frontend on 3000) are reused, so a
 * backend started with your API key keeps it. Otherwise Playwright starts both itself.
 * No test turns on "Also ask the LLM": the suite never makes a paid call (see e2e/fixtures.ts).
 */
const PYTHON = process.env.PI_PYTHON ?? ".venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share one backend and its in-memory review queue
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: [
    {
      // Backend. Development mode allows Review-page corrections without a reviewer token.
      command: `cd .. && PYTHONPATH=src PI_ENV=development ${PYTHON} -m prompt_insights serve`,
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: true,
      timeout: 180_000, // first start may download the MiniLM model
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
