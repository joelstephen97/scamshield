// tests/e2e/onboarding.spec.js — the three-step welcome, the bundled demo warning, and the static goodbye page
// (0.15.0, Task 19). Extension pages and the local goodbye.html only; no live sites.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');
const GOODBYE = pathToFileURL(path.join(__dirname, '..', '..', 'goodbye.html')).href;

test('onboarding: three steps, honest permission paragraph, no region-specific copy', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.locator('h1')).toContainText('protecting');
  await expect(page.locator('#count')).toHaveText('Step 1 of 3');
  await expect(page.locator('#s1')).toBeVisible();
  await expect(page.locator('#s2')).toBeHidden();
  await expect(page.locator('#demo')).toHaveAttribute('href', 'demo.html');
  await page.locator('#s1 [data-go="2"]').click();
  await expect(page.locator('#count')).toHaveText('Step 2 of 3');
  await expect(page.locator('#s2h')).toBeFocused(); // focus follows the step
  const why = await page.locator('#s2').innerText();
  expect(why).toMatch(/read and change all your data/i);
  expect(why).toMatch(/runs on your device/i);
  expect(why).toMatch(/nothing leaves your browser unless you choose/i);
  await page.locator('#s2 [data-go="3"]').click();
  await expect(page.locator('#count')).toHaveText('Step 3 of 3');
  await expect(page.locator('#s3')).toContainText('puzzle-piece');
  await expect(page.locator('#s3 a.btn.primary')).toHaveAttribute('href', 'options.html');
  expect(await page.locator('body').innerText()).not.toMatch(/UAE|bank|Emirates/i);
  await page.locator('#s3 [data-go="2"]').click();
  await expect(page.locator('#count')).toHaveText('Step 2 of 3');
  // Deep link: demo.html returns to onboarding.html#2.
  await page.goto(`chrome-extension://${extensionId}/onboarding.html#2`);
  await expect(page.locator('#s2')).toBeVisible();
});

test('onboarding in Arabic: translated, rtl, steps still work', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ uiLang: 'ar' }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#s1h')).toHaveText('شاهده وهو يعمل');
  await expect(page.locator('#count')).toHaveText('الخطوة 1 من 3');
  await sw.evaluate(() => setSettings({ uiLang: 'auto' }));
});

test('demo: renders the real banner and stop page over a PayPa1 look-alike, labelled, and never navigates anywhere real', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/demo.html`);
  await expect(page.locator('h1')).toHaveText('This is what a warning looks like');
  await expect(page.locator('.fake .logo')).toHaveText('PayPa1');
  const banner = page.locator('.scamshield-banner.danger');
  await expect(banner).toBeVisible();
  // The card sits below the label strip, not on top of it.
  const strip = await page.locator('#strip').boundingBox();
  const bb = await banner.boundingBox();
  expect(bb.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  // No Trust control and no Copy button (nothing in the demo stores or copies a thing).
  await expect(page.locator('.scamshield-banner .ss-trust')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner .ss-copy')).toHaveCount(0);
  // The "real site" comparison uses the fake host, not the extension's own address.
  await expect(page.locator('.scamshield-banner .ss-cmp-fake b')).toHaveText('paypa1-secure-login.example');
  await page.click('#tabStop');
  const stop = page.locator('.scamshield-interstitial');
  await expect(stop).toBeVisible();
  await expect(page.locator('.scamshield-interstitial .ss-demo-tag')).toHaveText('This is what a warning looks like');
  await expect(page.locator('.scamshield-interstitial .ss-addr code')).toHaveText('https://paypa1-secure-login.example/signin');
  // "Continue anyway" only returns to the banner view; it stores no pause.
  const sw = context.serviceWorkers()[0];
  const before = await sw.evaluate(() => getSettings().then((s) => JSON.stringify(s.pausedSites || {})));
  await page.locator('.scamshield-interstitial .ss-details summary').click();
  const cont = page.locator('.scamshield-interstitial .ss-danger-ghost');
  await expect(cont).toBeEnabled({ timeout: 6000 });
  await cont.click();
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible();
  expect(await sw.evaluate(() => getSettings().then((s) => JSON.stringify(s.pausedSites || {})))).toBe(before);
  // "Leave this page" goes back to onboarding step 2.
  await page.locator('.scamshield-banner .ss-leave').click();
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/onboarding.html#2`);
  expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]); // not one network request from the demo
});

test('demo: stop page "Leave this page" also returns to onboarding', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/demo.html`);
  await page.click('#tabStop');
  await page.locator('.scamshield-interstitial .ss-primary').click();
  await expect(page).toHaveURL(/onboarding\.html#2$/);
});

test('goodbye: reason picker copies a note, shows the issue link, sends nothing; ar is rtl; English fallback', async ({ context }) => {
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith('file:')) requests.push(r.url()); });
  await page.goto(GOODBYE + '?v=0.15.0');
  await expect(page.locator('#versionLine')).toHaveText('ScamShield 0.15.0 has been uninstalled.');
  await expect(page.locator('#reasons button')).toHaveCount(5);
  await expect(page.locator('#resultBox')).toBeHidden();
  await page.locator('#reasons button').nth(0).click();
  await expect(page.locator('#note')).toHaveText('ScamShield uninstall reason: too many warnings, version 0.15.0');
  await expect(page.locator('#reasons button').nth(0)).toHaveAttribute('aria-pressed', 'true');
  const href = await page.locator('#issue').getAttribute('href');
  expect(href).toContain('github.com/joelstephen97/scamshield/issues/new');
  expect(decodeURIComponent(href)).toContain('ScamShield uninstall reason: too many warnings, version 0.15.0');
  await page.locator('#reasons button').nth(4).click();
  await expect(page.locator('#note')).toHaveText('ScamShield uninstall reason: other, version 0.15.0');
  await expect(page.locator('#reasons button').nth(0)).toHaveAttribute('aria-pressed', 'false');
  expect(requests).toEqual([]);
  // No ?v=: the plain wording.
  await page.goto(GOODBYE);
  await expect(page.locator('#versionLine')).toHaveText('ScamShield has been uninstalled.');
  await page.locator('#reasons button').nth(2).click();
  await expect(page.locator('#note')).toHaveText('ScamShield uninstall reason: it was slow, version unknown');
  // Arabic: translated and rtl; the note stays English and left-to-right.
  await page.goto(GOODBYE + '?v=0.15.0&lang=ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('h1')).toHaveText('يؤسفنا رحيلك');
  await expect(page.locator('#versionLine')).toHaveText('تم إلغاء تثبيت ScamShield 0.15.0.');
  await page.locator('#reasons button').nth(1).click();
  await expect(page.locator('#note')).toHaveText('ScamShield uninstall reason: it broke a site, version 0.15.0');
  // An unknown language falls back to English; pt-PT maps to pt-BR.
  await page.goto(GOODBYE + '?lang=xx');
  await expect(page.locator('h1')).toHaveText('Sorry to see you go');
  await page.goto(GOODBYE + '?lang=pt-PT');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});
