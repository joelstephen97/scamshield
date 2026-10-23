// tests/e2e/hard-benign-pack.spec.js — the 0.15.0 hard-benign pack: ONE release gate (Task 9).
//
// Every page below is an ordinary page that a pre-0.15.0 build interrupted (or whose sub-frames
// leaked a verdict into the toolbar badge). For each one the gate asserts, after the visit:
//   - no in-page surface: banner, overlay, interstitial, toast, hidden/greyed block;
//   - the top tab's toolbar badge is '';
//   - the content script's last tier is 'quiet' (window.__ssLastTier, read from the isolated world);
//   - the local surfaceLog (Task 8) has no rows for the visit.
// The canary block at the bottom loads five known-positive fixtures and asserts each STILL produces
// its surface, so a gate that goes quiet because detection broke cannot pass.
// The per-task benign cases in hard-benign-2.spec.js / quiet-toasts.spec.js are kept (their canaries
// live beside them); this file is the single place that must stay green for the release.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

const HB = `${BASE_HTTPS}/hard-benign`;
// [name, url, optional interaction run after the initial settle]
const BENIGN = [
  ['social-feed', `${HB}/social-feed.html`],
  ['footer-social-login', `${HB}/footer-social-login.html`],
  ['js-action-login', `${HB}/js-action-login.html`, async (p) => {
    await p.fill('input[name="pin"]', 'hunter2'); await p.click('button[type="submit"]');
    await expect(p.locator('#done')).toHaveText('submitted');
  }],
  ['ssh-tutorial', `${HB}/ssh-tutorial.html`],
  ['challenge', `${HB}/challenge.html`],
  ['windows-virus-news', `${HB}/windows-virus-news.html`],
  ['chrome-update-news', `${HB}/chrome-update-news.html`],
  ['powershell-docs', `${HB}/powershell-docs.html`, async (p) => {
    await p.click('#copy'); await expect(p.locator('#done')).toHaveText('Copied');
  }],
  ['scoop-install', `${HB}/scoop-install.html`, async (p) => {
    await p.click('#copy'); await expect(p.locator('#done')).toHaveText('Copied');
  }],
  ['shop-bank-transfer', `${HB}/shop-bank-transfer.html`],
  ['regional-google (www.google.com.sa)', 'https://www.google.com.sa/hard-benign/search-regional.html'],
  ['news-with-ads', `${HB}/news-with-ads.html`],
  ['captcha-iframe', `${HB}/captcha-iframe.html`],
];

// PRIMARY signal is the empty surfaceLog below: it records every surface the content script raises
// whatever DOM it uses (shadow host or not). These selectors are the belt-and-braces DOM check; each
// class is real: banner/toast are built in content/actions.js, overlay/hidden-block in content_script.js,
// interstitial is covered by the canaries (same selector must show for a real scam).
const SURFACES = ['.scamshield-banner', '.scamshield-overlay', '.scamshield-interstitial', '.scamshield-toast', '[class*="scamshield-hidden"]'];

// Reads a global from the extension's isolated world (content scripts) over CDP, as expectQuietSuspicious does.
async function openWithIsolatedReader(context, page, url) {
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto(url);
  // Pages with sub-frames have one isolated world per frame: read the TOP frame's.
  const top = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
  return async (expression) => {
    const c = ctxs.find((x) => x.auxData && x.auxData.frameId === top && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
    return c ? cdp.send('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true }).then((r) => r.result.value).catch(() => null) : null;
  };
}
async function tabIdFor(sw, url) {
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => t.url === url).pop();
  expect(tab, `no tab for ${url}`).toBeTruthy();
  return tab.id;
}

for (const [name, url, act] of BENIGN) {
  test(`hard-benign: ${name} is completely quiet (no surface, badge empty, tier quiet, surfaceLog empty)`, async ({ context }) => {
    const sw = context.serviceWorkers()[0];
    await sw.evaluate(() => awaitBootReady());
    await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
    const page = await context.newPage();
    const read = await openWithIsolatedReader(context, page, url);
    await expect(page.locator('h1')).toBeVisible(); // the fixture really rendered
    await page.bringToFront();
    await page.waitForTimeout(2500); // initial score + DOM-settle pass + SW round trips
    if (act) await act(page);
    await page.waitForTimeout(2000);
    // tier: quiet (a safe verdict is quiet too). A null here would mean the script never scored the page.
    await expect.poll(() => read('window.__ssLastTier'), { timeout: 8000 }).toBe('quiet');
    await page.waitForTimeout(1500); // final settle: a late rescan / toast must not slip past
    expect(await read('window.__ssLastTier')).toBe('quiet');
    for (const sel of SURFACES) await expect(page.locator(sel), sel).toHaveCount(0);
    const tabId = await tabIdFor(sw, url);
    expect(await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');
    const rows = await sw.evaluate(() => readSurfaceLog());
    expect(rows, 'surfaceLog rows: ' + JSON.stringify(rows)).toEqual([]);
    await page.close();
  });
}

// --- Mutation pass (Task 17b): reveal hidden login/frames AFTER load -----------------------------
// The mid-scroll rescan must never add a false positive. Each page below hides a login modal / verification frame;
// a script reveals it after load (which fires the rescan trigger) and the page must stay completely quiet.
const REVEAL = [
  ['footer-social-login: hidden login modal revealed', `${HB}/footer-social-login.html`,
    () => { const m = document.getElementById('login-modal'); m.style.display = 'block'; m.style.position = 'fixed'; m.style.inset = '0'; m.style.background = '#fff'; }],
  ['challenge: hidden verification frame revealed', `${HB}/challenge.html`,
    () => { const f = document.querySelector('iframe'); f.style.display = 'block'; f.width = 400; f.height = 400; }],
  ['news-with-ads: hidden tracking frame revealed', `${HB}/news-with-ads.html`,
    () => { const f = document.querySelector('iframe[style*="display:none"]'); f.style.display = 'block'; f.width = 400; f.height = 400; }],
];
for (const [name, url, reveal] of REVEAL) {
  test(`hard-benign mutation: ${name} stays quiet (rescan ran, no surface, badge empty)`, async ({ context }) => {
    const sw = context.serviceWorkers()[0];
    await sw.evaluate(() => awaitBootReady());
    await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
    const page = await context.newPage();
    const read = await openWithIsolatedReader(context, page, url);
    await expect(page.locator('h1')).toBeVisible();
    await page.bringToFront();
    await page.waitForTimeout(2500);
    await expect.poll(() => read('window.__ssLastTier'), { timeout: 8000 }).toBe('quiet');
    await page.evaluate(reveal);
    await expect.poll(() => read('window.__ssRescanStats && window.__ssRescanStats.rescans'), { timeout: 6000 }).toBeGreaterThanOrEqual(1); // it really rescanned
    await page.waitForTimeout(2000);
    expect(await read('window.__ssLastTier')).toBe('quiet');
    for (const sel of SURFACES) await expect(page.locator(sel), sel).toHaveCount(0);
    const tabId = await tabIdFor(sw, url);
    expect(await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');
    const rows = await sw.evaluate(() => readSurfaceLog());
    expect(rows, 'surfaceLog rows: ' + JSON.stringify(rows)).toEqual([]);
    await page.close();
  });
}

// --- Canaries: the doctrine must not have silenced real scams ---------------------------------
const BASE = 'http://localhost:5599';

test('canary: a feed-blocked host still lands on the block page', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const host = 'block-feed-fixture.example';
  await sw.evaluate(async (h) => { await applyNetworkRules(['||' + h + '^'], true); }, host);
  const page = await context.newPage();
  await page.goto(`http://${host}:5599/clean.html`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('^chrome-extension://' + extensionId + '/blocked\.html#'));
});

test('canary: a brand-impersonating page with a visible login still shows the danger banner', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('http://secure-paypa1-login.com:5599/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
});

test('canary: a seed-phrase grid still gets the interstitial', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/seed-phrase.html');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('canary: a ClickFix fake-CAPTCHA page still gets the interstitial', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clickfix.html');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('canary: a tenant-hosted brand login (a.pages.dev) still shows the danger banner', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://a.pages.dev:5600/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
});
