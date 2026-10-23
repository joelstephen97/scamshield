// tests/e2e/popup-options.spec.js — 0.15.0 Task 18: popup (quiet-tier message, "This site is fine", terminal
// "Can't check" state, phone width) and Options (Quiet sites, surface log + Copy diagnostics, new guard toggles,
// layout at phone / ultra-wide, switch labelling).
const { test, BASE_HTTPS, openMore } = require('./fixtures');
const { expect } = require('@playwright/test');

const BASE = 'http://localhost:5599';
async function openPopup(context, extensionId, page, size) {
  const popup = await context.newPage();
  if (size) await popup.setViewportSize(size);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  return popup;
}

test('popup: a quiet-tier page is explained calmly with its top reasons and no warning controls', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE_HTTPS + '/content-suspicious.html'); await page.waitForTimeout(2500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#summary')).toHaveText('A few unusual signs — not enough to warn you', { timeout: 6000 });
  await expect(popup.locator('#level')).toHaveText('No warning needed');
  const n = await popup.locator('#reasons li').count();
  expect(n).toBeGreaterThan(0); expect(n).toBeLessThanOrEqual(3);
  await expect(popup.locator('#leave')).toBeHidden();
  await expect(popup.locator('#fine')).toBeHidden();
  await expect(popup.locator('#reportbtn')).toHaveText(/this is a scam/i);
});

test('popup: the SW sends the surface tier with the verdict', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/phishing-login.html'); await page.waitForTimeout(2000);
  const ext = await context.newPage(); await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront();
  const tier = await ext.evaluate(async () => {
    const tabs = await chrome.tabs.query({}); const t = tabs.find((x) => (x.url || '').includes('phishing-login.html'));
    const v = await new Promise((res) => chrome.runtime.sendMessage({ type: 'getVerdict', tabId: t.id }, res));
    return v && v.tier;
  });
  expect(['warn', 'stop']).toContain(tier);
});

test('popup: "This site is fine" confirms, trusts via mistake, acknowledges and Undo takes it back', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage(); await page.goto(BASE + '/brand-visual.html'); await page.waitForTimeout(800);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  await expect(popup.locator('#fine')).toBeVisible();
  await popup.click('#fine');
  await expect(popup.locator('#finebox')).toBeVisible();
  await expect(popup.locator('#finecancel')).toBeFocused();
  await popup.click('#finecancel');
  await expect(popup.locator('#finebox')).toBeHidden(); await expect(popup.locator('#fine')).toBeVisible();
  expect(await sw.evaluate(() => getSettings().then((s) => s.allowlist.length))).toBe(0);
  await popup.click('#fine'); await popup.click('#fineyes');
  await expect(popup.locator('#ack')).toBeVisible();
  await expect(popup.locator('#ackundo')).toBeFocused();
  const meta = await sw.evaluate(() => getSettings().then((s) => s.allowlistMeta));
  expect(Object.values(meta).map((m) => m.via)).toContain('mistake');
  await popup.click('#ackundo');
  await expect(popup.locator('#ack')).toBeHidden();
  expect(await sw.evaluate(() => getSettings().then((s) => s.allowlist.length))).toBe(0);
  await expect(popup.locator('#fine')).toBeVisible();
});

test("popup: a page ScamShield cannot read ends in the terminal \"Can't check this page\" state", async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto('about:blank');
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#level')).toHaveText("Can't check this page");
  await expect(popup.locator('#summary')).toContainText(/PDF/);
  await expect(popup.locator('#reportbtn')).toBeHidden();
});

test('popup: pausing a site moves focus to Resume, and resuming moves it back', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/);
  await popup.click('#trust'); await popup.click('#trustmenu [data-choice="1h"]');
  await expect(popup.locator('#untrust')).toBeFocused();
  await popup.click('#untrust');
  await expect(popup.locator('#trust')).toBeFocused();
});

test('popup: turning protection off re-renders the status card as paused', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/);
  await popup.click('#enabledwrap');
  await expect(popup.locator('#summary')).toContainText(/paused/i);
  await popup.click('#enabledwrap');
  await expect(popup.locator('#status')).toHaveClass(/safe/, { timeout: 6000 });
});

test('popup at 360px: no horizontal scroll, header intact', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/brand-visual.html'); await page.waitForTimeout(800);
  const popup = await openPopup(context, extensionId, page, { width: 360, height: 800 });
  await expect(popup.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  const m = await popup.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.cw); expect(m.bw).toBeLessThanOrEqual(m.cw);
});

test('popup at 320px in Arabic: brand and version stay inside the viewport', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ uiLang: 'ar' }));
  const page = await context.newPage(); await page.goto(BASE + '/brand-visual.html'); await page.waitForTimeout(800);
  const popup = await openPopup(context, extensionId, page, { width: 320, height: 800 });
  await expect(popup.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(popup.locator('html')).toHaveAttribute('lang', /^ar/);
  for (const sel of ['#brandmark', '#ver', '#opts', '#enabledwrap']) {
    const b = await popup.locator(sel).boundingBox();
    expect(b, sel).not.toBeNull();
    expect(b.x, sel).toBeGreaterThanOrEqual(0); expect(b.x + b.width, sel).toBeLessThanOrEqual(320.5);
  }
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await sw.evaluate(() => setSettings({ uiLang: 'auto' }));
});

test('options: link-guard and ad-guard toggles default on, persist, and every switch has an accessible name', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('#linkguard')).toBeChecked(); await expect(page.locator('#adguard')).toBeChecked();
  await page.click('label[for="linkguard"]'); await expect(page.locator('#status')).toHaveText(/Saved/);
  await page.click('label[for="adguard"]');
  await page.reload();
  await expect(page.locator('#linkguard')).not.toBeChecked(); await expect(page.locator('#adguard')).not.toBeChecked();
  const s = await context.serviceWorkers()[0].evaluate(() => getSettings());
  expect(s.linkGuard).toBe(false); expect(s.adGuard).toBe(false);
  await expect(page.locator('#linkguard')).toHaveAttribute('aria-labelledby', /.+/);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('.setrow input[type="checkbox"]')].filter((i) => !i.getAttribute('aria-labelledby') || !document.getElementById(i.getAttribute('aria-labelledby'))).map((i) => i.id));
  expect(unnamed).toEqual([]);
});

test('options: Quiet sites lists active quiet windows and Remove sends unquietSite', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ quietSites: {
    'noisy.example': { dismissals: 2, lastWarnAt: Date.now(), quietUntil: Date.now() + 20 * 864e5 },
    'once.example': { dismissals: 1, lastWarnAt: Date.now(), quietUntil: 0 } } }));
  const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/options.html#trusted`);
  const row = page.locator('#quietlist li[data-domain="noisy.example"]');
  await expect(row).toBeVisible();
  await expect(page.locator('#quietlist li[data-domain="once.example"]')).toHaveCount(0);
  await expect(row).toContainText(/quiet until/);
  const btn = row.locator('button.remove');
  await expect(btn).toHaveAttribute('aria-label', /^Remove .*noisy\.example/);
  await btn.click();
  await expect(page.locator('#quietlist li[data-domain="noisy.example"]')).toHaveCount(0);
  const left = await sw.evaluate(async () => Object.keys((await chrome.storage.local.get('quietSites')).quietSites || {}));
  expect(left).not.toContain('noisy.example');
});

test('options: What ScamShield showed lists labelled rows, Copy diagnostics copies kinds without paths, Clear empties', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ surfaceLog: [
    { ts: Date.now(), host: 'a.example', kind: 'banner' },
    { ts: Date.now() - 1000, host: 'b.example', kind: 'link-block' },
    { ts: Date.now() - 2000, host: 'c.example', kind: 'ad-hidden' },
    { ts: Date.now() - 3000, host: 'd.example', kind: 'future-kind' }] }));
  const page = await context.newPage();
  await page.addInitScript(() => { window.__cap = ''; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__cap = t; return Promise.resolve(); } } }); } catch (_) {} });
  await page.goto(`chrome-extension://${extensionId}/options.html#surfaces`);
  const rows = page.locator('#surfacelist li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('a.example'); await expect(rows.nth(0)).toContainText('Warning banner');
  await expect(rows.nth(1)).toContainText('Blocked link');
  await expect(rows.nth(2)).toContainText('Scam ad hidden');
  await expect(rows.nth(3)).toContainText('future-kind'); // unknown kind falls back to the raw kind
  await page.click('#copydiag');
  await expect.poll(() => page.evaluate(() => window.__cap || '')).toContain('banner');
  const text = await page.evaluate(() => window.__cap);
  expect(text).toContain('link-block'); expect(text).not.toContain('/');
  await page.click('#clearsurf');
  await expect(page.locator('#surfacelist li')).toHaveCount(1);
  await expect(page.locator('#surfacelist li')).toContainText('Nothing shown yet');
  expect(await sw.evaluate(async () => (await chrome.storage.local.get('surfaceLog')).surfaceLog)).toEqual([]);
});

test('options at 375px: the sidebar is a top tab strip and the page does not scroll sideways', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const m = await page.evaluate(() => { const n = document.querySelector('nav').getBoundingClientRect(); return { navW: n.width, navH: n.height, top: n.top, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  expect(m.sw).toBeLessThanOrEqual(m.cw); expect(m.navW).toBeLessThanOrEqual(375); expect(m.navH).toBeLessThan(120);
  await page.click('nav a[data-tab="about"]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('options at 2560px: a centred 1100px shell with a content column of at most 760px', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.setViewportSize({ width: 2560, height: 1300 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const m = await page.evaluate(() => { const s = document.querySelector('.shell').getBoundingClientRect(); const mn = document.querySelector('main').getBoundingClientRect(); return { sx: s.x, sw: s.width, mw: mn.width }; });
  expect(m.sw).toBeLessThanOrEqual(1100); expect(m.sx).toBeGreaterThan(600); expect(m.mw).toBeLessThanOrEqual(760);
});

// Controller ruling (fix round 1): the implicit report behind "This site is fine" never opens a GitHub tab when community
// reporting is off; only the ack's own "Report a mistake" button (a deliberate report) may.
test('popup "This site is fine" opens no tab with reporting off; the ack Report button does', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/brand-visual.html'); await page.waitForTimeout(800);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  const before = context.pages().length;
  await popup.click('#fine'); await popup.click('#fineyes');
  await expect(popup.locator('#ack')).toBeVisible();
  await popup.waitForTimeout(1500);
  expect(context.pages().length).toBe(before);
  expect(await context.serviceWorkers()[0].evaluate(() => getSettings().then((s) => s.allowlist.length))).toBe(1);
  const [issue] = await Promise.all([context.waitForEvent('page'), popup.click('#ackreport')]);
  expect(issue.url()).toContain('github.com');
});

test('in-page "This site is fine" opens no tab with reporting off; the ack Report button does', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const HOST = 'secure-paypa1-login.com';
  const page = await context.newPage();
  await page.goto(`http://${HOST}:5599/phishing-login.html`);
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(350);
  await openMore(page.locator('.scamshield-banner'));
  const before = context.pages().length;
  await page.locator('.scamshield-banner .ss-report').click();
  await expect.poll(async () => (await sw.evaluate(() => getSettings())).allowlist.includes(HOST), { timeout: 5000 }).toBe(true);
  await expect(page.locator('.scamshield-ack .ss-report')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(context.pages().length).toBe(before);
  const [issue] = await Promise.all([context.waitForEvent('page'), page.locator('.scamshield-ack .ss-report').click()]);
  expect(issue.url()).toContain('github.com');
});
