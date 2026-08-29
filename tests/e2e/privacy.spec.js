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

// --- Cross-origin credential/card exfil watch (0.10.0, Task C2) ------------
// A card-only form (no password field — the case the existing password/
// foreign-form guard never covered) posting a Luhn-valid PAN to a different
// registrable domain. This never actually leaves the page: guardExfilForms
// (content/content_script.js) preventDefaults the submit before the toast
// (content/actions.js crossOriginCredToast) appears, same pattern as the
// leaky-form toast above.
test('cross-origin card form warns on submit attempt, without blocking the page', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/card-exfil-cross-origin.html');
  // No banner ever shows on this (otherwise-safe) fixture page — unlike the
  // phishing-form tests above, there is no visible signal that run() has
  // finished and guardExfilForms has attached its submit listener, so this
  // gives it time before submitting for real (same reasoning as the
  // "stays quiet"-style content/detection tests elsewhere in this suite).
  await page.waitForTimeout(1500);
  await page.fill('#cardnumber', '4111 1111 1111 1111');
  await page.click('button[type="submit"]');
  await expect(page.locator('.scamshield-toast')).toContainText(/card-exfil-fixture\.example/, { timeout: 8000 });
  // Warn-tier, not blocking: the page itself is untouched (no overlay).
  await expect(page.locator('.scamshield-overlay')).toHaveCount(0);
  // And it shows up in the popup Privacy card, same pipeline as leaky-form.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.reload();
  await expect(popup.locator('#privacycard')).toBeVisible({ timeout: 5000 });
  await expect(popup.locator('#privacylist')).toContainText(/card-exfil-fixture\.example/);
});

test('same-site card form: no cross-origin warning', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/card-exfil-same-site.html');
  await page.fill('#cardnumber', '4111 1111 1111 1111');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-toast')).toHaveCount(0);
});

test('card form posting to an allowlisted payment processor: no warning', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/card-exfil-sso-allowlist.html');
  await page.fill('#cardnumber', '4111 1111 1111 1111');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-toast')).toHaveCount(0);
});

test('cross-origin card warning respects the leakyFormGuard toggle', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ leakyFormGuard: false }));
  const page = await context.newPage();
  await page.goto(BASE + '/card-exfil-cross-origin.html');
  await page.waitForTimeout(1500);
  await page.fill('#cardnumber', '4111 1111 1111 1111');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  await expect(page.locator('.scamshield-toast')).toHaveCount(0);
  await sw.evaluate(() => setSettings({ leakyFormGuard: true }));
});
