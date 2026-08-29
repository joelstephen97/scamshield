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
let UNVERIFIED_DOMAIN = null; // chosen at fixture-build time, see below

function hash40For(domain) {
  const digest = crypto.createHash('sha256').update(domain).digest();
  return Blockset.hash40FromBytes(digest);
}
// Top 32 bits of SHA-256(domain) — the encoding risk.json's dyndns/hosters
// arrays use (engine/risk_rules.js hash32FromBytes()).
function hash32For(domain) {
  const digest = crypto.createHash('sha256').update(domain).digest();
  return digest.readUInt32BE(0);
}

// Task B3 fixtures: risk.json abused-TLD table + dyndns/hoster membership.
const RISK_DYNDNS_DOMAIN = 'risk-dyndns-fixture.example';
const RISK_HOSTER_DOMAIN = 'risk-hoster-fixture.example';
const RISK_TLD_HOST = 'risk-abused-tld-fixture.riskfixturetld';
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

// --- nrd.bloom fixture (Task C3): a tiny Bloom filter built with the SAME
// index-derivation algorithm as engine/bloom.js / parry-feed's lib/bloom.js
// (see engine/bloom.js's header comment for the spec this mirrors).
const NRD_DOMAIN = 'nrd-fixture.example';           // bloom-positive, first-ever visit
const NRD_ESTABLISHED_DOMAIN = 'nrd-established.example'; // bloom-positive but seen locally 40 days ago
function nrdOptimalParams(n, p) {
  const m = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const mBits = Math.max(8, Math.ceil(m / 8) * 8);
  let k = Math.max(1, Math.round((mBits / n) * Math.LN2));
  if (k > 7) k = 7;
  return { mBits, k };
}
function nrdIndicesFor(digest, k, mBits) {
  const h1 = digest.readUInt32BE(0);
  let h2 = digest.readUInt32BE(4);
  if (h2 === 0) h2 = 1;
  const out = [];
  for (let i = 0; i < k; i++) out.push((h1 + i * h2) % mBits);
  return out;
}
function buildNrdBloomFixture(hosts, p) {
  const n = hosts.length;
  const { mBits, k } = nrdOptimalParams(n, p);
  const bits = Buffer.alloc(Math.ceil(mBits / 8));
  for (const h of hosts) {
    const digest = crypto.createHash('sha256').update(h, 'utf8').digest();
    for (const idx of nrdIndicesFor(digest, k, mBits)) bits[idx >> 3] |= 1 << (7 - (idx & 7));
  }
  const header = Buffer.alloc(16);
  header.write('NRDB', 0, 4, 'ascii');
  header.writeUInt8(1, 4);
  header.writeUInt8(k, 5);
  header.writeUInt16BE(0, 6);
  header.writeUInt32BE(n, 8);
  header.writeUInt32BE(mBits, 12);
  return Buffer.concat([header, bits]);
}
// The exact hex the SW derives for storage.local's firstSeen ring key: the
// first 8 bytes of SHA-256(registrable domain), hex-encoded (both fixture
// domains here are already bare registrable domains, so no eTLD+1 collapse
// happens).
function nrdHostHash(domain) {
  const digest = crypto.createHash('sha256').update(domain, 'utf8').digest();
  return Array.from(digest.subarray(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

test.beforeAll(() => {
  fs.mkdirSync(FEED_DIR, { recursive: true });

  const blockHash = hash40For(BLOCK_DOMAIN);
  const fpHash = hash40For(FP_DOMAIN);
  const warnHash = hash40For(WARN_DOMAIN);

  // A block-tier domain whose exact shard deliberately does NOT exist (its
  // shard byte is chosen to differ from every shard file written below), for
  // the unavailable-shard fail-caution test. Deterministic: candidates are
  // tried in order until one lands on its own shard byte.
  let unvHash = null;
  // Candidates 0-7 are all present in fixtures.js's host-resolver-rules; the
  // odds of every one sharing a shard byte with block/warn/fp are ~(3/256)^8.
  for (let i = 0; i < 8 && !unvHash; i++) {
    const cand = `unverified-${i}.example`;
    const h = hash40For(cand);
    if (shardHex(h) !== shardHex(blockHash) && shardHex(h) !== shardHex(warnHash) && shardHex(h) !== shardHex(hash40For(FP_DOMAIN))) {
      unvHash = h; UNVERIFIED_DOMAIN = cand;
    }
  }
  const set40 = buildRecords([blockHash, fpHash, unvHash]);
  const warn40 = buildRecords([warnHash]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);

  // Real confirming exact-shard entries for the two domains meant to hit.
  // FP_DOMAIN's shard must EXIST but omit it: since the fail-caution fix, a
  // missing shard (fetch 404) means "unverified" and keeps the hit at warn —
  // only a fetched shard that omits the domain proves the 40-bit
  // false-positive and downgrades to no-hit. So its shard always gets a
  // decoy entry (unless it already shares a byte with a real shard, whose
  // content omits it anyway).
  fs.writeFileSync(path.join(FEED_DIR, `exact-${shardHex(blockHash)}.jsonl.gz`),
    buildShardGz([{ d: BLOCK_DOMAIN, s: ['Phishing.Database', 'HaGeZi Threat-Intelligence-Feeds (medium)'] }]));
  fs.writeFileSync(path.join(FEED_DIR, `exact-${shardHex(warnHash)}.jsonl.gz`),
    buildShardGz([{ d: WARN_DOMAIN, s: ['ScamSniffer'] }]));
  if (shardHex(fpHash) !== shardHex(blockHash) && shardHex(fpHash) !== shardHex(warnHash)) {
    fs.writeFileSync(path.join(FEED_DIR, `exact-${shardHex(fpHash)}.jsonl.gz`),
      buildShardGz([{ d: 'decoy-not-the-fp-domain.example', s: ['Phishing.Database'] }]));
  }

  // risk.json (Task B3): abused-TLD weight table + dyndns/hoster hash32 sets.
  const risk = {
    tlds: { '.riskfixturetld': 8 },
    dyndns: [hash32For(RISK_DYNDNS_DOMAIN)],
    hosters: [hash32For(RISK_HOSTER_DOMAIN)]
  };
  fs.writeFileSync(path.join(FEED_DIR, 'risk.json'), JSON.stringify(risk));

  // nrd.bloom (Task C3): both fixture domains are inserted so they test
  // positive; NRD_ESTABLISHED_DOMAIN's own suppression comes from a
  // pre-seeded storage.local firstSeen entry (set per-test, since context is
  // fresh per test), not from being absent here.
  const nrdBloomBuf = buildNrdBloomFixture([NRD_DOMAIN, NRD_ESTABLISHED_DOMAIN], 0.01);
  fs.writeFileSync(path.join(FEED_DIR, 'nrd.bloom'), nrdBloomBuf);

  const meta = {
    version: '1',
    generatedAt: new Date().toISOString(),
    counts: { block: 2, warn: 1, total: 3 },
    sha256: { set40: sha256Hex(set40), deltaFromPrev: null },
    prev: null,
    urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL },
    ttlHours: 6,
    nrd: { file: 'nrd.bloom', sha256: sha256Hex(nrdBloomBuf), n: 2, mBits: nrdOptimalParams(2, 0.01).mBits, k: nrdOptimalParams(2, 0.01).k, windowDays: 14 }
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

test('a block hit whose exact shard is unavailable fails toward caution: warn, unverified, no negative cache', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  // No exact-<byte>.jsonl.gz exists for this domain → the shard fetch 404s.
  // That is NOT proof of a 40-bit false positive, so the hit must surface at
  // warn tier instead of silently passing — and must not be negative-cached.
  const result = await sw.evaluate((host) => checkFeedHost(host), UNVERIFIED_DOMAIN);
  expect(result).toEqual({ hit: 'warn', sources: [], unverified: true });
  const again = await sw.evaluate((host) => checkFeedHost(host), UNVERIFIED_DOMAIN);
  expect(again).toEqual({ hit: 'warn', sources: [], unverified: true });
  const page = await context.newPage();
  await page.goto(`http://${UNVERIFIED_DOMAIN}:5599/`);
  const banner = page.locator('.scamshield-banner.suspicious');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
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

// --- risk.json: abused-TLD weight table + dyndns/hoster membership (Task B3) ---

test('the feed OTA cycle also installs risk.json and mirrors its TLD table into settings', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const r = await installFeed(sw);
  expect(r.ok).toBe(true);
  const settings = await sw.evaluate(() => getSettings());
  expect(settings.riskTlds).toEqual({ '.riskfixturetld': 8 });
});

test('checkRiskHosting reports dyndns and hoster membership by hashed registrable domain', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const dyndnsHit = await sw.evaluate((host) => checkRiskHosting(host), RISK_DYNDNS_DOMAIN);
  expect(dyndnsHit).toEqual({ hit: 'dyndns' });
  // A subdomain of the dyndns fixture domain still matches on its
  // REGISTRABLE domain, exactly like the feed's full-hostname matcher would
  // not (dyndns/hosters are a coarser, provider-level signal by design).
  const subHit = await sw.evaluate((host) => checkRiskHosting(host), 'dyndns-subdomain.' + RISK_DYNDNS_DOMAIN);
  expect(subHit).toEqual({ hit: 'dyndns' });
  const hosterHit = await sw.evaluate((host) => checkRiskHosting(host), RISK_HOSTER_DOMAIN);
  expect(hosterHit).toEqual({ hit: 'hoster' });
  const cleanHit = await sw.evaluate((host) => checkRiskHosting(host), 'clean-feed-fixture.example');
  expect(cleanHit).toEqual({ hit: null });
});

test('a dyndns-listed host gets suspicious-tier evidence, not an interstitial', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`http://${RISK_DYNDNS_DOMAIN}:5599/clean.html`);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  const banner = page.locator('.scamshield-banner.suspicious');
  await expect(banner).toBeVisible({ timeout: 8000 });
});

test('an abused-TLD host (risk.json tlds table) gets suspicious-tier evidence via scoreUrl', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw); // populates settings.riskTlds, which content_script.js passes into scoreUrl()
  const page = await context.newPage();
  await page.goto(`http://${RISK_TLD_HOST}:5599/clean.html`);
  await expect(page.locator('.scamshield-banner.suspicious')).toBeVisible({ timeout: 8000 });
});

// --- nrd.bloom "new site" signal (0.10.0, Task C3) --------------------------

test('the feed OTA cycle also installs nrd.bloom', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const r = await installFeed(sw);
  expect(r.ok).toBe(true);
  expect(r.nrdUpdated).toBe(true);
  // A second cycle against the same (unchanged) meta.json is a no-op.
  const again = await installFeed(sw);
  expect(again.updated).toBe(false);
});

test('checkNrd reports a bloom hit and strengthens on a genuine first visit', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const result = await sw.evaluate((host) => checkNrdHost(host), NRD_DOMAIN);
  expect(result.hit).toBe(true);
  expect(result.strengthen).toBe(true);
  // A second check for the same host in the same install is no longer a
  // "first visit" — the reason must not strengthen again.
  const second = await sw.evaluate((host) => checkNrdHost(host), NRD_DOMAIN);
  expect(second.hit).toBe(true);
  expect(second.strengthen).toBe(false);
});

test('checkNrd reports no hit for a clean (non-bloom-listed) host', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const result = await sw.evaluate((host) => checkNrdHost(host), 'clean-feed-fixture.example');
  expect(result).toEqual({ hit: false });
});

test('an NRD-listed, first-time-visited domain gets a suspicious evidence chip with the strengthened wording', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`http://${NRD_DOMAIN}:5599/clean.html`);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0); // never escalates past suspicious alone
  const banner = page.locator('.scamshield-banner.suspicious');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner.locator('.ss-text span').first()).toContainText(/newly-registered-domains/i);
  await expect(banner.locator('.ss-text span').first()).toContainText(/never visited it before/i);
});

test('a clean domain (no nrd.bloom hit) gets no evidence chip', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto('http://clean-feed-fixture.example:5599/clean.html');
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('a domain seen locally for 30+ days suppresses the NRD signal even though it still tests bloom-positive', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  // Pre-seed storage.local's firstSeen ring as if this install first saw the
  // domain 40 days ago — "it's been fine for a month".
  const hostHash = nrdHostHash(NRD_ESTABLISHED_DOMAIN);
  const fortyDaysAgo = Date.now() - 40 * 24 * 3600 * 1000;
  await sw.evaluate(([key, ts]) => chrome.storage.local.set({ firstSeen: [[key, ts]] }), [hostHash, fortyDaysAgo]);

  const result = await sw.evaluate((host) => checkNrdHost(host), NRD_ESTABLISHED_DOMAIN);
  expect(result).toEqual({ hit: false, suppressed: 'establishedLocally' });

  const page = await context.newPage();
  await page.goto(`http://${NRD_ESTABLISHED_DOMAIN}:5599/clean.html`);
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});
