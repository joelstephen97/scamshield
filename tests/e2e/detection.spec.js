const { test, EXTENSION_PATH } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

test('clean page shows no warning banner', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html');
  await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('phishing login form triggers banner and submit overlay', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.fill('input[name="pw"]', 'secret');
  await page.click('button[type="submit"]');
  await expect(page.locator('.scamshield-overlay')).toBeVisible();
  await expect(page.locator('.scamshield-overlay h3')).toContainText('phishing');
});

test('scam giveaway content is hidden', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/scam-giveaway.html');
  await expect(page.locator('#prize.scamshield-hidden-block')).toBeVisible({ timeout: 8000 });
});

test('popup reflects a dangerous verdict', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await page.waitForTimeout(800);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // popup reads the active tab; activate the content tab first
  await page.bringToFront();
  await popup.reload();
  await expect(popup.locator('#status')).toHaveClass(/dangerous|suspicious/, { timeout: 5000 });
});
