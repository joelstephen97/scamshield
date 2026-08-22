const { test, EXTENSION_PATH, BASE_HTTPS } = require('./fixtures');
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

test('safe-domain host suppresses warnings even on scammy content', async ({ context }) => {
  const page = await context.newPage();
  // amazon.ae resolves to the local fixtures server (see fixtures.js);
  // lookalike.html carries scam phrases that would otherwise warn.
  await page.goto('http://amazon.ae:5599/lookalike.html');
  await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-overlay')).toHaveCount(0);
});

test('SSO form posting to a known auth provider shows no banner and no submit modal', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/sso-login.html');
  await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner.danger')).toHaveCount(0);
  await page.fill('input[name="pw"]', 'secret');
  await page.click('button[type="submit"]');
  await expect(page.locator('.scamshield-overlay')).toHaveCount(0);
  // the form actually submits (navigates to the auth provider)
  await page.waitForURL(/accounts\.google\.com:5599\/clean\.html/, { timeout: 5000 });
});

test('popup message checker flags a scam text on-device', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.click('#msgcheck summary');
  await popup.fill('#msgtext', 'Your account will be blocked today. Share your OTP to verify: http://verify-bank-login.tk/otp');
  await popup.click('#msgbtn');
  await expect(popup.locator('#msgstatus')).toHaveClass(/dangerous/);
  await popup.fill('#msgtext', 'Team lunch tomorrow at 1pm, bring the slides please.');
  await popup.click('#msgbtn');
  await expect(popup.locator('#msgstatus')).toHaveClass(/safe/);
});

// Served over HTTPS (tests/e2e/server.js :5600, self-signed test-only cert in
// tests/e2e/certs) on a realistic-looking hostname — the URL model is heavily
// weighted on `is_https` (its training negatives are ~all HTTPS, positives ~all
// HTTP), so http://localhost fixtures score ~0.999 "phishing" regardless of
// content, which previously made this un-testable over plain HTTP (see task-12
// fix-round-1 report). Measured for this exact URL: urlRules.score=0.10 (host
// entropy heuristic), URL model prob=0.03, content-model prob=0.38 — all well
// under their thresholds, so the fused verdict stays "safe".
test('ordinary login page stays quiet with page analysis on', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://shop.contoso-fixture.com:5600/clean-login.html');
  await page.waitForTimeout(1500);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});
// Same HTTPS fix, on plain https://localhost:5600 this time (no need for a
// realistic hostname here — the point is the content model's own signal, not
// the URL heuristics). Measured: urlRules.score=0, URL model prob=0.20 (well
// under the 0.7 corroboration bar), domRules.score=0 (no scam-phrase/brand/
// foreign-form hits), content-model prob=0.976 (fixture wording tuned per the
// task-12 fix-round-1 report — well above the 0.80 gate). With no corroboration
// available, engine/verdict.js caps the content signal at THRESHOLDS.suspicious,
// so the fused verdict is "suspicious", never "dangerous".
test('phishy wording with no URL/rule hits → suspicious (yellow), never red', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/content-suspicious.html');
  await expect(page.locator('.scamshield-banner.suspicious')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-banner.danger')).toHaveCount(0);
});
test('brand icon + password form on a non-brand host → danger banner with rescue link', async ({ context, extensionId }) => {
  // Inject a test brand table whose only hash is our fixture icon's hash.
  const sw = context.serviceWorkers()[0];
  await sw.evaluate((h) => { globalThis.ScamShield.BRAND_ICONS = { version: 1, brands: [{ key: 'paypal', hashes: [h] }] }; globalThis.__iconCache && globalThis.__iconCache.clear(); }, process.env.SS_TEST_ICON_HASH || '1818181818181818');
  const page = await context.newPage();
  await page.goto(BASE + '/visual-brand.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-banner .ss-rescue')).toBeVisible();
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
