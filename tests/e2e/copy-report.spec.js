// tests/e2e/copy-report.spec.js — "Copy report" (0.10.0, Task C4): a
// Privacy-Badger-style Share button offered only on a dangerous/suspicious
// verdict, in the in-page banner/interstitial and the popup why-panel.
//
// Headless Chromium's real clipboard is not reliably readable/writable
// under the Permissions API in CI sandboxes, so — per the task brief — these
// specs assert the exact composed text via a debug hook
// (window.__ssLastCopyReport, set unconditionally right before the actual
// clipboard write, same pattern as content_script.js's existing
// window.__ssLastVerdict hook) instead of reading the OS clipboard back.
// The toast/visual side is still asserted for real: execCommand('copy')'s
// fallback path is reliable enough headless that the success toast should
// still render.
const { test, EXTENSION_PATH, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

// secure-paypa1-login.com is mapped to the local fixtures server (see
// fixtures.js's --host-resolver-rules) and is never used by another spec, so
// it's a safe pick here purely because its hostname HAS a dot — exercising
// the "defang the last dot" behaviour that plain "localhost" (no dot) can't.
const PAYPAL_LOOKALIKE = 'http://secure-paypa1-login.com:5599/phishing-login.html';

test('Copy report on a dangerous banner composes and copies a shareable, defanged summary', async ({ context }) => {
  const page = await context.newPage();
  // Attach CDP before navigating to capture the extension's isolated-world
  // execution context — window.__ssLastCopyReport lives there (same
  // approach as detection.spec.js's window.__ssLastVerdict read).
  const cdp = await context.newCDPSession(page);
  const execContexts = [];
  cdp.on('Runtime.executionContextCreated', (e) => execContexts.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto(PAYPAL_LOOKALIKE);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const copyBtn = page.locator('.scamshield-banner .ss-copy');
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(page.locator('.scamshield-toast.ok')).toBeVisible({ timeout: 4000 });

  const extCtx = execContexts.find((c) => c.auxData && c.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(c.origin || ''));
  expect(extCtx).toBeTruthy();
  const text = await cdp.send('Runtime.evaluate', {
    expression: 'window.__ssLastCopyReport',
    contextId: extCtx.id, returnByValue: true
  }).then((r) => r.result.value);

  expect(text).toContain('secure-paypa1-login[.]com'); // defanged, not a live link
  expect(text).not.toContain('secure-paypa1-login.com/'); // the real (undefanged) host never appears
  expect(text).toMatch(/^⚠ ScamShield flagged this site:/);
  expect(text).toContain('Verdict: Dangerous page');
  expect(text).toContain('Signals:');
  expect(text).toContain('Checked on-device by ScamShield');
  expect(text).toContain('https://joelstephen97.github.io/scamshield/');
  const bulletLines = text.split('\n').filter((l) => l.startsWith('- '));
  expect(bulletLines.length).toBeGreaterThan(0);
  expect(bulletLines.length).toBeLessThanOrEqual(4);
});

test('Copy report also appears on a suspicious banner', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/content-suspicious.html');
  await expect(page.locator('.scamshield-banner.suspicious')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-banner .ss-copy')).toBeVisible();
});

test('Copy report also appears on the blocking interstitial', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/seed-phrase.html');
  const inter = page.locator('.scamshield-interstitial');
  await expect(inter).toBeVisible({ timeout: 8000 });
  await expect(inter.locator('.ss-copy')).toBeVisible();
});

test('Copy report is absent on a clean page', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html');
  await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.ss-copy')).toHaveCount(0);
});

test('popup why-panel: Copy report appears on a dangerous verdict and copies the summary', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(PAYPAL_LOOKALIKE);
  await page.waitForTimeout(800);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  await expect(popup.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  await expect(popup.locator('#whypanel')).toHaveJSProperty('open', true);
  const copyBtn = popup.locator('#copyreport');
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(popup.locator('#toast')).toHaveClass(/show/);

  const text = await popup.evaluate(() => window.__ssLastCopyReport);
  expect(text).toContain('secure-paypa1-login[.]com');
  expect(text).toContain('Verdict: Dangerous page');
  expect(text).toContain('Signals:');
  expect(text).toContain('Checked on-device by ScamShield');
});

test('popup why-panel: Copy report is hidden on a safe verdict', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  await expect(popup.locator('#status')).toHaveClass(/safe/, { timeout: 5000 });
  await expect(popup.locator('#copyreport')).toBeHidden();
});
