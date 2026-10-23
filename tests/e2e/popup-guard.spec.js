// tests/e2e/popup-guard.spec.js - page-level popup / redirect interception (0.15.0, Task 16).
// A page cannot open a site ScamShield already knows as blocked, and on a warned page popunders and forced
// fullscreen are suppressed. The feed is a fixture (as in linkguard.spec.js); fixture pages only.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Blockset = require('../../engine/blockset');

const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const FEED_BASE_URL = 'http://localhost:5599/feed/';
const SENTINEL = 'scamshield-test-blocked.example';
const BASE = 'http://localhost:5599';
const OK_URL = 'http://127.0.0.1:5599/clean.html';

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
  const warn40 = buildRecords([hash40For('popupguard-unused-warn.example')]);
  fs.writeFileSync(path.join(FEED_DIR, 'set40.bin'), set40);
  fs.writeFileSync(path.join(FEED_DIR, 'warn40.bin'), warn40);
  fs.writeFileSync(path.join(FEED_DIR, 'risk.json'), JSON.stringify({ tlds: {}, dyndns: [], hosters: [] }));
  const meta = {
    version: 'popupguard-' + Date.now() + '-' + (seq++), generatedAt: new Date().toISOString(),
    counts: { block: blockDomains.length, warn: 1, total: blockDomains.length + 1 },
    sha256: { set40: crypto.createHash('sha256').update(set40).digest('hex'), deltaFromPrev: null },
    prev: null, urls: { cdn: FEED_BASE_URL, fallback: FEED_BASE_URL }, ttlHours: 6
  };
  fs.writeFileSync(path.join(FEED_DIR, 'meta.json'), JSON.stringify(meta));
  await sw.evaluate((url) => runFeedUpdate(url), FEED_BASE_URL + 'meta.json');
}
const toast = (page) => page.locator('.scamshield-toast', { hasText: 'stopped this page from opening a blocked site' });
const tryOpen = (page, url) => page.evaluate((u) => { const w = window.open(u, '_blank'); return w === null ? 'null' : 'window'; }, url);

test('window.open to a host that is already cached as blocked is refused and toasts; the first try is allowed and queues the lookup', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(BASE + '/popup-guard.html');
  // First attempt: the host is unknown, so it is allowed (DNR is the gate) and one lookup is queued.
  expect(await tryOpen(page, 'http://' + SENTINEL + '/first')).toBe('window');
  // Once the lookup lands, the same open is refused with null.
  await expect.poll(() => tryOpen(page, 'http://' + SENTINEL + '/again'), { timeout: 8000 }).toBe('null');
  await expect(toast(page)).toBeVisible();
  const log = await sw.evaluate(() => chrome.storage.local.get(null).then((all) => JSON.stringify(all)));
  expect(log).toContain('popup-block');
});

test('an anchor with target=_blank to a cached blocked host is not script-clicked open', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(BASE + '/popup-guard.html');
  await expect.poll(() => tryOpen(page, 'http://' + SENTINEL + '/prime'), { timeout: 8000 }).toBe('null');
  let opened = 0;
  context.on('page', () => { opened++; });
  await page.evaluate(() => document.getElementById('anchor').click());
  await page.waitForTimeout(700);
  expect(opened).toBe(0);
});

test('a benign page can still window.open an ordinary site, with a gesture and without (positive canary)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await installFeed(sw, [SENTINEL]);
  const page = await context.newPage();
  await page.goto(BASE + '/popup-guard.html');
  await page.waitForTimeout(1500);
  expect(await tryOpen(page, OK_URL)).toBe('window');
  await page.click('#open-ok');
  await expect(page).toHaveTitle('opened');
  await expect(toast(page)).toHaveCount(0);
});

test('a benign page can enter fullscreen from a click (canary for the warned-page suppression)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/popup-guard.html');
  await page.waitForTimeout(1000);
  await page.click('#fs');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement), { timeout: 4000 }).toBe(true);
});

test('on a warned page a no-gesture window.open is refused, a clicked one works, and fullscreen is a no-op', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/popup-guard-warn.html');
  await expect(page.locator('.scamshield-banner, .scamshield-interstitial').first()).toBeVisible({ timeout: 8000 });
  // Popunder from a page timer. Playwright's own polling evaluates with a user gesture, which would hand the
  // page transient activation, so stay silent until the timer (6.5 s after load) has fired, then look once.
  await page.waitForTimeout(7500);
  await expect(page.locator('body')).toHaveAttribute('data-auto', 'refused');
  await expect(toast(page)).toBeVisible({ timeout: 4000 });
  await page.click('#open-ok');                                 // a real click carries activation: a user's open
  await expect(page).toHaveTitle('opened');
  await page.click('#fs');                                      // forced fullscreen never enters on a warned page
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
