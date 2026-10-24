// tests/e2e/adguard.spec.js — scam-ad hiding (0.15.0, Task 17a). NOT an ad blocker: only ads that lead to a listed
// site or carry two scam patterns are collapsed; page content outside an ad container is never touched.
// Also: scam iframes/scripts from listed hosts never load (declarativeNetRequest sub_frame + script rules).
// The feed is a fixture (runFeedUpdate with a local meta.json), exactly like linkguard.spec.js. Fixture pages and
// hosts only, never a live site or a real ad network.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Blockset = require('../../engine/blockset');

const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = 'http://localhost:5599/feed/';
const HITS_URL = 'http://localhost:5599/hits';
const PAGE = 'http://localhost:5599/adguard.html';
const EMBED = 'http://localhost:5599/adguard-embed.html';
const SENTINEL = 'scamshield-test-blocked.example';
const POPULAR = 'en.wikipedia.org';
const DNR_HOST = 'ad-scam-fixture.example';
const HOT_HOST = 'hot-fixture.example';

function hash40For(domain) { return Blockset.hash40FromBytes(crypto.createHash('sha256').update(domain).digest()); }
function buildRecords(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const buf = Buffer.alloc(sorted.length * 5);
  sorted.forEach((v, i) => { buf.writeUInt32BE(Math.floor(v / 256), i * 5); buf.writeUInt8(v % 256, i * 5 + 4); });
  return buf;
}
let seq = 0;
async function installFeed(sw, blockDomains) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const set40 = buildRecords(blockDomains.map(hash40For));
  const warn40 = buildRecords([hash40For('adguard-unused-warn.example')]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);
  fs.writeFileSync(path.join(FEED_DIR, 'risk.json'), JSON.stringify({ tlds: {}, dyndns: [], hosters: [] }));
  const meta = {
    version: 'adguard-' + Date.now() + '-' + (seq++), generatedAt: new Date().toISOString(),
    counts: { block: blockDomains.length, warn: 1, total: blockDomains.length + 1 },
    sha256: { set40: crypto.createHash('sha256').update(set40).digest('hex'), deltaFromPrev: null },
    prev: null, urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL }, ttlHours: 6
  };
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify(meta));
  await sw.evaluate((url) => runFeedUpdate(url), FEED_BASE_URL + 'meta.json');
}
const collapsedTags = (page) => page.locator('.scamshield-ad-hidden');

test('an ad slot linking to the blocked sentinel (through an ad-click wrapper) is collapsed to a slim tag, and Show restores it on a real click only', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  const ad = page.locator('#ad-link');
  await expect(collapsedTags(page).first()).toBeVisible({ timeout: 7000 });
  await expect(ad).toBeHidden();
  const tag = page.locator('#ad-link').locator('xpath=preceding-sibling::*[1]');
  await expect(tag).toHaveClass(/scamshield-ad-hidden/);
  await expect(tag).toContainText('Scam ad hidden');
  const box = await tag.boundingBox();
  expect(box.height).toBeLessThan(60);          // a slim bar, not the 80px+ ad
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(290); // keeps the ad's width (300px)
  // A script's click on Show does nothing.
  await tag.locator('button').evaluate((b) => b.click());
  await expect(ad).toBeHidden();
  // A real click restores the ad.
  await tag.locator('button').click();
  await expect(ad).toBeVisible();
  await expect(collapsedTags(page)).toHaveCount(1); // only #ad-two (two scam patterns) stays collapsed
  await expect(page.locator('#ad-two')).toBeHidden();
});

test('an ad slot with two scam patterns is collapsed; one pattern or none is untouched', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-two')).toBeHidden({ timeout: 7000 });
  await expect(page.locator('#ad-link')).toBeHidden();
  await page.waitForTimeout(1200);              // let any wrongly-queued work run
  for (const id of ['ad-one', 'ad-none', 'ad-popular']) await expect(page.locator('#' + id), id).toBeVisible();
  expect(await collapsedTags(page).count()).toBe(2);
});

test('a popular destination is never treated as a scam ad, even if the feed lists it', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL, POPULAR]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-link')).toBeHidden({ timeout: 7000 }); // the canary: the guard did run
  await expect(page.locator('#ad-popular')).toBeVisible();
});

test('page content outside an ad container is never touched, even with scam wording or a listed link', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-link')).toBeHidden({ timeout: 7000 }); // the canary: the guard did run
  await expect(page.locator('#article')).toBeVisible();
  await expect(page.locator('#article')).toContainText('double your money');
  expect(await page.locator('#article').evaluate((n) => n.className + '|' + n.getAttribute('style'))).toBe('|null');
  // A non-ad box that links to the sentinel keeps its box (the link guard may mark the link itself).
  await expect(page.locator('#ad-plain-link')).toBeVisible();
});

test('an ad inserted 2.5 s after load is collapsed too', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE + '?late=1');
  await expect(page.locator('#ad-late')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('#ad-late')).toBeHidden({ timeout: 8000 });
});

// 0.15.0 final fix B2: lifecycle across a same-document route change, and the user's exemption re-read each round.
test('an SPA route change that removes a collapsed ad slot leaves no orphan "Scam ad hidden" tag', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto('http://localhost:5599/adguard-spa.html');
  await expect(collapsedTags(page)).toHaveCount(1, { timeout: 7000 });
  await page.click('#route');
  await expect(page.locator('#ad-link')).toHaveCount(0);
  await expect(collapsedTags(page)).toHaveCount(0, { timeout: 4000 });
  // and the next route's own ad is still handled
  await page.click('#late');
  await expect(page.locator('#ad-late-spa')).toBeHidden({ timeout: 8000 });
  await expect(collapsedTags(page)).toHaveCount(1);
});

test('trusting the site after load: ads that arrive later are not collapsed and the collapsed one is released', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto('http://localhost:5599/adguard-spa.html');
  await expect(collapsedTags(page)).toHaveCount(1, { timeout: 7000 });
  await sw.evaluate(() => setSettings({ allowlist: ['localhost'] }));
  await page.click('#late');
  await expect(page.locator('#ad-late-spa')).toBeVisible();
  await page.waitForTimeout(3500);               // a round runs (idle timeout 1.5 s) and re-reads the exemption
  await expect(page.locator('#ad-late-spa')).toBeVisible();
  await expect(collapsedTags(page)).toHaveCount(0);
  await expect(page.locator('#ad-link')).toBeVisible();
});

test('settings.adGuard === false leaves every ad alone; the link guard is independent of it', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  await sw.evaluate(() => setSettings({ adGuard: false }));
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-plain-link a')).toHaveClass(/scamshield-link-block/, { timeout: 7000 }); // canary: the link guard ran
  await page.waitForTimeout(1500);
  await expect(page.locator('#ad-link')).toBeVisible();
  await expect(page.locator('#ad-two')).toBeVisible();
  expect(await collapsedTags(page).count()).toBe(0);
});

test('with the link guard off, the ad guard still works (passive lookup) and no link is marked', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  await sw.evaluate(() => setSettings({ linkGuard: false }));
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-link')).toBeHidden({ timeout: 7000 });
  await expect(page.locator('#ad-plain-link a')).not.toHaveClass(/scamshield-link-block/);
});

test('an ad-sized iframe whose own link leads to a listed site is covered by a tile; clean and non-ad-sized frames are not', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(PAGE);
  const scam = page.frameLocator('#adframe');
  await expect(scam.locator('.scamshield-ad-tile')).toBeVisible({ timeout: 9000 });
  await expect(scam.locator('.scamshield-ad-tile')).toContainText('Scam ad hidden');
  // opaque and filling the frame
  const tile = await scam.locator('.scamshield-ad-tile').boundingBox();
  const frame = await page.locator('#adframe').boundingBox();
  expect(Math.abs(tile.width - frame.width)).toBeLessThan(4);
  expect(Math.abs(tile.height - frame.height)).toBeLessThan(4);
  await expect(page.frameLocator('#cleanframe').locator('.scamshield-ad-tile')).toHaveCount(0);
  await expect(page.frameLocator('#bigframe').locator('.scamshield-ad-tile')).toHaveCount(0);
  // Show removes the tile on a real click only. (The frame must be on screen for a real click.)
  await page.locator('#adframe').scrollIntoViewIfNeeded();
  await scam.locator('.scamshield-ad-tile button').evaluate((b) => b.click());
  await expect(scam.locator('.scamshield-ad-tile')).toHaveCount(1);
  await scam.locator('.scamshield-ad-tile button').click();
  await expect(scam.locator('.scamshield-ad-tile')).toHaveCount(0);
});

test('hard benign: page wrappers carrying data-ad-slot / aria-label=Advertisement around an article are untouched; a small ad on the same page is collapsed', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto('http://localhost:5599/adguard-wrapper.html');
  await expect(page.locator('#ad-small')).toBeHidden({ timeout: 7000 }); // positive canary: the guard ran
  await expect(collapsedTags(page)).toHaveCount(2, { timeout: 9000 }); // #ad-hidden-first: hidden at scan time, collapsed one round later
  for (const id of ['wrap-slot', 'wrap-aria', 'wrap-text', 'story-a', 'story-b']) await expect(page.locator('#' + id), id).toBeVisible();
  await expect(page.locator('#ad-hidden-first')).toBeHidden();
  expect(await collapsedTags(page).count()).toBe(2);
});

test('a user-paused or trusted top page gets no ad hiding and no iframe tile', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  await sw.evaluate(() => setSettings({ allowlist: ['localhost'] }));
  const page = await context.newPage();
  await page.goto(PAGE);
  await expect(page.locator('#ad-plain-link a')).toHaveClass(/scamshield-link-block/, { timeout: 7000 }); // canary: the link guard ran
  await page.waitForTimeout(6000);              // past the frame's 1.5 s and 4 s checks
  await expect(page.locator('#ad-link')).toBeVisible();
  await expect(page.locator('#ad-two')).toBeVisible();
  await expect(page.frameLocator('#adframe').locator('.scamshield-ad-tile')).toHaveCount(0);
});

async function resetHits() { await fetch(HITS_URL + '/reset', { method: 'POST' }); }
async function hitsFor(host) {
  const all = await (await fetch(HITS_URL)).json();
  return all.filter((h) => (h.host || '').split(':')[0] === host).map((h) => h.url);
}

test('a scam iframe and script from a feed-listed host do not load inside a normal page (DNR sub_frame + script); trusting the host allows them', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  const rules = await sw.evaluate((h) => applyNetworkRules(['||' + h + '^'], true), DNR_HOST);
  expect(rules.ok).toBe(true);
  const installed = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  const mine = installed.find((r) => r.condition.urlFilter === '||' + DNR_HOST + '^');
  expect(mine.condition.resourceTypes).toEqual(['main_frame', 'sub_frame', 'script']);

  await resetHits();
  const page = await context.newPage();
  await page.goto(EMBED + '?host=' + DNR_HOST);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__adScriptRan)).toBeUndefined();
  expect(await hitsFor(DNR_HOST)).toEqual([]);

  // Canary: once the host is trusted (allow rule, higher priority) the same page loads both.
  await sw.evaluate((h) => setSettings({ allowlist: [h] }), DNR_HOST);
  await resetHits();
  await page.goto(EMBED + '?host=' + DNR_HOST);
  await expect.poll(() => page.evaluate(() => window.__adScriptRan)).toBe(true);
  expect((await hitsFor(DNR_HOST)).sort()).toEqual(['/adguard-ad.js', '/adguard-inner.html']);
});

test('a hot-list host cannot be embedded as a frame or script either (SUB_BASE rule)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const min = Math.floor(Date.now() / 60000);
  fs.writeFileSync(path.join(FEED_DIR, 'hot-ad.json'), JSON.stringify({
    v: 1, generatedAt: Date.now(), ttlMinutes: 1440, domains: [{ h: HOT_HOST, s: 'pd', t: min }], paths: [], removed: []
  }));
  await sw.evaluate(() => awaitBootReady());
  const r = await sw.evaluate((u) => runHotUpdate(u), FEED_BASE_URL + 'hot-ad.json');
  expect(r.ok).toBe(true);
  const sub = (await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).filter((x) => x.id >= 600000 && x.id < 700000);
  expect(sub.length).toBe(1);
  expect(sub[0].condition.resourceTypes).toEqual(['sub_frame', 'script']);

  await resetHits();
  const page = await context.newPage();
  await page.goto(EMBED + '?host=' + HOT_HOST);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__adScriptRan)).toBeUndefined();
  expect(await hitsFor(HOT_HOST)).toEqual([]);

  // Canary: the page itself and an unlisted host still load.
  await resetHits();
  await page.goto(EMBED + '?host=localhost');
  await expect.poll(() => page.evaluate(() => window.__adScriptRan)).toBe(true);
});
