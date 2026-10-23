// tests/e2e/hard-benign-2.spec.js — DOM-signal precision (0.15.0, Task 4).
//
// Four ordinary pages the pre-0.15.0 DOM signals flagged or greyed out:
//   social-feed        "Contact now" / "You won't believe" matched "act now" / "you won"
//                      by substring, and the content hider then greyed the posts out;
//   footer-social-login footer aria-labels + a display:none login modal read as a
//                      brand impersonating a login page;
//   js-action-login    action="javascript:void(0)" was treated as a foreign domain;
//   ssh-tutorial       "private key" + any comment textarea raised the seed-phrase
//                      interstitial.
// Each fixture is hand-written. The canaries (scam-giveaway, seed-phrase, brand
// lookalike) live in detection.spec.js and must keep firing.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

async function verdictFor(sw, urlPart) {
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => (t.url || '').includes(urlPart)).pop();
  expect(tab, `no tab for ${urlPart}`).toBeTruthy();
  return sw.evaluate((id) => chrome.storage.session.get('verdict:' + id).then((s) => s['verdict:' + id]), tab.id);
}

async function openQuiet(context, file) {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(`${BASE_HTTPS}/hard-benign/${file}`);
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForTimeout(4000); // initial score + DOM-settle pass + SW round trips
  const v = await verdictFor(sw, file);
  expect(!v || v.level === 'safe', `verdict ${v && v.level}: ${JSON.stringify(v && v.reasonCodes)}`).toBe(true);
  for (const sel of ['.scamshield-banner', '.scamshield-overlay', '.scamshield-interstitial', '[class*="scamshield-hidden"]']) {
    expect(await page.$(sel), sel).toBeNull();
  }
  return page;
}

test('social feed chatter ("Contact now", "You won\'t believe", a short promo) stays silent and nothing is hidden', async ({ context }) => {
  await openQuiet(context, 'social-feed.html');
});

test('footer social aria-labels plus a hidden login modal stay quiet', async ({ context }) => {
  await openQuiet(context, 'footer-social-login.html');
});

test('a javascript: form action is same-page: no submit guard, verdict safe', async ({ context }) => {
  const page = await openQuiet(context, 'js-action-login.html');
  await page.fill('input[name="pin"]', 'hunter2');
  await page.click('button[type="submit"]');
  await expect(page.locator('#done')).toHaveText('submitted');
  await page.waitForTimeout(800);
  expect(await page.$('.scamshield-overlay')).toBeNull();
});

test('an SSH tutorial with a comment textarea gets no interstitial', async ({ context }) => {
  await openQuiet(context, 'ssh-tutorial.html');
});

// --- URL- and page-type precision (0.15.0, Task 5) ---
test('a bot-challenge page ("unusual activity" + hidden frame) is silent', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await openQuiet(context, 'challenge.html');
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => (t.url || '').includes('challenge.html')).pop();
  expect(await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tab.id)).toBe('');
});

test('a news article with "virus detected" on Windows and a phone number gets no overlay', async ({ context }) => {
  await openQuiet(context, 'windows-virus-news.html');
});

test('a news article about a Chrome update linking to its own site gets no interstitial', async ({ context }) => {
  await openQuiet(context, 'chrome-update-news.html');
});

test('google.com.sa (a brand regional site) shows no banner and an empty badge', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto('https://www.google.com.sa/hard-benign/search-regional.html');
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForTimeout(4000);
  for (const sel of ['.scamshield-banner', '.scamshield-overlay', '.scamshield-interstitial']) expect(await page.$(sel), sel).toBeNull();
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => (t.url || '').includes('www.google.com.sa')).pop();
  expect(await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tab.id)).toBe('');
  const v = await verdictFor(sw, 'www.google.com.sa');
  expect(!v || v.level === 'safe', `verdict ${v && v.level}: ${JSON.stringify(v && v.reasonCodes)}`).toBe(true);
});

test('a user-content host of a safe registrable (sites.google.com) is still checked: tech-scam overlay shows', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('http://sites.google.com:5599/techscam.html');
  await expect(page.locator('.scamshield-overlay')).toBeVisible({ timeout: 10000 });
});
