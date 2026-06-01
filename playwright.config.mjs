import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT || "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node server.js",
    url: baseURL,
    env: {
      ...process.env,
      PORT: port,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
