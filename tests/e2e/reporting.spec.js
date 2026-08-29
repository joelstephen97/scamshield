// tests/e2e/reporting.spec.js
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';
const RELAY = BASE + '/relay';

async function setSettings(context, patch) {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate((p) => setSettings(p), patch);
}
async function relayState(page) { return page.evaluate(async (u) => (await fetch(u)).json(), RELAY + '/last'); }

test.beforeEach(async ({ context }) => { const p = await context.newPage(); await p.goto(BASE + '/relay/reset').catch(() => {}); await p.close(); });

test('opted OUT: dangerous verdict sends nothing', async ({ context }) => {
  await setSettings(context, { reportingOptIn: false, reportUrl: RELAY });
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  expect((await relayState(page)).count).toBe(0);
});

test('opted IN: dangerous verdict sends one host-level report, no URL path', async ({ context }) => {
  await setSettings(context, { reportingOptIn: true, reportUrl: RELAY });
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ reportedHosts: {}, reportQueue: [] }));
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html?secret=1');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => (await relayState(page)).count, { timeout: 8000 }).toBeGreaterThan(0);
  const { last } = await relayState(page);
  expect(last.v).toBe(1); expect(last.kind).toBe('auto'); expect(last.label).toBe('dangerous');
  expect(last.host).toBe('localhost'); expect(JSON.stringify(last)).not.toContain('secret=1');
  expect(JSON.stringify(last)).not.toContain('phishing-login');
  expect(last.urlFeatures.length).toBe(17);
  // second visit within 24h does not re-report the same registrable domain
  const before = (await relayState(page)).count;
  await page.reload(); await page.waitForTimeout(1500);
  expect((await relayState(page)).count).toBe(before);
});

test('user report: opted in → relay; opted out → GitHub issue URL', async ({ context }) => {
  await setSettings(context, { reportingOptIn: true, reportUrl: RELAY });
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const sw = context.serviceWorkers()[0];
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  const r1 = await sw.evaluate((id) => handleUserReport({ label: 'scam', tabId: id }, { tab: { id } }), tabId);
  expect(r1.via).toBe('relay');
  await expect.poll(async () => (await relayState(page)).last && (await relayState(page)).last.label, { timeout: 5000 }).toBe('scam');
  await setSettings(context, { reportingOptIn: false });
  const r2 = await sw.evaluate((id) => handleUserReport({ label: 'false_positive', tabId: id }, { tab: { id } }), tabId);
  expect(r2.via).toBe('github'); expect(r2.issueUrl).toContain('github.com/joelstephen97/parry/issues/new');
  expect(r2.issueUrl).toContain('localhost');
});
