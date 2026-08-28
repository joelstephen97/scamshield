const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

// The SW-side half of the 0.7.0 statistics data layer: the counters only ever
// move from real scans, so they are checked here rather than in unit tests.
// Each test gets its own persistent context (fixtures.js), so storage starts empty.
const readStats = (sw) => sw.evaluate(() => getStats());
const todayKey = () => new Date().toISOString().slice(0, 10);

test('scanning a safe page and a dangerous page fills the local stats', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const safe = await context.newPage();
  await safe.goto(BASE + '/clean.html');
  await safe.waitForTimeout(800);
  const bad = await context.newPage();
  await bad.goto(BASE + '/phishing-login.html');
  await expect(bad.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await bad.waitForTimeout(500);

  const stats = await readStats(sw);
  expect(stats.pagesCheckedTotal).toBeGreaterThanOrEqual(2);
  expect(stats.threatsBlocked).toBeGreaterThanOrEqual(1);

  const today = stats.statsDaily.find((b) => b.d === todayKey());
  expect(today, `no bucket for ${todayKey()} in ${JSON.stringify(stats.statsDaily)}`).toBeTruthy();
  expect(today.checked).toBeGreaterThanOrEqual(2);
  expect(today.threats).toBeGreaterThanOrEqual(1);

  // The block is attributed to a category (a credential form posting off-domain
  // is phishing), and the categories sum to the ring's threat count.
  const types = Object.entries(stats.threatsByType);
  expect(types.some(([, n]) => n > 0)).toBe(true);
  expect(stats.threatsByType.phishing).toBeGreaterThanOrEqual(1);
  expect(types.reduce((a, [, n]) => a + n, 0)).toBe(today.threats);

  // "Protecting you since" — set on install/boot, a plausible epoch, not future.
  expect(stats.installedAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
  expect(stats.installedAt).toBeLessThanOrEqual(Date.now() + 60000);
  // Feed size falls back to the bundled ruleset before the first OTA.
  expect(stats.feedRuleCount).toBeGreaterThan(0);
});

test('a ClickFix block is filed under the clickfix category, not the generic detector kind', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clickfix.html');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
  const stats = await readStats(sw);
  expect(stats.threatsByType.clickfix).toBeGreaterThanOrEqual(1);
  expect(stats.threatsByType.clipboard || 0).toBe(0);
});

test('stats live in storage.local only — never in settings or sync', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html');
  await page.waitForTimeout(800);
  const s = await sw.evaluate(() => getSettings());
  for (const k of ['statsDaily', 'pagesCheckedTotal', 'threatsByType', 'installedAt']) {
    expect(s[k], `${k} leaked into the settings object`).toBeUndefined();
  }
  const exported = await sw.evaluate(async () => exportSettings(await getSettings()));
  for (const k of ['statsDaily', 'pagesCheckedTotal', 'threatsByType', 'installedAt']) {
    expect(exported.settings[k], `${k} leaked into the export/sync payload`).toBeUndefined();
  }
});

test('a page with privacy findings counts once, however many findings it has', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/fingerprint.html');
  await page.waitForTimeout(1500);
  const stats = await readStats(sw);
  const today = stats.statsDaily.find((b) => b.d === todayKey());
  expect(today).toBeTruthy();
  expect(today.privacy).toBe(1);
});
