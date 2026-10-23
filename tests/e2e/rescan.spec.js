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

test('a warning dismissed on this page is not shown again by a later rescan', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(LOOKALIKE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await page.locator('.scamshield-banner .ss-x').click();
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  // A late dialog with a password field triggers a rescan.
  await page.evaluate(() => {
    const d = document.createElement('dialog');
    d.innerHTML = '<input type="password" placeholder="Password">';
    document.body.appendChild(d); d.show();
  });
  await expect.poll(async () => (await read()).rescans, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('limits: a flood of triggers causes at most 5 rescans and none closer than 3 s', async ({ context }) => {
  const page = await context.newPage();
  const read = await extReader(context, page, VARS);
  await page.goto(BASE + '/rescan-benign-dialog.html');
  await expect.poll(async () => (await read()).tier, { timeout: 8000 }).toBe('quiet');
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => { const d = document.createElement('dialog'); document.body.appendChild(d); d.show(); });
    await page.waitForTimeout(700);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const n = (await read()).rescans;
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(5);
  expect(n).toBeLessThanOrEqual(Math.floor(elapsed / 3) + 1); // at most one per 3 s
});
