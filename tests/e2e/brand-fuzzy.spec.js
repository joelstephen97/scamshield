// tests/e2e/brand-fuzzy.spec.js — 0.9.0 detection upgrades (Task B3):
// fuzzy brand matcher and suspicious-site-reporter structural signals,
// end to end through the real content script + verdict pipeline. Fixture
// hosts are mapped to 127.0.0.1 in tests/e2e/fixtures.js's
// --host-resolver-rules and served by the existing HTTP/HTTPS fixtures
// server (tests/e2e/server.js) — clean.html carries no DOM signals, so any
// verdict here comes from the URL-only rules under test.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

// 0.15.0 doctrine: URL-only evidence has no confident flag, so it is recorded
// (suspicious verdict) but never interrupts: tier 'quiet', no banner.
async function expectQuietSuspicious(context, page, url) {
  const cdp = await context.newCDPSession(page);
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto(url);
  const read = async (expression) => {
    const c = ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
    return c ? cdp.send('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true }).then((r) => r.result.value).catch(() => null) : null;
  };
  await expect.poll(() => read('window.__ssLastTier'), { timeout: 8000 }).toBe('quiet');
  expect(await read('window.__ssLastVerdict && window.__ssLastVerdict.level')).toBe('suspicious');
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
}

test('a fuzzy brand-injection subdomain (not a real brand domain) is a suspicious verdict but quiet: no banner, no interstitial (0.15.0)', async ({ context }) => {
  const page = await context.newPage();
  // Served over HTTPS with a short host so the ONLY evidence at all is the
  // fuzzy brand match itself (no noHttps/randomHost noise) — a genuinely
  // lone fuzzy hit reaching "suspicious" but never the blocking interstitial.
  await expectQuietSuspicious(context, page, `${BASE_HTTPS}/clean.html`.replace('localhost', 'talabat.xy.com'));
});

test('a real brand domain (allowlist short-circuit) never shows brand-impersonation evidence', async ({ context }) => {
  // accounts.google.com is both a real Google auth domain AND one of
  // SAFE_DOMAINS — the page must show no banner at all, confirming the
  // allowlist gate (not merely a lucky score) is what keeps it clean.
  const page = await context.newPage();
  await page.goto('http://accounts.google.com:5599/clean.html');
  await page.waitForTimeout(1000);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
});

test('a deep subdomain chain below the registrable domain contributes suspicious-tier evidence, quiet tier (0.15.0)', async ({ context }) => {
  const page = await context.newPage();
  await expectQuietSuspicious(context, page, `${BASE}/clean.html`.replace('localhost', 'a.b.c.d.deep.example'));
});
