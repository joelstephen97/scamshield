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

test('"This site is fine" on a banner counts a false alarm, then allowlists after a trusted click, with Undo', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('falseAlarms'));
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(350);
  await openMore(page.locator('.scamshield-banner'));
  await expect(page.locator('.scamshield-banner .ss-report')).toHaveText('This site is fine');
  await page.locator('.scamshield-banner .ss-report').click();
  await expect.poll(async () => (await sw.evaluate(() => getStats())).falseAlarms).toBe(1);
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(true);
  expect(((await sw.evaluate(() => getSettings())).allowlistMeta || {})[HOST].via).toBe('mistake');
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-ack')).toContainText(/won't flag/i);
  // Undo reverses it and re-opens the banner.
  await page.locator('.scamshield-ack .ss-undo').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(false);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible();
  await page.close();
});

test('a page-script click() on the mistake control neither allowlists nor counts', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('falseAlarms'));
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(350);
  await openMore(page.locator('.scamshield-banner'));
  const synth = () => page.evaluate(() => {
    const b = document.querySelector('scamshield-surface[data-kind=banner]').shadowRoot.querySelector('.ss-report');
    b.click(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await synth();
  await page.waitForTimeout(800);
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlist).not.toContain(HOST);
  expect((await sw.evaluate(() => getStats())).falseAlarms).toBe(0);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible();
  // Positive canary: the same control, clicked for real, does work.
  await page.locator('.scamshield-banner .ss-report').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(true);
  await page.close();
});
