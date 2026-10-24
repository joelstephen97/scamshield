// tests/e2e/exfil.spec.js — credential exfil to a Telegram bot / Discord webhook (0.15.0).
// api.telegram.org, discord.com and discordapp.com are host-mapped onto the local https fixture server
// (tools/lib/ext-launch.js HOST_RULES); every request is counted through the server's /hits log, and NOTHING reaches
// the real services.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

const HITS = 'http://localhost:5599/hits';
const botHits = async (hostPart) => (await (await fetch(HITS)).json()).filter((h) => h.host.startsWith(hostPart));
const resetHits = () => fetch('http://localhost:5599/hits/reset');
const surfaceKinds = (sw) => sw.evaluate(async () => ((await chrome.storage.local.get('surfaceLog')).surfaceLog || []).map((r) => r.kind));

async function isolatedRead(context, page, expression) {
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  await new Promise((r) => setTimeout(r, 300));
  const c = ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
  if (!c) return null;
  return cdp.send('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true }).then((r) => r.result.value).catch(() => null);
}

async function loadKit(context, qs, file) {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  await resetHits();
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/' + (file || 'exfil-kit.html') + (qs || ''));
  return { sw, page };
}
async function typeAndSend(page) {
  await page.fill('#email', 'victim@example.com');
  await page.fill('#password', 'hunter2-Secret!');
  await page.click('#go');
}

test('(a) static: the kit page warns on load with credential-exfil; fetch of the typed login is blocked with the stop interstitial', async ({ context, extensionId }) => {
  const { sw, page } = await loadKit(context);
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-banner')).toContainText('Telegram');
  const verdict = await isolatedRead(context, page, 'JSON.parse(JSON.stringify({ f: window.__ssLastVerdict.flags, t: window.__ssLastTier, c: window.__ssLastVerdict.reasonCodes }))');
  expect(verdict.t).toBe('warn');
  expect(verdict.f).toContain('credential-exfil');
  expect(verdict.c).toContain('credentialExfilScript');
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0); // the static signal alone is warn-tier
  await typeAndSend(page);
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.scamshield-interstitial')).toContainText(/Telegram\W+bot/);
  await expect(page.locator('#out')).toHaveText('failed');
  await page.waitForTimeout(500);
  expect((await botHits('api.telegram.org')).length).toBe(0);
  await expect.poll(() => surfaceKinds(sw)).toContain('exfil-blocked');
  // The popup's source of truth: ask the worker from an extension page (a worker cannot message itself).
  const tabId = await sw.evaluate(async () => { const t = (await chrome.tabs.query({})).find((x) => (x.url || '').includes('exfil-kit.html')); return t.id; });
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extensionId}/options.html`);
  const findings = await opt.evaluate((id) => new Promise((res) => chrome.runtime.sendMessage({ type: 'getPrivacyFindings', tabId: id }, res)), tabId);
  expect(JSON.stringify(findings)).toContain('credential-exfil');
});

test('(b) the same page over XHR (what jQuery $.ajax does): blocked, error + loadend fire, 0 hits', async ({ context }) => {
  const { page } = await loadKit(context, '?via=xhr');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await typeAndSend(page);
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#out')).toHaveText('failed');
  expect(await page.evaluate(() => window.__xhrError === true)).toBe(true);
  await page.waitForTimeout(500);
  expect((await botHits('api.telegram.org')).length).toBe(0);
});

test('(b2) sendBeacon is blocked too', async ({ context }) => {
  const { page } = await loadKit(context, '?via=beacon');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await typeAndSend(page);
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#out')).toHaveText('failed');
  await page.waitForTimeout(500);
  expect((await botHits('api.telegram.org')).length).toBe(0);
});

test('(b3) a Discord webhook is blocked the same way and named in the stop page', async ({ context }) => {
  const { page } = await loadKit(context, '', 'exfil-kit-discord.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.scamshield-banner')).toContainText('Discord');
  await typeAndSend(page);
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.scamshield-interstitial')).toContainText(/Discord\W+bot/);
  await page.waitForTimeout(500);
  expect((await botHits('discord.com')).length).toBe(0);
});

for (const via of ['fetch', 'xhr', 'beacon']) test(`(c) a contact form with no password that messages a Telegram bot (${via}): no surface, the request goes out`, async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  await resetHits();
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/exfil-contact-benign.html?via=' + via);
  await page.waitForTimeout(2500);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await page.fill('#name', 'Sam');
  await page.fill('#msg', 'Is the blue one in stock?');
  await page.click('#go');
  await expect(page.locator('#out')).toHaveText('sent');
  await expect.poll(async () => (await botHits('api.telegram.org')).length).toBe(1);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  expect(await surfaceKinds(sw)).toEqual([]);
});

test('(d) a password form whose script posts to its own origin: no surface', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  await resetHits();
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/exfil-same-origin.html');
  await page.waitForTimeout(2500);
  await page.fill('#email', 'victim@example.com');
  await page.fill('#pw', 'hunter2-Secret!');
  await page.click('#go');
  await expect(page.locator('#out')).toHaveText('sent');
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  expect(await surfaceKinds(sw)).toEqual([]);
  expect((await botHits('api.telegram.org')).length).toBe(0);
});

test('(e) a bot request that carries no typed secret on a page with a password field is NOT cancelled', async ({ context }) => {
  const { page } = await loadKit(context, '?send=nosecret');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 }); // the static warning still stands
  await typeAndSend(page);
  await expect(page.locator('#out')).toHaveText('sent');
  await expect.poll(async () => (await botHits('api.telegram.org')).length).toBe(1);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
});

test('(f) a trusted site is not exempt: a typed password still cannot leave for a bot', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: Object.assign({}, cur, { allowlist: ['localhost'] }) });
  });
  try {
    const { page } = await loadKit(context);
    await page.waitForTimeout(2500);
    await expect(page.locator('.scamshield-banner')).toHaveCount(0); // trusted: no page warning
    await typeAndSend(page);
    await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 5000 });
    expect((await botHits('api.telegram.org')).length).toBe(0);
  } finally {
    await sw.evaluate(async () => {
      const cur = (await chrome.storage.local.get('settings')).settings || {};
      await chrome.storage.local.set({ settings: Object.assign({}, cur, { allowlist: [] }) });
    });
  }
});

test('(g) a typed 123456 is not matched against chat_id: a chat widget on a page with a password field goes out (1 hit)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  await resetHits();
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/exfil-widget-pw.html');
  await page.waitForTimeout(2500);
  await page.fill('#pw', '123456');
  await page.click('#chat');
  await expect(page.locator('#out')).toHaveText('sent');
  await expect.poll(async () => (await botHits('api.telegram.org')).length).toBe(1);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  expect(await surfaceKinds(sw)).toEqual([]);
});

test('(h) a login form plus an order-notification script that posts location.href to a bot: no banner (static flag needs an input read)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog'));
  await resetHits();
  const page = await context.newPage();
  await page.goto(BASE_HTTPS + '/exfil-order-notify.html');
  await page.waitForTimeout(2500);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect.poll(async () => (await botHits('api.telegram.org')).length).toBe(1);
  expect(await surfaceKinds(sw)).toEqual([]);
});
