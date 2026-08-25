const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

test('fake shop: red flags show in the popup Shopping card', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/fake-shop.html');
  await page.waitForTimeout(1000);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.reload();
  await expect(popup.locator('#shopcard')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#shoplist')).toContainText(/Risky payment|Fake scarcity|No contact/i);
});

test('sponsored-result mismatch is flagged on a search page', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE_HTTPS.replace('localhost', 'www.google.com') + '/serp.html');
  // The sponsored result whose ad goes to a different domain gets a warning chip;
  // the organic Wikipedia result does not.
  await expect(page.locator('.scamshield-serp')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-serp')).toHaveText(/goes to notepad-plus-plus-download\.tk/i);
  await expect(page.locator('.scamshield-serp')).toHaveCount(1);
});

test('fake-shop checks can be turned off', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ shopGuard: false }));
  const page = await context.newPage();
  await page.goto(BASE + '/fake-shop.html');
  await page.waitForTimeout(800);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.reload();
  await expect(popup.locator('#shopcard')).toBeHidden();
  await sw.evaluate(() => setSettings({ shopGuard: true }));
});
