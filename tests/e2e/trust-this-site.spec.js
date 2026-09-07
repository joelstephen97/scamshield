// tests/e2e/trust-this-site.spec.js — one-click trust on every warning
// surface, with undo and an origin tag (0.13.0, Task 11).
//
// Rewritten against the real fixture API (tests/e2e/fixtures.js only exports
// { test, EXTENSION_PATH, BASE_HTTPS } — no `sw`/`fixtureUrl`/`extUrl`
// fixtures exist), following the pattern already used by
// blocked-page.spec.js (context.serviceWorkers()[0], hand-built fixture
// URLs) and options.spec.js (chrome-extension://<id>/options.html#<tab>).
//
// secure-paypa1-login.com + phishing-login.html is the same danger-banner
// fixture copy-report.spec.js and detection.spec.js already use (mapped to
// 127.0.0.1 by fixtures.js). hot-fixture.example is newly mapped there too
// (Step 1 of the brief) for the block-page/hot-list flow.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

const HOST = 'secure-paypa1-login.com';
const BANNER_URL = `http://${HOST}:5599/phishing-login.html`;
const HOT_HOST = 'hot-fixture.example';
const HOT_URL = `http://${HOT_HOST}:5599/`; // server.js serves clean.html at '/'

test('banner: Trust this site -> allowlisted, acknowledgement with Undo restores', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.locator('.scamshield-banner .ss-trust').click();
  await expect(page.locator('.scamshield-ack')).toContainText(/won't flag/i);
  const s1 = await sw.evaluate(() => getSettings());
  expect(s1.allowlist).toContain(HOST);
  expect(s1.allowlistMeta[HOST].via).toBe('banner');
  await page.locator('.scamshield-ack .ss-undo').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(false);
});

test('blocked.html: Trust this site -> allow rule wins over the hot rule and the site loads', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  // The SW's own cold-boot sequence (ensureNetworkRules, called fire-and-
  // forget at module top level) runs its own applyHotRules(undefined) against
  // whatever hotList happens to be in storage — on a brand-new persistent
  // context that's null, so it installs an EMPTY hot-rule set. If that boot
  // call resolves after the one below, it clobbers hotHostSet right back to
  // empty. Give it a moment to settle first; it does no network I/O (reads
  // storage.local + one declarativeNetRequest call), so this is generous.
  await new Promise((r) => setTimeout(r, 500));
  await sw.evaluate(async () => {
    await applyHotRules({
      v: 1, generatedAt: Date.now(), ttlMinutes: 60,
      domains: [{ h: 'hot-fixture.example', s: 'pd', t: Math.floor(Date.now() / 60000) }],
      paths: [], removed: []
    });
  });
  const page = await context.newPage();
  await page.goto(HOT_URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/blocked\.html/);
  // The hot-tier lead copy differs from the daily-feed/static-ruleset one.
  await expect(page.locator('#lead')).toContainText(/reported for phishing/i, { timeout: 8000 });
  await page.click('#trust');
  await page.waitForURL(new RegExp(HOT_HOST.replace(/\./g, '\\.')), { timeout: 10000 });
  await expect(page.locator('body')).not.toContainText('blocked this site');
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlist).toContain(HOT_HOST);
  expect(s.allowlistMeta[HOT_HOST].via).toBe('blocked');
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  expect(rules.some((r) => r.id >= 400000 && r.id < 600000 && (r.condition.requestDomains || []).includes(HOT_HOST))).toBe(false);
});

test('options: trusted-via-warning tag and one-click remove', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({
    allowlist: ['hot-fixture.example'],
    allowlistMeta: { 'hot-fixture.example': { via: 'blocked', at: Date.now() } }
  }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#trusted`);
  await expect(page.locator('[data-domain="hot-fixture.example"] .tag')).toHaveText(/trusted via warning/i);
  await page.locator('[data-domain="hot-fixture.example"] .remove').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes('hot-fixture.example'), { timeout: 5000 }).toBe(false);
});
