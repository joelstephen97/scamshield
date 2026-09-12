// tests/e2e/warning-memory.spec.js — per-site per-kind warning memory (mute)
// e2e ladder: mute + survive-reload + undo, per-kind isolation, banner ✕
// snooze expiry, and (Task 8) the options "Muted warnings" list.
//
// Fixture/host notes:
// - BASE (http://localhost:5599) is the plain-http fixtures origin used
//   throughout this suite (see detection.spec.js, copy-report.spec.js etc.)
// - content-suspicious.html needs the HTTPS fixture origin (BASE_HTTPS,
//   localhost:5600) to stay a "suspicious" (not "dangerous") verdict — see
//   detection.spec.js's banner-✕ test (Task 5). Both origins resolve to
//   hostname 'localhost', so the pausedSites key used below is unaffected.
// - registrableDomain('localhost') === 'localhost' (engine/constants.js
//   registrableParts: single-label hosts return the host itself), so
//   'localhost' is the correct mutedWarnings/pausedSites key throughout.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

const BASE = 'http://localhost:5599';

test('toast: Don\'t warn here mutes the kind on the site, survives reload, Undo unmutes', async ({ context }) => {
  const page = await context.newPage(); const sw = context.serviceWorkers()[0];
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE + '/clipboard-copy-button.html'); await page.click('#c');
  await page.locator('.scamshield-toast .ss-mute').click();
  await expect(page.locator('.scamshield-ack')).toContainText(/won't show this warning/);
  expect((await sw.evaluate(() => getSettings())).mutedWarnings.localhost.clipboard.via).toBe('clipboard-toast');
  await page.reload(); await page.click('#c'); await page.waitForTimeout(800); await expect(page.locator('.scamshield-toast')).toHaveCount(0);
  // Undo path:
  await sw.evaluate(() => setSettings({ mutedWarnings: {} })); await page.reload(); await page.click('#c'); await expect(page.locator('.scamshield-toast')).toBeVisible();
  await page.locator('.scamshield-toast .ss-mute').click(); await page.locator('.scamshield-ack .ss-undo').click();
  await expect.poll(async () => JSON.stringify((await sw.evaluate(() => getSettings())).mutedWarnings)).toBe('{}'); await page.close();
});

test('mute is per kind: muting clipboard does not silence the leaky-form toast', async ({ context }) => {
  const page = await context.newPage(); const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ mutedWarnings: { localhost: { clipboard: { via: 't', at: 1 } } } }));
  await page.goto(BASE + '/leaky-form.html'); await page.fill('#email', 'jane.doe@example.com');
  await expect(page.locator('.scamshield-toast')).toContainText(/before you pressed/i, { timeout: 8000 }); await page.close();
});

test('banner ✕ snooze expires: an expired pausedSites entry brings the banner back', async ({ context }) => {
  const page = await context.newPage(); const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ pausedSites: { localhost: Date.now() + 3600e3 } }));
  await page.goto(BASE_HTTPS + '/content-suspicious.html'); await page.waitForTimeout(1500); await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await sw.evaluate(() => setSettings({ pausedSites: { localhost: Date.now() - 1 } }));
  await page.reload(); await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 }); await page.close();
});

// Task 8: options.html "Muted warnings" list (#mutedlist rows + per-row
// "Warn again" button).
test('options: muted warnings list shows the row and Warn again removes it', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0]; await sw.evaluate(() => setSettings({ mutedWarnings: { 'ollama.com': { clipboard: { via: 'clipboard-toast', at: Date.now() } } } }));
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html#trusted`);
  const row = page.locator('#mutedlist li', { hasText: 'ollama.com' }); await expect(row).toContainText(/Clipboard/);
  await row.locator('button').click(); await expect.poll(async () => Object.keys((await sw.evaluate(() => getSettings())).mutedWarnings).length).toBe(0); await page.close();
});
