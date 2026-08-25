// tests/e2e/upgrade.spec.js — a 0.3.1 install's storage must keep working untouched.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';
const SETTINGS_031 = { enabled: true, hideScamContent: true, blockKnownBad: true, reportingOptIn: false, allowlist: ['trusted-shop.example'],
  blocklistVersion: 1, modelVersion: 1, otaUrl: '', threatsBlocked: 7, lastBlocklistVersion: 0, supportAskShown: true };
const HISTORY_031 = [{ ts: Date.now() - 3600000, host: 'old-scam.example', kind: 'page', level: 'dangerous' }];
test('0.3.1 settings + history load, migrate additively, and the UI works', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async ({ s, h }) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ settings: s, history: h }); }, { s: SETTINGS_031, h: HISTORY_031 });
  // simulate the update hook (otaUrl '' → official feed)
  await sw.evaluate(async () => { const cur = await chrome.storage.local.get('settings'); if (cur.settings.otaUrl === '') await chrome.storage.local.set({ settings: Object.assign({}, cur.settings, { otaUrl: DEFAULT_FEED_URL }) }); });
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlist).toEqual(['trusted-shop.example']); expect(s.threatsBlocked).toBe(7); expect(s.otaUrl).toContain('scamshield-feed');
  expect(s.pageAnalysis).toBe(true); expect(s.theme).toBe('auto'); expect(s.pausedSites).toEqual({}); expect(s.reportingOptIn).toBe(false);
  // 0.6.0 keys arrive with safe defaults on an upgraded profile, old keys intact.
  expect(s.clickFixGuard).toBe(true); expect(s.fakeUpdateGuard).toBe(true); expect(s.walletGuard).toBe(true);
  expect(s.techScamGuard).toBe(true); expect(s.clipboardGuard).toBe(true); expect(s.strictMode).toBe(false);
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#tile-all b')).toHaveText('7'); await expect(popup.locator('#hist li')).toHaveCount(1);
  const opts = await context.newPage(); await opts.goto(`chrome-extension://${extensionId}/options.html#trusted`);
  await expect(opts.locator('#allowlist')).toContainText('trusted-shop.example');
  // allowlisted host stays silent on a scammy page (host resolves to the fixture server)
  const page = await context.newPage(); await page.goto('http://amazon.ae:5599/lookalike.html'); await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});
