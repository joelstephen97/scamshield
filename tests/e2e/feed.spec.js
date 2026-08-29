// tests/e2e/feed.spec.js — v0.9 threat-feed matcher (Task B2): block-set
// domain gets the dangerous interstitial, warn-set domain gets a suspicious
// banner with an evidence chip, and a 40-bit hit NOT confirmed by its exact
// shard downgrades to no-hit (the false-positive path) instead of ever
// showing a warning. Fixtures are built here (reusing engine/blockset.js,
// which is Node-requireable) and served by the tiny /feed/ static route
// added to tests/e2e/server.js — the same pattern the task brief describes
// for a format the existing HTML-page fixture route can't serve.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const Blockset = require('../../engine/blockset');

const BASE = 'http://localhost:5599';
const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = BASE + '/feed/';

const BLOCK_DOMAIN = 'block-feed-fixture.example';
const WARN_DOMAIN = 'warn-feed-fixture.example';
// A domain whose 40-bit hash is deliberately planted in the block set, but
// which never appears in any exact-shard fixture below — the "1-in-950k"
// false-positive case the SW must downgrade to no-hit rather than trust.
const FP_DOMAIN = 'fp-feed-fixture.example';

function hash40For(domain) {
  const digest = crypto.createHash('sha256').update(domain).digest();
  return Blockset.hash40FromBytes(digest);
}
function buildRecords(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const buf = Buffer.alloc(sorted.length * 5);
  sorted.forEach((v, i) => {
    buf.writeUInt32BE(Math.floor(v / 256), i * 5);
    buf.writeUInt8(v % 256, i * 5 + 4);
  });
  return buf;
}
function shardHex(hash40) { return Blockset.shardByte(hash40).toString(16).padStart(2, '0'); }
function buildShardGz(entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
  return zlib.gzipSync(Buffer.from(lines, 'utf8'));
}
function sha256Hex(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

test.beforeAll(() => {
  fs.mkdirSync(FEED_DIR, { recursive: true });

  const blockHash = hash40For(BLOCK_DOMAIN);
  const fpHash = hash40For(FP_DOMAIN);
  const warnHash = hash40For(WARN_DOMAIN);

  const set40 = buildRecords([blockHash, fpHash]);
  const warn40 = buildRecords([warnHash]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);

  // Real confirming exact-shard entries for the two domains meant to hit.
  // FP_DOMAIN gets none — whether its 40-bit hash happens to share a shard
  // byte with one of these (that shard's real content still omits it) or
  // lands on a byte with no file at all (a fetch 404), findExact() must miss.
  fs.writeFileSync(path.join(FEED_DIR, `exact-${shardHex(blockHash)}.jsonl.gz`),
    buildShardGz([{ d: BLOCK_DOMAIN, s: ['Phishing.Database', 'HaGeZi Threat-Intelligence-Feeds (medium)'] }]));
  fs.writeFileSync(path.join(FEED_DIR, `exact-${shardHex(warnHash)}.jsonl.gz`),
    buildShardGz([{ d: WARN_DOMAIN, s: ['ScamSniffer'] }]));

  const meta = {
    version: '1',
    generatedAt: new Date().toISOString(),
    counts: { block: 2, warn: 1, total: 3 },
    sha256: { set40: sha256Hex(set40), deltaFromPrev: null },
    prev: null,
    urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL },
    ttlHours: 6
  };
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify(meta));
});

// Drives the real OTA cycle against the fixture meta.json (the SW's
// hardcoded FEED_META_URL points at GitHub/jsDelivr, unreachable — and
// undesirable to hit — from a sandboxed test run, so runFeedUpdate() takes
// the URL as an explicit override for exactly this purpose).
async function installFeed(sw) {
  return sw.evaluate((url) => runFeedUpdate(url), FEED_BASE_URL + 'meta.json');
}

test('feed OTA cycle installs the fixture block/warn sets via runFeedUpdate', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const r = await installFeed(sw);
  expect(r.ok).toBe(true);
  expect(r.updated).toBe(true);
  expect(r.version).toBe('1');
  expect(r.blockUpdated).toBe(true);
  expect(r.warnUpdated).toBe(true);
  // A second cycle against the same (unchanged) meta.json is a no-op.
  const again = await installFeed(sw);
  expect(again.updated).toBe(false);
});

test('block-tier feed domain gets the dangerous interstitial with provenance', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`http://${BLOCK_DOMAIN}:5599/`);
  const inter = page.locator('.scamshield-interstitial');
  await expect(inter).toBeVisible({ timeout: 8000 });
  // The leading reason line (reasonText(verdict.reasons[0])) is the feed
  // reason since content_script.js unshifts it to the front of the array.
  await expect(inter.locator('.ss-card p').first()).toContainText(/threat feed/i);
});

test('warn-tier feed domain gets a suspicious banner evidence chip, not an interstitial', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`http://${WARN_DOMAIN}:5599/`);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  const banner = page.locator('.scamshield-banner.suspicious');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner.locator('.ss-text span').first()).toContainText(/threat feed/i);
});

test('a 40-bit hit not confirmed by its exact shard downgrades to no-hit (false-positive path)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  // Confirm directly against the SW: the hash IS in the block set, but the
  // exact shard never names this domain, so checkFeed must report no hit.
  const result = await sw.evaluate((host) => checkFeedHost(host), FP_DOMAIN);
  expect(result).toEqual({ hit: null });
  const page = await context.newPage();
  await page.goto(`http://${FP_DOMAIN}:5599/`);
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('a clean feed-fixture host (no hash hit at all) is untouched', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto('http://clean-feed-fixture.example:5599/');
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});
