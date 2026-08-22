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
  expect(url).toContain('joelstephen97/scamshield/issues/new');
  expect(url).toContain('old-scam.example');
});
