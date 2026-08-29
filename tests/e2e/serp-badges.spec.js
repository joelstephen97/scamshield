// tests/e2e/serp-badges.spec.js — per-result SERP safety badges (0.10.0,
// Task C1). Extends the existing sponsored-mismatch SERP fixture
// (tests/e2e/pages/serp.html) rather than building a parallel one: the same
// page now carries two badge-target result links, addressable via ?block=
// and ?warn= query params, plus an optional ?lateinject=1 result added after
// a delay to exercise the MutationObserver path.
//
// Reuses the v0.9 feed pipeline exactly like tests/e2e/feed.spec.js does
// (engine/blockset.js is Node-requireable, and the SW's runFeedUpdate()
// takes a metaUrl override so it never needs to reach GitHub/jsDelivr) —
// this file just needs its own block/warn domains and set40.bin/warn40.bin,
// no exact-shard fixtures at all, because checkFeedBatch (background/
// service_worker.js) is hash-set membership ONLY, never an exact-shard
// fetch: a badge is advisory, not an interstitial.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Blockset = require('../../engine/blockset');

const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = 'http://localhost:5599/feed/';
const SERP_URL = BASE_HTTPS.replace('localhost', 'www.google.com') + '/serp.html';

const BLOCK_DOMAIN = 'serp-badge-block-fixture.example';
const WARN_DOMAIN = 'serp-badge-warn-fixture.example';
// Task C6 (0.10.0): risk.json abused-TLD + dyndns/hoster "combo" — no feed
// hit at all, only risk-table evidence. See background/service_worker.js
// checkFeedBatchHosts()'s combo branch and the FP-hardening doctrine this
// task implements: risk-table-class evidence may only ever badge amber
// ("caution"), never red ("danger").
const RISK_DOMAIN = 'serp-badge-risk-fixture.riskfixturetld';

function hash40For(domain) {
  const digest = crypto.createHash('sha256').update(domain).digest();
  return Blockset.hash40FromBytes(digest);
}
// Top 32 bits of SHA-256(domain) — risk.json's dyndns/hosters encoding
// (engine/risk_rules.js hash32FromBytes()), same as tests/e2e/feed.spec.js.
function hash32For(domain) {
  const digest = crypto.createHash('sha256').update(domain).digest();
  return digest.readUInt32BE(0);
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
function sha256Hex(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

test.beforeAll(() => {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  const set40 = buildRecords([hash40For(BLOCK_DOMAIN)]);
  const warn40 = buildRecords([hash40For(WARN_DOMAIN)]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);
  // Overwrites whatever tests/e2e/feed.spec.js's own beforeAll left in the
  // shared feed-fixtures/ dir — this spec needs its own deterministic
  // risk.json, keyed to RISK_DOMAIN, not feed.spec.js's fixture domains.
  const risk = { tlds: { '.riskfixturetld': 8 }, dyndns: [], hosters: [hash32For(RISK_DOMAIN)] };
  fs.writeFileSync(path.join(FEED_DIR, 'risk.json'), JSON.stringify(risk));
  const meta = {
    version: 'serp-badges-1',
    generatedAt: new Date().toISOString(),
    counts: { block: 1, warn: 1, total: 2 },
    sha256: { set40: sha256Hex(set40), deltaFromPrev: null },
    prev: null,
    urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL },
    ttlHours: 6
  };
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify(meta));
});

async function installFeed(sw) {
  return sw.evaluate((url) => runFeedUpdate(url), FEED_BASE_URL + 'meta.json');
}

test('a block-set organic result gets a red (danger) badge, a warn-set one gets amber (caution), a clean one gets none', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`${SERP_URL}?block=${BLOCK_DOMAIN}&warn=${WARN_DOMAIN}`);

  const blockBadge = page.locator('#badge-block-result .scamshield-serp-badge');
  await expect(blockBadge).toBeVisible({ timeout: 8000 });
  await expect(blockBadge).toHaveClass(/scamshield-serp-badge-danger/);

  const warnBadge = page.locator('#badge-warn-result .scamshield-serp-badge');
  await expect(warnBadge).toBeVisible({ timeout: 8000 });
  await expect(warnBadge).toHaveClass(/scamshield-serp-badge-caution/);

  // The clean Wikipedia organic result (already in the fixture) never gets a
  // badge — absence is the default state, no green checkmark noise.
  const wikiResult = page.locator('.g', { hasText: 'Notepad++ - Wikipedia' });
  await expect(wikiResult.locator('.scamshield-serp-badge')).toHaveCount(0);

  await expect(page.locator('.scamshield-serp-badge')).toHaveCount(2);
});

test('a result injected after the initial scan (infinite scroll) still gets badged, via the MutationObserver', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`${SERP_URL}?block=${BLOCK_DOMAIN}&lateinject=1`);
  // Before the fixture's setTimeout(1200ms) fires, the late result doesn't exist yet.
  await expect(page.locator('#badge-late-result')).toHaveCount(0);
  const lateBadge = page.locator('#badge-late-result .scamshield-serp-badge');
  await expect(lateBadge).toBeVisible({ timeout: 8000 });
  await expect(lateBadge).toHaveClass(/scamshield-serp-badge-danger/);
});

test('a risk.json abused-TLD+hoster combo result (no feed hit) gets an amber (caution) badge, never red (Task C6)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  const page = await context.newPage();
  await page.goto(`${SERP_URL}?risk=${RISK_DOMAIN}`);
  const riskBadge = page.locator('#badge-risk-result .scamshield-serp-badge');
  await expect(riskBadge).toBeVisible({ timeout: 8000 });
  await expect(riskBadge).toHaveClass(/scamshield-serp-badge-caution/);
  await expect(riskBadge).not.toHaveClass(/scamshield-serp-badge-danger/);
});

test('turning serpCheck off suppresses all per-result badges', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw);
  await sw.evaluate(() => setSettings({ serpCheck: false }));
  const page = await context.newPage();
  await page.goto(`${SERP_URL}?block=${BLOCK_DOMAIN}&warn=${WARN_DOMAIN}`);
  await page.waitForTimeout(1500);
  await expect(page.locator('.scamshield-serp-badge')).toHaveCount(0);
  // The existing ad-mismatch chip is gated by the same toggle — confirms
  // this test actually exercised the shared serpCheck gate, not a fluke.
  await expect(page.locator('.scamshield-serp')).toHaveCount(0);
  await sw.evaluate(() => setSettings({ serpCheck: true }));
});
