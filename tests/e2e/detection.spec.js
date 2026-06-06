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

test('programmatic form.submit() on a foreign credential form is intercepted', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-autosubmit.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.click('#go');
  await expect(page.locator('.scamshield-overlay')).toBeVisible();
});

test('SPA navigation re-scans and hides newly injected scam content', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/spa.html');
  await page.waitForTimeout(500);
  await expect(page.locator('#prize')).toHaveCount(0);
  await page.click('#nav');
  await expect(page.locator('#prize.scamshield-hidden-block')).toBeVisible({ timeout: 8000 });
});

test('brand-visual phishing shows a danger banner', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/brand-visual.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
});

test('clipboard hijack shows a warning toast', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard.html');
  await page.bringToFront();
  await page.click('#c');
  await expect(page.locator('.scamshield-toast')).toBeVisible({ timeout: 6000 });
});

test('tech-support scare page shows escape overlay', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/techscam.html');
  await expect(page.locator('.scamshield-overlay')).toBeVisible({ timeout: 8000 });
});

test('wallet drainer request is intercepted and rejected on cancel', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/drainer.html');
  await page.waitForTimeout(600); // let the MAIN-world hook wrap window.ethereum
  await page.click('#go');
  await expect(page.locator('.scamshield-overlay')).toBeVisible({ timeout: 6000 });
  await page.click('.scamshield-overlay .ss-actions button'); // Cancel (first button)
  await expect.poll(() => page.evaluate(() => window.__rejected), { timeout: 5000 }).toBe(4001);
});
