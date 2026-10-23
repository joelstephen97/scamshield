// tests/e2e/doctrine.spec.js — SW side of the 0.15.0 warning doctrine: badge follows the tier,
// sub-frames stay silent, and the per-site interruption budget caps banners.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

const BASE = 'http://localhost:5599';

async function badge(sw, urlPart) {
  return sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => (t.url || '').includes(u));
    return tab ? chrome.action.getBadgeText({ tabId: tab.id }) : null;
  }, urlPart);
}
const quietSites = (sw) => sw.evaluate(async () => (await chrome.storage.local.get('quietSites')).quietSites || {});

test('a non-stop verdict inside a sub-frame leaves the badge empty and the tab verdict untouched', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/iframe-phish.html'); // the frame holds a dangerous (warn-tier) login form
  await page.waitForTimeout(2500);
  expect(await badge(sw, 'iframe-phish.html')).toBe('');
  const h = await sw.evaluate(async () => (await chrome.storage.local.get('history')).history || []);
  expect(h.length).toBe(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('a quiet top-frame verdict gives an empty badge (no more "?")', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/content-suspicious.html');
  await page.waitForTimeout(2500);
  expect(await badge(sw, 'content-suspicious.html')).toBe('');
  // quiet verdicts are not logged as threats
  const h = await sw.evaluate(async () => (await chrome.storage.local.get('history')).history || []);
  expect(h.length).toBe(0);
});

test('a warn page shows the banner once per day; a reload keeps the badge but no banner', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  expect(await badge(sw, 'phishing-login.html')).toBe('!');
  await page.reload();
  await page.waitForTimeout(2000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  expect(await badge(sw, 'phishing-login.html')).toBe('!');
});

test('two dismissals make the site quiet for 30 days, even on a later day', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  const dismiss = async () => {
    await page.goto(BASE + '/phishing-login.html');
    await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
    await page.locator('.scamshield-banner .ss-x').click();
    await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  };
  // the ✕ also pauses the site; clear that and move "yesterday" so only the budget gates the banner
  const nextDay = () => sw.evaluate(async () => {
    await setSettings({ pausedSites: {} });
    const { quietSites = {} } = await chrome.storage.local.get('quietSites');
    for (const k of Object.keys(quietSites)) quietSites[k].lastWarnAt -= 25 * 3600e3;
    await chrome.storage.local.set({ quietSites });
  });
  await dismiss();
  expect((await quietSites(sw)).localhost.dismissals).toBe(1);
  await nextDay();
  await dismiss();
  const q = (await quietSites(sw)).localhost;
  expect(q.dismissals).toBe(0);
  expect(q.quietUntil).toBeGreaterThan(Date.now() + 29 * 24 * 3600e3);
  await nextDay();
  await page.goto(BASE + '/phishing-login.html');
  await page.waitForTimeout(2000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  expect(await badge(sw, 'phishing-login.html')).toBe('!');
  // unquietSite brings it back
  const ext = await context.newPage(); await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  expect(Object.keys(await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'getQuietSites' })))).toEqual(['localhost']);
  await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'unquietSite', domain: 'localhost' }));
  expect(Object.keys(await quietSites(sw))).toHaveLength(0);
});

test('a stop page (clickfix) always interrupts, budget or not', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ quietSites: { localhost: { dismissals: 0, lastWarnAt: Date.now(), quietUntil: Date.now() + 1e9 } } }));
  const page = await context.newPage();
  await page.goto(BASE + '/clickfix.html');
  await expect(page.locator('.scamshield-interstitial, .scamshield-overlay').first()).toBeVisible({ timeout: 8000 });
  expect(await badge(sw, 'clickfix.html')).toBe('!');
});
