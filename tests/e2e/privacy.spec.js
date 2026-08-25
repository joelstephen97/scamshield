const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

test('leaky form: typing an email that is beaconed to a third party warns before submit', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/leaky-form.html');
  await page.fill('#email', 'jane.doe@example.com');
  // The in-page toast appears without any submit.
  await expect(page.locator('.scamshield-toast')).toContainText(/before you (pressed )?submit|sent your email/i, { timeout: 8000 });
  // And it shows up in the popup Privacy card.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.reload();
  await expect(popup.locator('#privacycard')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#privacylist')).toContainText(/tracker\.example/);
});

test('fingerprinting page is detected and named in the popup Privacy card', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/fingerprint.html');
  await page.waitForTimeout(1500);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.reload();
  await expect(popup.locator('#privacycard')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#privacylist')).toContainText(/fingerprint/i);
});

test('leaky-form guard can be turned off', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ leakyFormGuard: false }));
  const page = await context.newPage();
  await page.goto(BASE + '/leaky-form.html');
  await page.fill('#email', 'jane.doe@example.com');
  await page.waitForTimeout(1200);
  await expect(page.locator('.scamshield-toast')).toHaveCount(0);
  await sw.evaluate(() => setSettings({ leakyFormGuard: true }));
});
