const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
test('options: tabs render, toggles persist, theme override applies, feed status shows', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('nav a.cur')).toHaveText(/Protection/);
  await expect(page.locator('#pageanalysis')).toBeChecked();
  await page.click('label[for="pageanalysis"]'); await expect(page.locator('#status')).toHaveText(/Saved/);
  await page.reload(); await expect(page.locator('#pageanalysis')).not.toBeChecked();
  await page.click('label[for="pageanalysis"]');
  await page.click('nav a[data-tab="about"]'); await page.selectOption('#theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('nav a[data-tab="feed"]'); await expect(page.locator('#feedstatus')).toContainText(/rules|Never updated|updated/);
  await page.click('nav a[data-tab="trusted"]'); await expect(page.locator('#allowlist')).toBeVisible();
});
test('options: report toggle shows the disclosure and the "what is sent" expander', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('#report')).not.toBeChecked();
  await page.click('#whatsent'); await expect(page.locator('#whatsentbody')).toBeVisible();
  await expect(page.locator('#whatsentbody')).toContainText(/never the full address/i);
});
test('options: grouped feature toggles persist and gate a guard', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html`);
  // New per-feature toggles are present and default on.
  for (const id of ['clickfix', 'fakeupdate', 'techscam', 'clipboard', 'wallet']) {
    await expect(page.locator('#' + id)).toBeChecked();
  }
  await expect(page.locator('#strict')).not.toBeChecked();
  // Turning off the ClickFix guard stops the interstitial on the fixture page.
  await page.click('label[for="clickfix"]'); await expect(page.locator('#status')).toHaveText(/Saved/);
  const victim = await context.newPage();
  await victim.goto('http://localhost:5599/clickfix.html');
  await victim.waitForTimeout(1200);
  await expect(victim.locator('.scamshield-interstitial')).toHaveCount(0);
  // Re-enable so later tests are unaffected.
  await page.bringToFront(); await page.click('label[for="clickfix"]');
});

test('options: strict mode blocks a merely-suspicious page with the interstitial', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ strictMode: true }));
  const page = await context.newPage();
  await page.goto('http://localhost:5599/content-suspicious.html');
  // A page that would normally get a suspicious banner is upgraded to a
  // full-screen blocking interstitial in strict mode.
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
  await sw.evaluate(() => setSettings({ strictMode: false }));
});

test('options: export produces a settings file and import applies it', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ walletGuard: false, allowlist: ['exported-trust.example'] }));
  const data = await sw.evaluate(async () => exportSettings(await getSettings()));
  expect(data.app).toBe('scamshield');
  expect(data.settings.walletGuard).toBe(false);
  expect(data.settings.allowlist).toContain('exported-trust.example');
  await sw.evaluate(() => setSettings({ walletGuard: true, allowlist: [] }));
  await sw.evaluate((d) => setSettings(sanitizeImport(d)), data);
  const after = await sw.evaluate(() => getSettings());
  expect(after.walletGuard).toBe(false);
  expect(after.allowlist).toContain('exported-trust.example');
  await sw.evaluate(() => setSettings({ walletGuard: true, allowlist: [] }));
});

test('options: import rejects a malformed file', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const patch = await sw.evaluate(() => sanitizeImport({ nonsense: true }));
  expect(patch).toBe(null);
});

test('onboarding renders', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.locator('h1')).toContainText('protecting');
});
test('options: history "Mark as mistake" opens a GitHub issue when reporting is opted out', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ history: [{ ts: Date.now(), host: 'old-scam.example', kind: 'page', level: 'dangerous' }] }));
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html#history`);
  const [issuePage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#history li button').first().click()
  ]);
  await expect(page.locator('#status')).toHaveText(/Opened a report/);
  await issuePage.waitForLoadState('domcontentloaded').catch(() => {});
  const url = decodeURIComponent(issuePage.url());
  expect(url).toContain('joelstephen97/parry/issues/new');
  expect(url).toContain('old-scam.example');
});
