import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("E2E requires a dedicated _test database");
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15000,
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    env: {
      AUTH_EMAIL_FROM: "",
      RESEND_API_KEY: "",
      WHATSAPP_ACCESS_TOKEN: "",
      WHATSAPP_META_APP_SECRET: "",
      WHATSAPP_ORGANIZATION_ID: "",
      BACKUP_DIRECTORY: ".local/e2e-backups",
    },
    command: "node --env-file=.env.test node_modules/next/dist/bin/next start",
    url: "http://localhost:3000/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
