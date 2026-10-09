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
  // simulate the update hook (otaUrl '' → official feed, 0.3.1 → current) —
  // through the SW's own chained setter, NOT a raw storage.local.set: the SW's boot-time
  // writers (e.g. runFeedUpdate's lastFeedAt) serialize on that chain, and a
  // raw write can be silently clobbered by a chained read-modify-write that
  // straddles it (lost update, showed up as flake under full-suite load).
  await sw.evaluate(() => applyInstallMigrations({ reason: 'update', previousVersion: '0.3.1' }));
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlist).toEqual(['trusted-shop.example']); expect(s.threatsBlocked).toBe(7);
  await expect.poll(() => sw.evaluate(() => getSettings().then((x) => x.otaUrl)), { timeout: 5000 }).toContain('scamshield-feed');
  expect(s.pageAnalysis).toBe(true); expect(s.theme).toBe('auto'); expect(s.pausedSites).toEqual({}); expect(s.reportingOptIn).toBe(false);
  // 0.6.0 keys arrive with safe defaults on an upgraded profile, old keys intact.
  expect(s.clickFixGuard).toBe(true); expect(s.fakeUpdateGuard).toBe(true); expect(s.walletGuard).toBe(true);
  expect(s.techScamGuard).toBe(true); expect(s.clipboardGuard).toBe(true); expect(s.strictMode).toBe(false);
  expect(s.leakyFormGuard).toBe(true); expect(s.fingerprintDetect).toBe(true); expect(s.notificationGuard).toBe(true);
  expect(s.shopGuard).toBe(true); expect(s.serpCheck).toBe(true); expect(s.syncEnabled).toBe(false);
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#tile-since b')).toHaveText('7'); await expect(popup.locator('#hist li')).toHaveCount(1);
  const opts = await context.newPage(); await opts.goto(`chrome-extension://${extensionId}/options.html#trusted`);
  await expect(opts.locator('#allowlist')).toContainText('trusted-shop.example');
  // allowlisted host stays silent on a scammy page (host resolves to the fixture server)
  const page = await context.newPage(); await page.goto('http://amazon.ae:5599/lookalike.html'); await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

// 0.14.1: clearing Settings → Threat feed → feed URL is an opt-out of every
// remote list. Updates must not restore it, and nothing may be fetched.
test('a cleared feed URL survives an update and no feed request is made', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => { await setSettings({ otaUrl: '' }); });
  await new Promise((r) => setTimeout(r, 1000)); // let boot-time jobs started before the clear settle
  await sw.evaluate(() => applyInstallMigrations({ reason: 'update', previousVersion: '0.14.0' }));
  expect(await sw.evaluate(() => getSettings().then((x) => x.otaUrl))).toBe('');

  const out = await sw.evaluate(async (feedBase) => {
    const urls = [];
    const real = globalThis.fetch;
    globalThis.fetch = (u, ...a) => { urls.push(String(u && u.url ? u.url : u)); return real(u, ...a); };
    try {
      const feed = await runFeedUpdate();                      // default meta URL
      const feedExplicit = await runFeedUpdate(feedBase + 'meta.json'); // manual / test override
      const hot = await runHotUpdate();
      const ota = await runOtaUpdate();
      const shard = await fetchExactShardEntries({ cdn: feedBase, fallback: feedBase }, 123456);
      return { urls, feed, feedExplicit, hot, ota, shard };
    } finally { globalThis.fetch = real; }
  }, 'http://localhost:5599/feed/');
  expect(out.urls).toEqual([]);
  expect(out.feed).toEqual({ ok: false, reason: 'no-url' });
  expect(out.feedExplicit).toEqual({ ok: false, reason: 'no-url' });
  expect(out.hot.reason).toBe('no-url');
  expect(out.ota).toEqual({ ok: false, reason: 'no-url' });
  expect(out.shard).toBeNull();
  // And the stored value is still empty after all of that.
  expect(await sw.evaluate(() => getSettings().then((x) => x.otaUrl))).toBe('');
});

test('positive control: with a feed URL set the same calls DO fetch (the zero above is meaningful)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => { await setSettings({ otaUrl: DEFAULT_FEED_URL }); });
  const urls = await sw.evaluate(async (feedBase) => {
    const seen = [];
    const real = globalThis.fetch;
    globalThis.fetch = (u, ...a) => { seen.push(String(u && u.url ? u.url : u)); return real(u, ...a); };
    try { await fetchExactShardEntries({ cdn: feedBase, fallback: feedBase }, 123456); } finally { globalThis.fetch = real; }
    return seen;
  }, 'http://localhost:5599/feed/');
  expect(urls.length).toBeGreaterThan(0);
});

test('an update from 0.14.0 keeps a non-empty custom feed URL; from 0.3.1 an empty one migrates', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => { await setSettings({ otaUrl: 'https://example.org/my-feed.json' }); });
  await sw.evaluate(() => applyInstallMigrations({ reason: 'update', previousVersion: '0.14.0' }));
  expect(await sw.evaluate(() => getSettings().then((x) => x.otaUrl))).toBe('https://example.org/my-feed.json');
  await sw.evaluate(async () => { await setSettings({ otaUrl: '' }); });
  await sw.evaluate(() => applyInstallMigrations({ reason: 'update', previousVersion: '0.3.1' }));
  expect(await sw.evaluate(() => getSettings().then((x) => x.otaUrl))).toContain('scamshield-feed');
});
