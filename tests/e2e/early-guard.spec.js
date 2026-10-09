// tests/e2e/early-guard.spec.js — submit guards must not wait for the SW
// round-trips (0.14.1, Task 8). The SW's feed lookup is made artificially slow
// (Blockstore.get delayed 3 s via sw.evaluate), standing in for a cold/slow
// service worker; a trusted click ~250 ms after load must still hit the guard overlay, long
// before the verdict (and its banner) exists.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

test('off-domain password submit within 300ms of load is guarded while SW lookups are slow', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => {
    const bs = globalThis.Blockstore; const orig = bs.get.bind(bs);
    globalThis.__origBsGet = bs.get;
    bs.get = async (...a) => { await new Promise((r) => setTimeout(r, 3000)); return orig(...a); };
  });
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await page.fill('input[name="pw"]', 'secret');
  await page.waitForTimeout(250);
  // The verdict has not landed yet (that is the point of the fixture).
  expect(await page.locator('.scamshield-banner').count()).toBe(0);
  await page.click('button[type="submit"]');
  await expect(page.locator('.scamshield-overlay')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.scamshield-overlay h3')).toContainText('phishing');
  await sw.evaluate(() => { globalThis.Blockstore.get = globalThis.__origBsGet; });
});

test('guard attaches once and picks up the final verdict reasons after SPA re-run', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  // Force a SPA-style re-run: clearAll + run() again on the same form.
  await page.evaluate(() => { history.pushState({}, '', '/phishing-login.html?x=1'); window.dispatchEvent(new Event('scamshield:navigate')); });
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.fill('input[name="pw"]', 'secret');
  await page.click('button[type="submit"]');
  await expect(page.locator('.scamshield-overlay')).toHaveCount(1);
  await expect(page.locator('.scamshield-overlay .ss-evidence li')).not.toHaveCount(0);
});
