// tests/e2e/hard-benign.spec.js — the 2026-09-06 benchmark false positives
// stay silent (0.13.0, Task 12).
//
// Three shapes that the pre-0.13.0 engine flagged on a real benign-site
// sweep, each reduced to the minimum that reproduces the signal:
//   www.hdfc.bank.in / www.icici.bank.in — an Indian bank on the RBI's
//     licence-vetted .bank.in namespace, showing its own brand name next to
//     a password form: the brand-lookalike shape, on a domain that IS the
//     brand (Task 4/5: verified namespaces + brand-owned registrables).
//   www.doi.org — an old, plain HTTPS page that tests positive in the
//     newly-registered-domains Bloom filter (a genuine ~1% Bloom collision).
//     NRD evidence alone must no longer banner (Task 7); the assertion below
//     proves the *gate*, not merely the absence of a hit, by checking
//     checkNrdHost() actually reports a bloom hit first.
//
// The pages under tests/e2e/pages/hard-benign/ are hand-authored minimal
// look-alikes — no markup, CSS, images or text copied from the real sites.
//
// Served over HTTPS (:5600, the self-signed fixtures cert) so scoreUrl's own
// noHttps rule contributes nothing, and mapped port-and-all by
// tests/e2e/fixtures.js's --host-resolver-rules so the URL under test carries
// no port either — a benign page must be quiet at the URL a real user types.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A private feed-fixtures subdirectory: runFeedUpdate() always fetches
// 'nrd.bloom' (and set40.bin/warn40.bin/risk.json) relative to meta.urls, so
// a second, independent bloom fixture needs its own base URL rather than a
// second filename. Keeping it out of feed-fixtures/ proper also means this
// spec and feed.spec.js can never clobber each other's fixtures whatever
// order they run in.
const FEED_DIR = path.join(__dirname, 'feed-fixtures', 'hard-benign');
const FEED_BASE_URL = 'http://localhost:5599/feed/hard-benign/';

const DOI_HOST = 'www.doi.org';

// Same index derivation as engine/bloom.js (mirrored from feed.spec.js, which
// documents the on-the-wire NRDB format this builds).
function bloomParams(n, p) {
  const m = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const mBits = Math.max(8, Math.ceil(m / 8) * 8);
  let k = Math.max(1, Math.round((mBits / n) * Math.LN2));
  if (k > 7) k = 7;
  return { mBits, k };
}
function bloomIndices(digest, k, mBits) {
  const h1 = digest.readUInt32BE(0);
  let h2 = digest.readUInt32BE(4);
  if (h2 === 0) h2 = 1;
  const out = [];
  for (let i = 0; i < k; i++) out.push((h1 + i * h2) % mBits);
  return out;
}
function buildNrdBloomFixture(hosts, p) {
  const n = hosts.length;
  const { mBits, k } = bloomParams(n, p);
  const bits = Buffer.alloc(Math.ceil(mBits / 8));
  for (const h of hosts) {
    const digest = crypto.createHash('sha256').update(h, 'utf8').digest();
    for (const idx of bloomIndices(digest, k, mBits)) bits[idx >> 3] |= 1 << (7 - (idx & 7));
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

test.beforeAll(() => {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  // Both the hostname and its registrable domain: checkNrdHost() tests either
  // digest, and this fixture must model "doi.org is in the NRD bloom" the way
  // the live collision actually presented.
  const hosts = [DOI_HOST, 'doi.org'];
  const bloom = buildNrdBloomFixture(hosts, 0.01);
  fs.writeFileSync(path.join(FEED_DIR, 'nrd.bloom'), bloom);
  const { mBits, k } = bloomParams(hosts.length, 0.01);
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify({
    version: 'hard-benign-1',
    generatedAt: new Date().toISOString(),
    counts: { block: 0, warn: 0, total: 0 },
    // No set40.bin/warn40.bin/risk.json in this directory: those fetches 404
    // and are skipped, leaving nrd.bloom as the only thing installed — which
    // is exactly the scenario ("nothing but an NRD hit") under test.
    sha256: {},
    prev: null,
    urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL },
    ttlHours: 6,
    nrd: { file: 'nrd.bloom', sha256: crypto.createHash('sha256').update(bloom).digest('hex'), n: hosts.length, mBits, k, windowDays: 14 }
  }));
});

async function verdictForUrl(sw, url) {
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => t.url === url).pop();
  expect(tab, `no tab found for ${url}`).toBeTruthy();
  return sw.evaluate((id) => chrome.storage.session.get('verdict:' + id).then((s) => s['verdict:' + id]), tab.id);
}

async function expectQuiet(context, url) {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(url);
  // The fixture really rendered (a failed navigation would otherwise make
  // every "no banner" assertion below pass vacuously).
  await expect(page.locator('h1')).toBeVisible();
  // The content script scores on load and again after its DOM-settle pass;
  // 4s covers both plus the SW round trips they make.
  await page.waitForTimeout(4000);
  expect(await page.$('.scamshield-banner')).toBeNull();
  expect(await page.$('.scamshield-overlay')).toBeNull();
  expect(await page.$('.scamshield-interstitial')).toBeNull();
  const v = await verdictForUrl(sw, url);
  expect(!v || v.level === 'safe', `verdict was ${v && v.level}: ${JSON.stringify(v && v.reasonCodes)}`).toBe(true);
  return page;
}

for (const [host, file] of [['www.hdfc.bank.in', 'hdfc-bank-in.html'], ['www.icici.bank.in', 'icici-bank-in.html']]) {
  test(`a bank on its own licence-vetted .bank.in domain shows no warning (${host})`, async ({ context }) => {
    await expectQuiet(context, `https://${host}/hard-benign/${file}`);
  });
}

test(`an old plain page that collides in the NRD bloom shows no warning (${DOI_HOST})`, async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const feed = await sw.evaluate((u) => runFeedUpdate(u), FEED_BASE_URL + 'meta.json');
  expect(feed.ok).toBe(true);
  expect(feed.nrdUpdated).toBe(true);
  // Prove the gate: the host really IS a bloom hit, so the silence below is
  // "NRD evidence alone can't banner", not "there was nothing to report".
  const nrd = await sw.evaluate((h) => checkNrdHost(h), DOI_HOST);
  expect(nrd.hit).toBe(true);
  await expectQuiet(context, `https://${DOI_HOST}/hard-benign/doi-org.html`);
});
