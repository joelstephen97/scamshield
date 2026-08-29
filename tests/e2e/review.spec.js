const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const DAY = 24 * 3600 * 1000;
const BASE = 'http://localhost:5599';

// Same pattern popup.spec.js's openPopup() uses: bringing the content page
// and then the popup to front (and reloading the popup) is what makes
// tabs.query({active, currentWindow}) reliably resolve to the content tab
// rather than whichever tab Playwright's context.newPage() happened to open.
async function openPopupOn(context, extensionId, page) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  return popup;
}

// Earned review ask (0.7.0): the popup shows a quiet ask-card only once a
// profile has both a real 2nd block and a week-old install. Seeded directly
// in storage.local via the SW (like stats.spec.js does for installedAt)
// rather than actually causing two real blocks — the eligibility predicate
// itself is unit-tested in tests/unit/review.test.js; this only checks the
// popup wiring end to end.
async function seedEligible(sw) {
  // ensureInstalledAt() runs both at SW boot and (set-if-absent, so normally
  // harmless) again inside the onInstalled handler that fires when a fresh
  // profile first loads the unpacked extension. Flushing it once here first
  // guarantees that onInstalled-triggered call has landed before this test
  // overwrites installedAt directly — otherwise it can race in and clobber
  // the seeded 8-day-old value back to "now" after this function returns.
  await sw.evaluate(() => ensureInstalledAt());
  await sw.evaluate((eightDaysAgo) => Promise.all([
    chrome.storage.local.set({ installedAt: eightDaysAgo }),
    setSettings({ threatsBlocked: 2 })
  ]), Date.now() - 8 * DAY);
}

test('earned review ask: shows after the 2nd block + 7-day install, with the count in the text; No thanks hides it permanently', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await seedEligible(sw);

  const popup1 = await context.newPage();
  await popup1.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup1.locator('#askcard')).toBeVisible();
  await expect(popup1.locator('#askbody')).toContainText('2');

  await popup1.click('#askno');
  await expect(popup1.locator('#askcard')).toBeHidden();

  // Reopen: still gone, and storage records the permanent decline.
  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup2.locator('#askcard')).toBeHidden();
  const ra = await sw.evaluate(() => getReviewAsk());
  expect(ra.state).toBe('declined');
});

test('earned review ask: Maybe later snoozes ~90 days, hides the card, and stays hidden on reopen', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await seedEligible(sw);
  const before = Date.now();

  const popup1 = await context.newPage();
  await popup1.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup1.locator('#askcard')).toBeVisible();

  await popup1.click('#asklater');
  await expect(popup1.locator('#askcard')).toBeHidden();

  const ra = await sw.evaluate(() => getReviewAsk());
  expect(ra.state).toBe('snoozed');
  expect(ra.asks).toBe(1);
  const ninetyDays = 90 * DAY;
  // Range check (not exact-equal) to absorb the little wall-clock drift
  // between "before" and the SW's own Date.now() when it wrote snoozeUntil.
  expect(ra.snoozeUntil).toBeGreaterThanOrEqual(before + ninetyDays - 5000);
  expect(ra.snoozeUntil).toBeLessThanOrEqual(Date.now() + ninetyDays + 5000);

  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup2.locator('#askcard')).toBeHidden();
});

test('earned review ask: Rate Parry opens the CWS review tab and never shows the card again', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await seedEligible(sw);

  const popup1 = await context.newPage();
  await popup1.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup1.locator('#askcard')).toBeVisible();

  const [reviewTab] = await Promise.all([context.waitForEvent('page'), popup1.click('#askrate')]);
  await reviewTab.waitForLoadState('domcontentloaded').catch(() => {});
  // CWS 302-redirects detail/<id> to detail/<name-slug>/<id> — assert the
  // host, the real extension id, and the /reviews tab rather than the exact
  // path we linked to.
  expect(new URL(reviewTab.url()).hostname).toBe('chromewebstore.google.com');
  expect(reviewTab.url()).toContain('fojjjofjimbfoddafoampojopijnlihl/reviews');
  await expect(popup1.locator('#askcard')).toBeHidden();

  const ra = await sw.evaluate(() => getReviewAsk());
  expect(ra.state).toBe('rated');

  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup2.locator('#askcard')).toBeHidden();
});

test('earned review ask: suppressed under an active dangerous warning; shows once the same eligible profile opens the popup on a clean page', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await seedEligible(sw);

  const bad = await context.newPage();
  await bad.goto(BASE + '/phishing-login.html');
  await expect(bad.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const popupOnBad = await openPopupOn(context, extensionId, bad);
  await expect(popupOnBad.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  // Never "please review us" beneath an active warning, even though this
  // profile is otherwise eligible.
  await expect(popupOnBad.locator('#askcard')).toBeHidden();

  const clean = await context.newPage();
  await clean.goto(BASE + '/clean.html');
  await clean.waitForTimeout(500);
  const popupOnClean = await openPopupOn(context, extensionId, clean);
  await expect(popupOnClean.locator('#status')).toHaveClass(/safe/);
  await expect(popupOnClean.locator('#askcard')).toBeVisible();
});

test('a fresh install with no real blocks never shows the ask-card', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#askcard')).toBeHidden();
});

test('Options → About: the review link is present, points at the CWS review tab, and sets nothing', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#about`);
  const link = page.locator('#reviewaboutlink');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /chromewebstore\.google\.com\/detail\/fojjjofjimbfoddafoampojopijnlihl\/reviews/);
  await expect(link).toHaveAttribute('target', '_blank');
  const ra = await sw.evaluate(() => getReviewAsk());
  expect(ra.state).toBe('pending'); // link is a plain always-there channel — clicking wires nothing
});

test('exportSettings includes reviewAsk; importSettings restores it (real message round trip)', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setReviewAsk('no'));

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const exported = await page.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'exportSettings' }, res)));
  expect(exported.reviewAsk.state).toBe('declined');

  // Reset to pending, then import the exported payload back through the real
  // message handler — the decline is restored, not lost or re-asked.
  await sw.evaluate(() => chrome.storage.local.set({ reviewAsk: { state: 'pending', snoozeUntil: 0, asks: 0 } }));
  const imported = await page.evaluate((data) => new Promise((res) => chrome.runtime.sendMessage({ type: 'importSettings', data }, res)), exported);
  expect(imported.ok).toBe(true);
  expect((await sw.evaluate(() => getReviewAsk())).state).toBe('declined');
});

test('importSettings clamps a runaway snoozeUntil to a 90-day ceiling', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // A hand-edited/corrupt export claiming a snooze 10 years out.
  const tenYearsOut = Date.now() + 10 * 365 * DAY;
  const data = { schema: 1, settings: {}, reviewAsk: { state: 'snoozed', snoozeUntil: tenYearsOut, asks: 1 } };
  const before = Date.now();
  const imported = await page.evaluate((d) => new Promise((res) => chrome.runtime.sendMessage({ type: 'importSettings', data: d }, res)), data);
  expect(imported.ok).toBe(true);

  const ra = await sw.evaluate(() => getReviewAsk());
  expect(ra.state).toBe('snoozed');
  const ninetyDayCeiling = before + 90 * DAY;
  expect(ra.snoozeUntil).toBeLessThanOrEqual(ninetyDayCeiling + 5000);
  expect(ra.snoozeUntil).toBeLessThan(tenYearsOut);
});
