// tests/e2e/blocked-page.spec.js — network-level block page (0.12.0).
//
// A main-frame navigation to a domain on the dynamic block rules must land on
// blocked.html#<original url> (a declarativeNetRequest redirect rule, see
// engine/dnr_rules.js), count once toward threatsBlocked / the stats ring /
// history, and offer a real way through: "Visit anyway" pauses the site for
// an hour AND installs a network allow rule, so the next load actually loads.
// block-feed-fixture.example is mapped to 127.0.0.1 by tests/e2e/fixtures.js.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const HOST = 'block-feed-fixture.example';
const URL = `http://${HOST}:5599/clean.html`;

async function installBlock(context) {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async (h) => { await applyNetworkRules(['||' + h + '^'], true); }, HOST);
  return sw;
}

test('a blocked domain opens the ScamShield block page with the original URL, and counts once', async ({ context, extensionId }) => {
  const sw = await installBlock(context);
  const page = await context.newPage();
  await page.goto(URL + '?q=1&r=2', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('^chrome-extension://' + extensionId + '/blocked\\.html#'));
  expect(decodeURIComponent(page.url().split('#')[1])).toBe(URL + '?q=1&r=2');
  await expect(page.locator('h1')).toContainText('blocked this site');
  await expect(page.locator('#url')).toHaveText(URL + '?q=1&r=2');
  await expect(page.locator('#lead')).toContainText(HOST);
  await expect.poll(() => sw.evaluate(() => getSettings().then((s) => s.threatsBlocked)), { timeout: 5000 }).toBe(1);
  const hist = await sw.evaluate(async () => (await chrome.storage.local.get('history')).history);
  expect(hist[0]).toMatchObject({ host: HOST, kind: 'blocklist', level: 'dangerous' });
  const byType = await sw.evaluate(async () => (await chrome.storage.local.get('threatsByType')).threatsByType);
  expect(byType.phishing).toBe(1);
  // A reload of the block page is the same catch, not a second one.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  expect(await sw.evaluate(() => getSettings().then((s) => s.threatsBlocked))).toBe(1);
  // The rescue link carries the host for a false-positive report.
  expect(await page.locator('#mistake').getAttribute('href')).toContain(encodeURIComponent('False positive: ' + HOST));
});

test('"Visit anyway" pauses the site for an hour, installs a network allow rule, and the site then loads', async ({ context, extensionId }) => {
  const sw = await installBlock(context);
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/blocked\.html#/);
  await page.click('#visit');
  await page.waitForURL(URL, { timeout: 10000 });
  await expect(page.locator('body')).not.toContainText('blocked this site');
  const s = await sw.evaluate(() => getSettings());
  expect(s.pausedSites[HOST]).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  const allow = rules.find((r) => r.action.type === 'allow' && r.condition.urlFilter === '||' + HOST + '^');
  expect(allow).toBeTruthy();
  expect(allow.priority).toBe(3);
  // Popup on the now-loaded page shows the pause, same as a popup-initiated one.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`); await page.bringToFront(); await popup.reload();
  await expect(popup.locator('body')).toContainText(/Paused until/i);
  // Unpausing removes the allow rule and the block page comes back.
  await sw.evaluate((h) => setSettings({ pausedSites: {} }), HOST);
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((rs) => rs.filter((r) => r.action.type === 'allow').length)), { timeout: 5000 }).toBe(0);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/blocked\.html#/);
});

test('turning "block known scam sites" off removes the dynamic block + redirect rules; on brings them back', async ({ context }) => {
  const sw = await installBlock(context);
  const page = await context.newPage();
  await sw.evaluate(() => setSettings({ blockKnownBad: false }));
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((rs) => rs.length)), { timeout: 5000 }).toBe(0);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(URL);
  await sw.evaluate(() => setSettings({ blockKnownBad: true }));
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((rs) => rs.some((r) => r.action.type === 'redirect'))), { timeout: 5000 }).toBe(true);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/blocked\.html#/);
});

test('the packaged static ruleset domains are covered by the redirect rules on boot', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await expect.poll(() => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules().then((rs) => {
    const red = rs.filter((r) => r.action.type === 'redirect');
    return red.some((r) => r.condition.requestDomains.includes('scamshield-test-blocked.example'));
  })), { timeout: 8000 }).toBe(true);
});
