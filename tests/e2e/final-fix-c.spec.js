// tests/e2e/final-fix-c.spec.js — 0.15.0 final fix wave C (service worker + pages). Fixtures only.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

const tabIdOf = (sw, part) => sw.evaluate(async (p) => { const t = (await chrome.tabs.query({})).find((x) => (x.url || '').includes(p)); return t ? t.id : null; }, part);
async function openPopupOn(context, extensionId, page) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  return popup;
}

test('C2: warn -> pause -> reload the same URL leaves no stale "!" badge', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  const badge = async () => { const id = await tabIdOf(sw, 'phishing-login.html'); return sw.evaluate((i) => chrome.action.getBadgeText({ tabId: i }), id); };
  await expect.poll(badge, { timeout: 8000 }).toBe('!'); // canary: the warning really raised it
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const r = await ext.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'pauseSite', domain: 'localhost', choice: '1h' }, res)));
  expect(r.ok).toBe(true);
  await ext.close();
  await page.reload();
  await expect.poll(badge, { timeout: 8000 }).toBe('');
  await sw.evaluate(() => setSettings({ pausedSites: {} }));
});

test('C3: userReport after a service-worker restart uses the persisted verdict, not the empty default', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html');
  await page.waitForTimeout(1500);
  const tabId = await tabIdOf(sw, 'clean.html');
  const out = await sw.evaluate(async (id) => {
    const verdict = { level: 'dangerous', score: 0.9, reasons: [{ code: 'brandLookalike', params: [] }], tier: 'warn' };
    lastVerdict.delete(id); // what a restarted worker looks like
    await chrome.storage.session.set({ ['verdict:' + id]: verdict });
    const realCreate = chrome.tabs.create; let opened = null;
    chrome.tabs.create = async (o) => { opened = o; return {}; }; // never open a live GitHub tab
    try { await handleUserReport({ tabId: id, label: 'false_positive' }, {}); } finally { chrome.tabs.create = realCreate; await chrome.storage.session.remove('verdict:' + id); }
    return opened && opened.url;
  }, tabId);
  expect(decodeURIComponent(out)).toContain('[dangerous]');
  await page.close();
});

test('C9: untrusting a site also clears its quietSites entry', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => {
    await addTrust('quiet-trust.example', 'banner');
    await chrome.storage.local.set({ quietSites: { 'quiet-trust.example': { dismissals: 2, lastWarnAt: Date.now(), quietUntil: Date.now() + 864e5 }, 'other.example': { dismissals: 1, lastWarnAt: Date.now(), quietUntil: 0 } } });
    await removeTrust('quiet-trust.example');
  });
  const q = await sw.evaluate(async () => (await chrome.storage.local.get('quietSites')).quietSites || {});
  expect(Object.keys(q)).toEqual(['other.example']);
});

test('C10: a quiet-tier verdict with no reasons renders the calm safe card, never "Suspicious page"', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html'); await page.waitForTimeout(1500);
  const tabId = await tabIdOf(sw, 'clean.html');
  await sw.evaluate((id) => { lastVerdict.set(id, { level: 'suspicious', score: 0.4, reasons: [], tier: 'quiet' }); }, tabId);
  const popup = await openPopupOn(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/, { timeout: 6000 });
  await expect(popup.locator('#level')).not.toHaveText(/^Suspicious page$/i);
  await expect(popup.locator('#level')).toHaveText('Nothing suspicious here');
  await expect(popup.locator('#fine')).toBeHidden();
});

test('C10: the review ask fails closed when the surface log cannot be read', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const DAY = 24 * 3600 * 1000;
  await sw.evaluate(async (d) => {
    const s = await getSettings();
    await setSettings({ threatsBlocked: 5 });
    await chrome.storage.local.set({ installedAt: Date.now() - 20 * d, reviewAsk: { state: 'pending', snoozeUntil: 0, asks: 0 }, lastFalseAlarmAt: 0, surfaceLog: [] });
  }, DAY);
  const page = await context.newPage(); await page.goto(BASE + '/clean.html');
  const popup = await context.newPage();
  // Canary: with a readable log the ask shows.
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#askcard')).toBeVisible({ timeout: 6000 });
  // Now make getSurfaceLog fail inside the page: the ask must stay away.
  const popup2 = await context.newPage();
  await popup2.addInitScript(() => {
    const real = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (msg, cb) => { if (msg && msg.type === 'getSurfaceLog') { if (cb) cb(undefined); return; } return real(msg, cb); };
  });
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup2.waitForTimeout(1500);
  await expect(popup2.locator('#askcard')).toBeHidden();
});
