// tests/e2e/forged-keys.spec.js — page script must not dismiss ScamShield
// dialogs with a synthetic Escape (0.14.1, Task 9). Playwright's
// page.keyboard.press is a trusted event; dispatchEvent from page.evaluate is not.
const { test, openMore } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

const forgeEscape = (page) => page.evaluate(() => {
  for (const t of [document, document.body, document.activeElement || document.body]) {
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
});

test('forged Escape does not close the tech-scam escape overlay', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/techscam.html');
  const ov = page.locator('.scamshield-overlay');
  await expect(ov).toBeVisible({ timeout: 8000 });
  await forgeEscape(page);
  await page.waitForTimeout(300);
  await expect(ov).toBeVisible();
  await page.keyboard.press('Escape'); // real key still closes it
  await expect(ov).toHaveCount(0);
});

test('forged Escape does not close the form-guard overlay', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.fill('input[name="pw"]', 'secret');
  await page.click('button[type="submit"]');
  const ov = page.locator('.scamshield-overlay');
  await expect(ov).toBeVisible();
  await forgeEscape(page);
  await page.waitForTimeout(300);
  await expect(ov).toBeVisible();
});

test('forged Escape does not close the banner menu; a real one does', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  const banner = page.locator('.scamshield-banner.danger');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await openMore(banner);
  await expect(banner.locator('.ss-menu')).toBeVisible();
  await forgeEscape(page);
  await page.waitForTimeout(300);
  await expect(banner.locator('.ss-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(banner.locator('.ss-menu')).toBeHidden();
});
