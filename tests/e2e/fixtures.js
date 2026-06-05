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
        '--no-first-run', '--disable-gpu', '--disable-dev-shm-usage'
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
module.exports = { test, EXTENSION_PATH };
