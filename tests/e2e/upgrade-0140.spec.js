// tests/e2e/upgrade-0140.spec.js — a real 0.14.0 profile updating to 0.14.1.
// Seeds storage the way 0.14.0 left it, fires the update path
// (applyInstallMigrations with previousVersion 0.14.0, the same mechanism as
// upgrade.spec.js) plus the boot re-apply (syncAllowRules / applyHotRules read
// everything back from storage, exactly what a restarted worker does), then
// checks that nothing the user chose was undone.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

const HOUR = 3600000;

test('0.14.0 profile -> 0.14.1: cleared feed stays cleared, platform trust is not a rule, pauses/mutes/hot list intact', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  const futureMs = Date.now() + 5 * HOUR;
  const seed = {
    settings: {
      enabled: true, blockKnownBad: true, hotListEnabled: true, otaUrl: '',
      allowlist: ['pages.dev', 'example.com'],
      allowlistMeta: { 'pages.dev': { via: 'banner', at: 1760000000000 }, 'example.com': { via: 'options', at: 1760000001000 } },
      pausedSites: { 'foo.com': futureMs },
      // 0.14.0 shape: domain -> kind -> { via, at }
      mutedWarnings: { 'bar.com': { clipboard: { via: 'toast', at: 1760000002000 } } }
    },
    reviewAsk: { shown: 1, dismissed: 0, lastShownAt: 1760000003000, state: 'later' },
    // Stored 7 h ago with the old 360-min TTL: stale by the old rules, inside the 48 h window.
    hotList: {
      v: 1, generatedAt: Date.now() - 7 * HOUR, ttlMinutes: 360,
      domains: [{ h: 'hot-upgrade.example', s: 'pd', t: Math.floor(Date.now() / 60000) - 60 }], paths: [], removed: []
    }
  };
  await sw.evaluate(async (s) => { await chrome.storage.local.clear(); await chrome.storage.local.set(s); }, seed);

  // Count every network request the update path makes from here on.
  await sw.evaluate(() => {
    globalThis.__fetched = [];
    if (!globalThis.__realFetch) globalThis.__realFetch = globalThis.fetch;
    globalThis.fetch = (u, ...a) => { globalThis.__fetched.push(String(u && u.url ? u.url : u)); return globalThis.__realFetch(u, ...a); };
  });
  let rulesAfterUpdate;
  try {
    await sw.evaluate(async () => {
      await applyInstallMigrations({ reason: 'update', previousVersion: '0.14.0' });
      await syncAllowRules();                     // boot re-apply, read from storage
      await applyHotRules(undefined);
    });
    rulesAfterUpdate = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    // The boot top-up jobs must not have fetched anything either (feed URL is empty).
    await sw.evaluate(() => Promise.all([runFeedUpdate(), runHotUpdate(), runOtaUpdate()]));
    expect(await sw.evaluate(() => globalThis.__fetched)).toEqual([]);
  } finally {
    await sw.evaluate(() => { if (globalThis.__realFetch) globalThis.fetch = globalThis.__realFetch; });
  }

  const s = await sw.evaluate(() => getSettings());
  expect(s.otaUrl).toBe('');
  expect(s.allowlist).toEqual(['pages.dev', 'example.com']);   // kept (legacy entry is badged, not deleted)
  expect(s.allowlistMeta['pages.dev'].via).toBe('banner');
  expect(s.pausedSites).toEqual({ 'foo.com': futureMs });
  expect(s.mutedWarnings).toEqual({ 'bar.com': { clipboard: { via: 'toast', at: 1760000002000 } } });
  expect(s.enabled).toBe(true);
  expect((await sw.evaluate(() => chrome.storage.local.get('reviewAsk'))).reviewAsk.state).toBe('later');

  const rules = rulesAfterUpdate; // snapshot before the top-up jobs: with an empty feed URL runHotUpdate deliberately tears the hot ranges down
  const allow = rules.filter((r) => r.action.type === 'allow').map((r) => r.condition.urlFilter);
  expect(allow).toContain('||example.com^');
  expect(allow).toContain('||foo.com^');
  expect(allow).not.toContain('||pages.dev^');                 // a platform is never covered by an allow rule

  // The 7 h-old, 360-min-TTL hot list is still enforced (stale-while-revalidate, 48 h cap).
  const hotDomains = rules.flatMap((r) => r.condition.requestDomains || []);
  expect(hotDomains).toContain('hot-upgrade.example');
});
