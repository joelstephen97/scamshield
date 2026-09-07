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
function writeHot(name, domains, paths, removed) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const body = {
    v: 1,
    generatedAt: Date.now(),
    ttlMinutes: 60,
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
