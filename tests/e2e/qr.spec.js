// tests/e2e/qr.spec.js — QR / quishing scan (0.11.0, Task P4).
// tests/e2e/pages/qr-quishing.html embeds a real QR-code PNG
// (tests/e2e/pages/qr-dangerous.png, generated with the `qrcode` npm
// package purely as a devDependency test-fixture builder — it never ships
// with the extension) encoding a URL that trips local heuristics alone
// (raw IP host + "@" in the URL + no HTTPS = ipHost + atSymbol + noHttps,
// 0.95 combined — see engine/heuristics.js), so this suite needs no feed/
// model setup. The SAME png is referenced twice: once same-origin (decodes
// cleanly) and once cross-origin from the HTTPS fixture server with no CORS
// headers (taints the canvas — the graceful-skip path).
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

async function openPopup(context, extensionId, page) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  return popup;
}

test('popup "Scan this page for QR codes": decodes the known-bad QR, renders it, and surfaces the page banner', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/qr-quishing.html');
  await page.waitForTimeout(500); // let both images finish loading
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#qrcheck')).toBeVisible();
  await popup.click('#qrcheck summary'); // <details> is collapsed by default
  await popup.click('#qrscanbtn');
  await expect(popup.locator('#qrresult')).toBeVisible({ timeout: 8000 });
  // Both <img> tags decode to the SAME URL and the tainted cross-origin copy
  // never decodes at all, so exactly one result is reported, not two.
  await expect(popup.locator('#qrsummary')).toHaveText('1 QR code found');
  await expect(popup.locator('#qrlist li')).toHaveCount(1);
  await expect(popup.locator('#qrlist li .chip')).toHaveText('Dangerous page');
  await expect(popup.locator('#qrlist li')).toContainText('203.0.113.7');
  // The content script reuses the EXISTING banner for a dangerous decoded
  // destination — never a new UI surface.
  const banner = page.locator('.scamshield-banner.danger');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner).toContainText(/QR code/i);
  await expect(banner).toContainText('203.0.113.7');
  // The page ITSELF (qr-quishing.html, served locally over plain http) is
  // not what's dangerous — the interstitial (reserved for the page you are
  // actually on) must never fire off a QR-decoded destination.
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
});

test('QR auto-scan (default-on toggle) surfaces the same dangerous destination with no popup interaction', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/qr-quishing.html');
  const banner = page.locator('.scamshield-banner.danger');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner).toContainText(/QR code/i);
});

test('auto-scan respects its settings toggle: off means no banner from the page alone', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ qrAutoScan: false }));
  const page = await context.newPage();
  await page.goto(BASE + '/qr-quishing.html');
  await page.waitForTimeout(2000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await sw.evaluate(() => setSettings({ qrAutoScan: true })); // restore for any later test in this worker
});

test('a cross-origin, CORS-less copy of the QR image taints the canvas and is skipped gracefully — the scan still completes with no page crash', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE + '/qr-quishing.html');
  await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await popup.click('#qrcheck summary'); // <details> is collapsed by default
  await popup.click('#qrscanbtn');
  await expect(popup.locator('#qrresult')).toBeVisible({ timeout: 8000 });
  // The tainted image's SecurityError never propagates as an uncaught page
  // error, and the scan still finishes and reports the one image it COULD
  // read (never hangs, never silently reports nothing at all).
  expect(pageErrors).toEqual([]);
  await expect(popup.locator('#qrsummary')).toHaveText('1 QR code found');
});
