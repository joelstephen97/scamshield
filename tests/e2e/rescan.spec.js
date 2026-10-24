// tests/e2e/rescan.spec.js — mid-scroll rescan (0.15.0, Task 17b). A scam signal that appears AFTER load (a password
// field revealed by "Next", a dialog) triggers a debounced re-run of the DOM scoring. It may only ESCALATE:
// an ordinary page whose sign-in dialog opens late gets nothing, and a dismissed warning is not shown again.
// Fixture pages only. The kit pages sit on plain localhost, so the password field is the ONLY thing that makes them dangerous.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

const KIT = 'http://localhost:5599';
const LOOKALIKE = 'http://secure-paypa1-login.com:5599';
const BASE = 'https://localhost:5600';

async function extReader(context, page, expressions) {
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  return async () => {
    const ext = ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
    if (!ext) return {};
    const out = {};
    for (const [k, expression] of Object.entries(expressions)) {
      out[k] = await cdp.send('Runtime.evaluate', { expression, contextId: ext.id, returnByValue: true }).then((r) => r.result.value);
    }
    return out;
  };
}
const VARS = { tier: 'window.__ssLastTier', rescans: 'window.__ssRescanStats && window.__ssRescanStats.rescans' };

test('multi-step kit: no warning until the password field appears after "Next", then the warn banner shows', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(KIT + '/rescan-multistep.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await page.click('#next');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  const v = await read();
  expect(['warn', 'stop']).toContain(v.tier);
  expect(v.rescans).toBe(1);
});

test('the login step is an open shadow root: its password field still escalates the page', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(KIT + '/rescan-shadow.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await page.click('#next');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
});

test('canary for escalate-only: an ordinary site whose sign-in dialog opens late gets a rescan and no warning', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  await page.click('#open');
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBe(1); // the rescan really ran...
  await page.waitForTimeout(800);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);                    // ...and added nothing
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  expect((await read()).tier).toBe('quiet');
});

const LATE_DIALOG = () => {
  const d = document.createElement('dialog');
  d.innerHTML = '<input type="password" placeholder="Password">';
  document.body.appendChild(d); d.show();
};
const badgeOf = async (sw, urlPart) => {
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => (t.url || '').includes(urlPart)).pop();
  return sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tab.id);
};

test('an explicit pause ("Hide for an hour") is respected: a later rescan runs, shows nothing and leaves the badge alone', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(LOOKALIKE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await page.locator('.scamshield-banner .ss-x').click(); // storable host: this pauses the site
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect.poll(() => sw.evaluate(async () => Object.keys((await getSettings()).pausedSites || {}).length), { timeout: 5000 }).toBeGreaterThan(0);
  const before = await badgeOf(sw, 'phishing-login.html');
  // Spy: any badge write after this point would be a verdict report from the rescan.
  await sw.evaluate(() => { globalThis.__badgeCalls = []; const o = chrome.action.setBadgeText.bind(chrome.action); chrome.action.setBadgeText = (a, ...r) => { globalThis.__badgeCalls.push(a); return o(a, ...r); }; });
  await page.evaluate(LATE_DIALOG);
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBeGreaterThanOrEqual(1); // the rescan ran...
  await page.waitForTimeout(1500);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);       // ...showed nothing
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  expect(await badgeOf(sw, 'phishing-login.html')).toBe(before);          // ...and reported no 'safe' downgrade
  expect(await sw.evaluate(() => globalThis.__badgeCalls)).toEqual([]);   // (no badge write at all)
});

// A bare tenant apex (pages.dev) cannot store a pause, so the X only dismisses this page: the one path where "dismissed" is
// page-local state. A non-escalating late trigger must not bring the banner back; a jump to 'stop' still shows its interstitial.
test('dismissed (not paused) warn: a late dialog does not re-show it, a late seed-phrase field still escalates to the stop interstitial', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto('https://pages.dev:5600/phishing-login.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await page.locator('.scamshield-banner .ss-x').click();
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await page.evaluate(LATE_DIALOG);
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<h1>Restore your wallet</h1><p>Enter your 12-word recovery phrase below to validate your wallet and claim your bonus.</p><form><textarea name="phrase" rows="3" placeholder="recovery phrase words separated by spaces"></textarea><button type="submit">Validate</button></form>';
    document.body.appendChild(d);
  });
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 10000 });
  expect((await read()).tier).toBe('stop');
});

test('iframe-only triggers have their own small cap and do not spend the 5-per-page budget', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, { rescans: 'window.__ssRescanStats.rescans' });
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).rescans, { timeout: 8000 }).toBe(0);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { const f = document.createElement('iframe'); f.width = 320; f.height = 320; f.srcdoc = '<p>x</p>'; document.body.appendChild(f); });
    await page.waitForTimeout(3300);
  }
  expect((await read()).rescans).toBeLessThanOrEqual(2);
  // a dialog afterwards still gets its rescan
  await page.evaluate(() => { const d = document.createElement('dialog'); d.innerHTML = '<input name="q">'; document.body.appendChild(d); d.show(); });
  await expect.poll(async () => (await read()).rescans, { timeout: 6000 }).toBeGreaterThan(2 - 1);
});

test('limits: a flood of triggers causes at most 5 rescans and none closer than 3 s', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => { const d = document.createElement('dialog'); d.innerHTML = '<input name="q">'; document.body.appendChild(d); d.show(); });
    await page.waitForTimeout(700);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const n = (await read()).rescans;
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(5);
  expect(n).toBeLessThanOrEqual(Math.floor(elapsed / 3) + 1); // at most one per 3 s
});

// 0.15.0 final fix B4: rescan cost.
test('a dialog with no input, frame or scam wording (a cookie notice) is not a rescan trigger; one with an input is', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  await page.evaluate(() => { const d = document.createElement('dialog'); d.innerHTML = '<p>We use cookies to improve your experience.</p><button>OK</button>'; document.body.appendChild(d); d.show(); });
  await page.waitForTimeout(1500);
  expect((await read()).rescans).toBe(0);
  await page.evaluate(() => { const d = document.createElement('dialog'); d.innerHTML = '<input name="email">'; document.body.appendChild(d); d.show(); });
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBe(1);
});

test('a reveal by inline style (display:none -> block) still triggers the rescan', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'step'; d.style.display = 'none'; d.innerHTML = '<input type="password" name="pw">'; document.body.appendChild(d); });
  await page.waitForTimeout(1200);
  expect((await read()).rescans).toBe(0);                       // hidden: nothing to look at yet
  await page.evaluate(() => { document.getElementById('step').style.display = 'block'; });
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBe(1);
});
