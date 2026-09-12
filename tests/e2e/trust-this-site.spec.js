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
const { test, openMore } = require('./fixtures');
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
  // The trust button ignores any click within 300ms of render (fix round 1,
  // anti-synthetic-click arming — see the dedicated test below); wait past it
  // before this real, intentional click.
  await page.waitForTimeout(350);
  await openMore(page.locator('.scamshield-banner'));
  await page.locator('.scamshield-banner .ss-trust').click();
  await expect(page.locator('.scamshield-ack')).toContainText(/won't flag/i);
  // Fix round 1: Trust's onAllow tears down the menu's document-level
  // keydown/click listeners (bar.__ssTeardown) before bar.remove(). Escape
  // here must be inert — no stale listener left registered to react to it —
  // and must not disturb the acknowledgement bar that replaced the banner.
  await page.keyboard.press('Escape');
  await expect(page.locator('.scamshield-ack')).toContainText(/won't flag/i);
  const s1 = await sw.evaluate(() => getSettings());
  expect(s1.allowlist).toContain(HOST);
  expect(s1.allowlistMeta[HOST].via).toBe('banner');
  // In a full-batch run an earlier spec can leave the one-time support toast
  // on screen; it is bottom-anchored and lands on top of the acknowledgement's
  // Undo button, so Playwright's actionability check reports the toast's own
  // dismiss (.ss-x) button as intercepting the click. Clear it with a real
  // click and wait for it to detach, then click Undo normally — `force: true`
  // would bypass the very trusted-click path this suite exists to prove.
  // (0.14.0, Task 4: supportToast now refuses to render at all while an
  // acknowledgement is on screen, so this should be a no-op — kept defensive.)
  // Fix round 1: the ack bar itself now also carries the `scamshield-toast`
  // class (so it keeps the shared .ss-title/.ss-acts styling) — scope this
  // locator to :not(.scamshield-ack) so it can never target the ack's own
  // ✕ and rip out the Undo bar we're about to click.
  const toast = page.locator('.scamshield-toast:not(.scamshield-ack)');
  const toastX = toast.locator('.ss-x');
  if (await toastX.first().isVisible().catch(() => false)) {
    await toastX.first().click();
    await expect(toast).toHaveCount(0);
  }
  await page.locator('.scamshield-ack .ss-undo').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(false);
});

test('banner: synthetic (untrusted) clicks on Trust this site do nothing, even after the arm delay; a real click still works', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BANNER_URL);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  // Wait past the trust button's 300ms arm delay first, so these synthetic
  // clicks are proven to be rejected by the event.isTrusted check itself —
  // not merely still inside the arm window. A scam page's own script can run
  // .click() or dispatch a MouseEvent on the injected button the instant it
  // renders; neither is a real user gesture, so both must be no-ops.
  await page.waitForTimeout(400);
  // Real click on ⋯ opens the menu (the trust button now lives there); the
  // synthetic events below then target that now-visible menu item. The
  // arming guard lives on the trust button itself, not the menu, so opening
  // the menu with a real click changes nothing about what's under test.
  await page.locator('.scamshield-banner .ss-more').click();
  await page.evaluate(() => document.querySelector('.scamshield-banner .ss-trust').click());
  await page.evaluate(() => {
    document.querySelector('.scamshield-banner .ss-trust').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(200); // let a wrongly-fired async trust round trip settle, if any
  expect((await sw.evaluate(() => getSettings())).allowlist).not.toContain(HOST);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible();
  await expect(page.locator('.scamshield-ack')).toHaveCount(0);
  // A real click — Playwright's locator.click() drives it via CDP input
  // simulation, which sets isTrusted:true, same as a genuine user click —
  // still works normally, once past the arm delay that opening the ⋯ menu
  // re-started (0.14.0 final review: the trust button re-arms on menu open).
  await page.waitForTimeout(350);
  await page.locator('.scamshield-banner .ss-trust').click();
  await expect(page.locator('.scamshield-ack')).toContainText(/won't flag/i);
  expect((await sw.evaluate(() => getSettings())).allowlist).toContain(HOST);
});

test('blocked.html: Trust this site -> allow rule wins over the hot rule and the site loads', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  // The SW's own cold-boot sequence (ensureNetworkRules, fired fire-and-
  // forget at module top level) runs its own applyHotRules(undefined)
  // against whatever hotList happens to be in storage — on a brand-new
  // persistent context that's null, so it installs an EMPTY hot-rule set.
  // applyHotRules calls are serialized (hotApplyChain, fix round 1) so they
  // can no longer collide on dynamic-rule ids, but that alone doesn't order
  // them: without waiting for boot first, this test's own applyHotRules call
  // below could still get queued (and win) BEFORE boot's later one, which
  // would then silently overwrite it with the empty set. awaitBootReady()
  // deterministically waits for the whole cold-boot sequence — including its
  // hot apply — to finish, so this test's own call is guaranteed to be
  // queued after it and is the one that sticks. No fixed timeout needed.
  await sw.evaluate(() => awaitBootReady());
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
