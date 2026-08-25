const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const EXTENSION_PATH = path.resolve(__dirname, '../..');

const test = base.extend({
  context: async ({}, use) => {
    const isHeadless = process.env.HEADLESS !== 'false';
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        ...(isHeadless ? ['--headless=new'] : []),
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run', '--disable-gpu', '--disable-dev-shm-usage',
        // The HTTPS fixtures server (tests/e2e/server.js, :5600) uses a
        // self-signed test-only cert (tests/e2e/certs) — trust it so specs can
        // exercise the URL model's is_https feature over a real TLS connection.
        '--ignore-certificate-errors',
        // Let specs exercise real hostnames (SAFE_DOMAINS, SSO providers, and
        // synthetic HTTPS-fixture hosts) against the local fixtures server.
        // Hostname matching ignores ports.
        '--host-resolver-rules=MAP amazon.ae 127.0.0.1, MAP accounts.google.com 127.0.0.1, MAP shop.contoso-fixture.com 127.0.0.1, MAP portal-hr-benefits.fixture 127.0.0.1, MAP www.aramex.com 127.0.0.1, MAP secure-paypa1-login.com 127.0.0.1, MAP www.google.com 127.0.0.1'
      ]
    });
    for (let i = 0; i < 30 && !context.serviceWorkers()[0]; i++) await new Promise((r) => setTimeout(r, 100));
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = sw.url().match(/chrome-extension:\/\/([^/]+)/)[1];
    await use(id);
  }
});
const BASE_HTTPS = 'https://localhost:5600';
module.exports = { test, EXTENSION_PATH, BASE_HTTPS };
