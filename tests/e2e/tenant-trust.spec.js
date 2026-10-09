// tests/e2e/tenant-trust.spec.js — trust / pause on a shared-hosting tenant is
// scoped to that tenant host, never the whole apex (0.14.1, Task 6).
//
// Host mapping: tests/e2e/fixtures.js maps a.pages.dev, b.pages.dev and
// c.pages.dev to 127.0.0.1 via --host-resolver-rules. .dev is HSTS-preloaded,
// so plain http://*.pages.dev would be upgraded to https; the specs go to the
// HTTPS fixture listener (:5600, self-signed cert accepted by
// --ignore-certificate-errors) directly. phishing-login.html raises the
// danger banner on any host, tenant or not.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const url = (host, page) => `https://${host}:5600/${page || 'phishing-login.html'}`;
const FEED_DIR = path.join(__dirname, 'feed-fixtures');
const minNow = () => Math.floor(Date.now() / 60000);

function writeHot(name, domains) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
  fs.writeFileSync(path.join(FEED_DIR, name), JSON.stringify({
    v: 1, generatedAt: Date.now(), ttlMinutes: 1440,
    domains: domains.map((h) => ({ h, s: 'pd', t: minNow() })), paths: [], removed: []
  }));
  return 'http://localhost:5599/feed/' + name;
}
const allowFilters = (sw) => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules())
  .filter((r) => r.id >= 300000 && r.id < 400000).map((r) => r.condition.urlFilter));

test('Trust this site on a.pages.dev trusts only a.pages.dev: b.pages.dev still warns, no apex allow rule', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  const a = await context.newPage();
  await a.goto(url('a.pages.dev'));
  await expect(a.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await a.waitForTimeout(350);
  await a.locator('.scamshield-banner .ss-more').click();
  await a.waitForTimeout(350);
  await a.locator('.scamshield-banner .ss-trust').click();
  await expect(a.locator('.scamshield-ack')).toContainText('a.pages.dev');
  const s = await sw.evaluate(() => getSettings());
  expect(s.allowlist).toContain('a.pages.dev');
  expect(s.allowlist).not.toContain('pages.dev');
  await expect.poll(() => allowFilters(sw)).toContain('||a.pages.dev^');
  expect(await allowFilters(sw)).not.toContain('||pages.dev^');

  // Reload a: trusted, silent. Sibling tenant b: still warns.
  await a.reload();
  await a.waitForTimeout(2000);
  await expect(a.locator('.scamshield-banner')).toHaveCount(0);
  const b = await context.newPage();
  await b.goto(url('b.pages.dev'));
  await expect(b.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await sw.evaluate(() => removeTrust('a.pages.dev'));
});

test('a hot-listed c.pages.dev is still redirected to blocked.html while a.pages.dev is trusted', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  await sw.evaluate(() => addTrust('a.pages.dev', 'test'));
  const r = await sw.evaluate((u) => runHotUpdate(u), writeHot('hot-tenant.json', ['c.pages.dev', 'a.pages.dev']));
  expect(r.ok).toBe(true);
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  const hotHosts = rules.filter((x) => x.id >= 400000 && x.id < 500000).flatMap((x) => x.condition.requestDomains || []);
  expect(hotHosts).toContain('c.pages.dev');
  expect(hotHosts).not.toContain('a.pages.dev');   // the trusted tenant itself is exempt
  const page = await context.newPage();
  await page.goto(url('c.pages.dev', 'clean.html'), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('^chrome-extension://' + extensionId + '/blocked\.html#'));
  await sw.evaluate(() => removeTrust('a.pages.dev'));
});

test('a legacy bare pages.dev allowlist entry is kept (page warnings stay quiet) but gets no network allow rule and shows the options badge', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => awaitBootReady());
  await sw.evaluate(() => setSettings({ allowlist: ['pages.dev'] }));
  expect(await allowFilters(sw)).not.toContain('||pages.dev^');
  expect((await sw.evaluate(() => getSettings())).allowlist).toContain('pages.dev');
  const page = await context.newPage();
  await page.goto(url('b.pages.dev'));
  await page.waitForTimeout(2500);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);

  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(opts.locator('#allowlist li[data-domain="pages.dev"] [data-tenant-apex]')).toContainText('pages.dev');
  await sw.evaluate(() => setSettings({ allowlist: [] }));
});
