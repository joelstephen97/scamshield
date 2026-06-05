// @ts-check
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? 'dot' : 'list',
  timeout: 30000,
  expect: { timeout: 7000 },
  use: { trace: 'off', video: 'off', actionTimeout: 8000 },
  webServer: {
    command: 'node tests/e2e/server.js',
    port: 5599,
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
