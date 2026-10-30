import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a production build:
//   npm run build && npm run test:e2e
// They use the seeded database (npm run db:seed) and the built-in test
// payment provider, and create their own extra records as they go.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // The journeys share one database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", locale: "en-US" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/he`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      AUTH_URL: baseURL,
      ALLOW_TEST_PAYMENTS: "true",
      ALLOW_LOCAL_UPLOADS: "true",
      AUTH_RATE_LIMIT: "1000",
    },
  },
});
