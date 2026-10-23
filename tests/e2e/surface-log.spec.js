// tests/e2e/surface-log.spec.js — surface logging, the "This site is fine" mistake
// action and SERP gating (0.15.0, Task 8).
const { test, openMore } = require('./fixtures');
const { expect } = require('@playwright/test');

const HOST = 'secure-paypa1-login.com';
const BANNER_URL = `http://${HOST}:5599/phishing-login.html`;

test('showing a banner appends a surfaceLog row ({ts, host, kind}) and diagnostics list it', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await sw.evaluate(() => readSurfaceLog())).filter((r) => r.kind === 'banner').length).toBe(1);
  const rows = await sw.evaluate(() => readSurfaceLog());
  const row = rows.find((r) => r.kind === 'banner');
  expect(row.host).toBe(HOST);
  expect(typeof row.ts).toBe('number');
  expect(Object.keys(row).sort()).toEqual(['host', 'kind', 'ts']);
  // threat history is a separate ring: no surfaceLog row leaks into it
  const hist = await sw.evaluate(() => chrome.storage.local.get('history'));
  expect(JSON.stringify(hist.history || [])).not.toContain('"banner"');
  const diag = await sw.evaluate(() => copyDiagnostics());
  expect(diag).toMatch(/Version: \d+\.\d+\.\d+/);
  expect(diag).toContain(HOST + ' banner');
  expect(diag).not.toMatch(/https?:|allowlist/);
  await page.close();
});

test('getSurfaceLog message returns the ring', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const ext = await sw.evaluate(() => chrome.runtime.id);
  const opt = await context.newPage(); await opt.goto(`chrome-extension://${ext}/options.html`);
  const rows = await opt.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'getSurfaceLog' }, res)));
  expect(Array.isArray(rows) && rows.some((r) => r.host === HOST && r.kind === 'banner')).toBe(true);
  await opt.close(); await page.close();
});

test('Report a mistake on a banner trusts the site with via:mistake and counts a false alarm', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('falseAlarms'));
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(350);
  await openMore(page.locator('.scamshield-banner'));
  await page.locator('.scamshield-banner .ss-report').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST)).toBe(true);
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlistMeta[HOST].via).toBe('mistake');
  await expect.poll(async () => (await sw.evaluate(() => getStats())).falseAlarms).toBe(1);
  await sw.evaluate((h) => removeTrust(h), HOST);
  await page.close();
});
