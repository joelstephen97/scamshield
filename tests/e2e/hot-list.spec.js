// tests/e2e/hot-list.spec.js — the hourly hot list applied as pre-navigation
// declarativeNetRequest rules (0.13.0, Task 12).
//
// Rewritten against the real fixture API: tests/e2e/fixtures.js exports only
// { test, EXTENSION_PATH, BASE_HTTPS }, so the service worker comes from
// context.serviceWorkers()[0] and fixture URLs are hand-built — the same
// pattern feed.spec.js, blocked-page.spec.js and trust-this-site.spec.js use.
//
// The hot files themselves are written into tests/e2e/feed-fixtures/ and
// served by the /feed/ static route in tests/e2e/server.js (which now sends
// an ETag + application/json for .json). runHotUpdate(url) with an explicit
// URL deliberately skips If-None-Match, so re-fetching a rewritten fixture is
// never answered with a 304 from a previous test's ETag.
//
// Host mapping notes (tests/e2e/fixtures.js --host-resolver-rules):
//   hot-fixture.example       -> 127.0.0.1 (port preserved, so :5599 URLs)
//   hot-path-fixture.example  -> 127.0.0.1:5599 (port REWRITTEN, so the page
//                                URL itself carries no port). The path tier
//                                builds an anchored regex
//                                `^https?://<host><path>(?:[/?#]|$)`, which a
//                                `:5599` between host and path would not
//                                match — a real reported shortener URL has no
//                                port either, so mapping the port is what
//                                makes this fixture faithful.
//   trusted-hot.example       -> 127.0.0.1 (never navigated; guard test only)
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = 'http://localhost:5599/feed/';
const HITS_URL = 'http://localhost:5599/hits';

const HOT_HOST = 'hot-fixture.example';
const HOT_URL = `http://${HOT_HOST}:5599/`;          // server.js serves clean.html at '/'
const PATH_HOST = 'hot-path-fixture.example';
const PATH_BAD = `http://${PATH_HOST}/bad-path`;      // port rewritten by the host resolver
const PATH_OK = `http://${PATH_HOST}/clean.html`;
const TRUSTED_HOST = 'trusted-hot.example';

const minNow = () => Math.floor(Date.now() / 60000);

// Writes a hot.json fixture in the real on-the-wire shape
// ({ v, generatedAt, ttlMinutes, domains:[{h,s,t}], paths:[{h,p,s,t}],
// removed:[h] }, `t` in epoch MINUTES — engine/hotlist.js drops anything
// older than its 48h window).
// Production ships ttlMinutes 1440 (0.14.1 fixture parity); `opts` lets a case
// age the file (`ageMs`) or override the TTL.
function writeHot(name, domains, paths, removed, opts) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const o = opts || {};
  const body = {
    v: 1,
    generatedAt: Date.now() - (o.ageMs || 0),
    ttlMinutes: o.ttlMinutes || 1440,
    domains: (domains || []).map((h) => ({ h, s: 'pd', t: minNow() })),
    paths: (paths || []).map((p) => ({ h: p.h, p: p.p, s: 'pdb', t: minNow() })),
    removed: removed || []
  };
  fs.writeFileSync(path.join(FEED_DIR, name), JSON.stringify(body));
  return FEED_BASE_URL + name;
}

// Every applyHotRules() call is serialized on one promise chain, so a test's
// own call is only guaranteed to be the LAST one if it is queued after the
// SW's cold-boot sequence (which runs its own applyHotRules(undefined)
// against an empty storage.local). awaitBootReady() makes that deterministic
// — same reasoning as trust-this-site.spec.js.
async function installHot(sw, url) {
  await sw.evaluate(() => awaitBootReady());
  return sw.evaluate((u) => runHotUpdate(u), url);
}

async function hotRuleIds(sw) {
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  return rules.filter((r) => r.id >= 400000 && r.id < 600000);
}

// The fixtures server logs every request it answers (host + path). "The
// navigation never reached the site" is asserted against that log rather
// than page.on('request'), because a declarativeNetRequest redirect still
// surfaces the original URL to the DevTools protocol as the first leg of a
// redirect chain — the browser reports it, but no packet ever leaves for the
// listed host, which is the property that actually matters here.
async function resetHits() { await fetch(HITS_URL + '/reset', { method: 'POST' }); }
async function hitsFor(host) {
  const all = await (await fetch(HITS_URL)).json();
  return all.filter((h) => (h.host || '').split(':')[0] === host);
}

test('runHotUpdate installs HOT/PATH rules; a listed host lands on blocked.html before the request ever leaves', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const url = writeHot('hot.json', [HOT_HOST], [{ h: PATH_HOST, p: '/bad-path' }], []);
  const r = await installHot(sw, url);
  expect(r.ok).toBe(true);
  expect(r.updated).toBe(true);

  const installed = await hotRuleIds(sw);
  expect(installed.some((x) => x.id >= 400000 && x.id < 500000 && (x.condition.requestDomains || []).includes(HOT_HOST))).toBe(true);
  expect(installed.some((x) => x.id >= 500000 && x.id < 600000)).toBe(true);

  await resetHits();
  const page = await context.newPage();
  await page.goto(HOT_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('^chrome-extension://' + extensionId + '/blocked\\.html#'));
  expect(decodeURIComponent(page.url().split('#')[1])).toMatch(new RegExp('^https?://' + HOT_HOST.replace(/\./g, '\\.')));
  expect(await hitsFor(HOT_HOST)).toEqual([]);

  // The path tier blocks its own path only.
  await page.goto(PATH_BAD, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/blocked\.html#/);
  expect(decodeURIComponent(page.url().split('#')[1])).toContain('/bad-path');
  await page.goto(PATH_OK, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/blocked\.html/);
  await expect(page).toHaveURL(PATH_OK);
  // ...and that unblocked load DID reach the server — which is also what
  // proves the hits log above is recording, so the empty result for the
  // blocked host is a real negative and not a broken assertion.
  expect((await hitsFor(PATH_HOST)).map((h) => h.url)).toContain('/clean.html');
  expect(await hitsFor(HOT_HOST)).toEqual([]);
});

test('a later hot file lifts the rule (removed[]); turning the switch off clears the whole HOT/PATH range', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installHot(sw, writeHot('hot.json', [HOT_HOST], [], []));
  expect((await hotRuleIds(sw)).length).toBeGreaterThan(0);

  // The next hourly file no longer lists the host (and names it in removed[]);
  // applyHotRules replaces the whole range from the current file, so the rule
  // is gone and the site loads again.
  await sw.evaluate((u) => runHotUpdate(u), writeHot('hot-removed.json', [], [], [HOT_HOST]));
  expect(await hotRuleIds(sw)).toEqual([]);
  const page = await context.newPage();
  await page.goto(HOT_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/blocked\.html/);

  // Re-arm, then flip the user switch off: the range must empty out and the
  // status must report the feature disabled.
  await sw.evaluate((u) => runHotUpdate(u), writeHot('hot.json', [HOT_HOST], [], []));
  expect((await hotRuleIds(sw)).length).toBeGreaterThan(0);
  await sw.evaluate(() => setSettings({ hotListEnabled: false }));
  // setSettings kicks its applyHotRules off fire-and-forget, so poll.
  await expect.poll(async () => (await hotRuleIds(sw)).length, { timeout: 5000 }).toBe(0);
  const status = await sw.evaluate(() => getHotStatus());
  expect(status.enabled).toBe(false);
  expect(status.count).toBe(0);
  const page2 = await context.newPage();
  await page2.goto(HOT_URL, { waitUntil: 'domcontentloaded' });
  await expect(page2).not.toHaveURL(/blocked\.html/);
});

test('hot hosts are visible to the in-page feed check within the hour (SERP badge path)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installHot(sw, writeHot('hot.json', [HOT_HOST], [], []));
  const hit = await sw.evaluate(() => checkFeedHost('hot-fixture.example'));
  expect(hit.hit).toBe('block');
  expect(hit.hot).toBe(true);
  const batch = await sw.evaluate(() => checkFeedBatchHosts(['hot-fixture.example', 'clean-feed-fixture.example']));
  expect(batch.results['hot-fixture.example']).toBe('block');
  expect(batch.results['clean-feed-fixture.example']).toBeFalsy();
});

test('client guard: SAFE_DOMAINS, real brand domains and the user allowlist never become hot rules', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate((h) => setSettings({ allowlist: [h] }), TRUSTED_HOST);
  // www.google.com is on SAFE_DOMAINS *and* is a known brand registrable, and
  // engine/hotlist.js attributes each dropped host to exactly one reason in a
  // fixed priority order (exempt > verified > brand > safe) so the counts sum
  // to the number of hosts dropped — so it lands in `brand`. www.wikipedia.org
  // is SAFE_DOMAINS-only, which is what pins the `safe` bucket.
  await installHot(sw, writeHot('hot.json', ['www.google.com', 'www.wikipedia.org', TRUSTED_HOST, HOT_HOST], [], []));
  const st = await sw.evaluate(() => getHotStatus());
  expect(st.count).toBe(1);
  expect(st.dropped).toMatchObject({ safe: 1, exempt: 1, brand: 1 });
  // And the surviving host is the only one with a rule.
  const rules = await hotRuleIds(sw);
  const domains = rules.flatMap((r) => r.condition.requestDomains || []);
  expect(domains).toEqual([HOT_HOST]);
});

// 0.14.1 stale-while-revalidate: a list 7 h past a 360-minute TTL is still
// applied; the rules must survive a SW restart (boot path) and a 304 refresh.
test('a hot list past its TTL (7 h old, ttl 360) keeps its rules across the boot path and a 304 refresh', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const stale = writeHot('hot-stale.json', [HOT_HOST], [{ h: PATH_HOST, p: '/bad-path' }], [], { ageMs: 7 * 3600000, ttlMinutes: 360 });
  const r = await installHot(sw, stale);
  expect(r.ok).toBe(true);
  const hasHot = (rules) => rules.some((x) => x.id >= 400000 && x.id < 500000 && (x.condition.requestDomains || []).includes(HOT_HOST));
  expect(hasHot(await hotRuleIds(sw))).toBe(true);

  // Boot path: what ensureNetworkRules() does on a cold-woken worker — rebuild
  // from storage.local.hotList with applyHotRules(undefined).
  await sw.evaluate(() => applyHotRules(undefined));
  const afterBoot = await hotRuleIds(sw);
  expect(hasHot(afterBoot)).toBe(true);
  expect(afterBoot.some((x) => x.id >= 500000 && x.id < 600000)).toBe(true);

  // 304 path: runHotUpdate() without an override, fetch answering 304.
  await sw.evaluate(() => {
    globalThis.__realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 304 });
  });
  try {
    const r304 = await sw.evaluate(() => runHotUpdate());
    expect(r304).toMatchObject({ ok: true, updated: false });
  } finally {
    await sw.evaluate(() => { globalThis.fetch = globalThis.__realFetch; });
  }
  expect(hasHot(await hotRuleIds(sw))).toBe(true);
  const st = await sw.evaluate(() => getHotStatus());
  expect(st.count).toBe(1);
  expect(st.dropped.expired).toBe(0);
});

// 0.14.1 client-side kill switch: a poisoned list after a good one is refused,
// the good list's rules stay, and Options says so.
test('kill switch: a poisoned hot list is rejected; previous rules stay and Options shows the notice', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const good = await installHot(sw, writeHot('hot.json', [HOT_HOST], [], []));
  expect(good.updated).toBe(true);
  const poison = ['google.com', 'paypal.com', 'www.google.com', 'www.paypal.com', 'accounts.google.com', 'www.microsoft.com'];
  const many = [];
  for (let i = 0; i < 30; i++) many.push(poison[i % poison.length]);
  const bad = await sw.evaluate((u) => runHotUpdate(u), writeHot('hot.json', [HOT_HOST, ...many, 'extra.example'], [], []));
  expect(bad.ok).toBe(false);
  expect(bad.reason).toMatch(/^rejected-/);
  const st = await sw.evaluate(() => chrome.storage.local.get(['hotRejectReason', 'hotRejectedAt', 'hotList']));
  expect(st.hotRejectReason).toBeTruthy();
  expect(st.hotList.domains.map((d) => d.h)).toEqual([HOT_HOST]);
  const domains = (await hotRuleIds(sw)).flatMap((r) => r.condition.requestDomains || []);
  expect(domains).toEqual([HOT_HOST]);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('[role=tab]', { hasText: /feed/i }).first().click().catch(() => {});
  await expect(page.locator('#hotrejected')).toContainText('rejected as unsafe');
  // a good list afterwards clears the notice
  await installHot(sw, writeHot('hot.json', [HOT_HOST, 'other-hot.example'], [], []));
  expect((await sw.evaluate(() => chrome.storage.local.get('hotRejectReason'))).hotRejectReason).toBeUndefined();
});

test('kill switch: an OTA filter naming google.com yields no block/redirect rule for it', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  await sw.evaluate(() => applyNetworkRules(['||google.com^', '||ota-evil.example^'], true));
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  const filters = rules.map((r) => r.condition.urlFilter).filter(Boolean);
  const domains = rules.flatMap((r) => r.condition.requestDomains || []);
  expect(filters).toContain('||ota-evil.example^');
  expect(filters).not.toContain('||google.com^');
  expect(domains).toContain('ota-evil.example');
  expect(domains).not.toContain('google.com');
  expect((await sw.evaluate(() => chrome.storage.local.get('otaDropped'))).otaDropped).toBe(1);
});

test('kill switch: growth is soft - after 3 consecutive growth rejections the next one is accepted', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const mk = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}.example`);
  expect((await installHot(sw, writeHot('hot.json', mk(2500, 'a'), [], []))).updated).toBe(true);
  const big = writeHot('hot.json', mk(8000, 'b'), [], []);   // > 3 x max(2500, 2000)
  for (let i = 0; i < 3; i++) {
    const r = await sw.evaluate((u) => runHotUpdate(u), big);
    expect(r.reason).toBe('rejected-growth');
  }
  const r4 = await sw.evaluate((u) => runHotUpdate(u), big);
  expect(r4.updated).toBe(true);
  const st = await sw.evaluate(() => chrome.storage.local.get(['hotRejectReason', 'hotGrowthRejects']));
  expect(st.hotRejectReason).toBeUndefined();
  expect(st.hotGrowthRejects).toBeUndefined();
});

// 0.14.1 Task 10: the master switch really pauses everything. Static ruleset
// sentinel + a hot-listed host both stop blocking when `enabled` is false,
// stay off across a service-worker restart, and come back on instantly.
test('master switch off lifts static + hot blocking (also across an SW restart); on restores it', async ({ context, extensionId }) => {
  let sw = context.serviceWorkers()[0];
  const SENTINEL = 'http://scamshield-test-blocked.example/';
  await installHot(sw, writeHot('hot.json', [HOT_HOST], [], []));
  const blockedNow = async (url) => {
    const p = await context.newPage();
    try { await p.goto(url, { waitUntil: 'domcontentloaded' }); } catch (_) { /* DNS error page when not blocked */ }
    const u = p.url(); await p.close();
    return u.startsWith(`chrome-extension://${extensionId}/blocked.html`);
  };
  expect(await blockedNow(HOT_URL)).toBe(true);
  expect(await blockedNow(SENTINEL)).toBe(true);

  await sw.evaluate(() => setSettings({ enabled: false }));
  expect(await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual([]);
  const dyn = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  expect(dyn.filter((r) => r.id < 300000 || r.id >= 400000)).toEqual([]);
  expect(await blockedNow(HOT_URL)).toBe(false);
  expect(await blockedNow(SENTINEL)).toBe(false);

  // Terminate the worker over CDP (runtime.reload() takes the whole headless
  // context down) and wake a fresh one: ensureNetworkRules runs on its boot.
  await sw.evaluate(() => { globalThis.__bootMarker = 1; });
  const wake = await context.newPage();
  const cdp = await context.newCDPSession(wake);
  const versions = [];
  cdp.on('ServiceWorker.workerVersionUpdated', (e) => versions.push(...e.versions));
  await cdp.send('ServiceWorker.enable');
  await new Promise((r) => setTimeout(r, 500));
  for (const v of versions) await cdp.send('ServiceWorker.stopWorker', { versionId: v.versionId });
  await new Promise((r) => setTimeout(r, 1000));
  await wake.goto(`chrome-extension://${extensionId}/options.html`);
  sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  // A genuinely fresh worker has none of the old global state.
  expect(await sw.evaluate(() => globalThis.__bootMarker)).toBeUndefined();
  await sw.evaluate(() => awaitBootReady());
  expect((await sw.evaluate(() => getSettings())).enabled).toBe(false);
  expect(await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual([]);
  expect(await blockedNow(HOT_URL)).toBe(false);
  expect(await blockedNow(SENTINEL)).toBe(false);

  // A hot refresh while off still downloads + saves the list, but applies nothing.
  const r = await sw.evaluate((u) => runHotUpdate(u), writeHot('hot2.json', [HOT_HOST, 'other-hot.example'], [], []));
  expect(r.ok).toBe(true);
  expect((await sw.evaluate(() => chrome.storage.local.get('hotRejectReason'))).hotRejectReason).toBeUndefined();
  expect((await sw.evaluate(() => chrome.storage.local.get('hotList'))).hotList.domains.length).toBe(2);
  expect(await hotRuleIds(sw)).toEqual([]);

  await sw.evaluate(() => setSettings({ enabled: true }));
  expect(await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).toEqual(['blocklist']);
  expect(await blockedNow(HOT_URL)).toBe(true);
  expect(await blockedNow(SENTINEL)).toBe(true);
});
