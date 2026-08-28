const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

// The SW-side half of the 0.7.0 statistics data layer: the counters only ever
// move from real scans, so they are checked here rather than in unit tests.
// Each test gets its own persistent context (fixtures.js), so storage starts empty.
const readStats = (sw) => sw.evaluate(() => getStats());
const todayKey = () => new Date().toISOString().slice(0, 10);

test('scanning a safe page and a dangerous page fills the local stats', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const safe = await context.newPage();
  await safe.goto(BASE + '/clean.html');
  await safe.waitForTimeout(800);
  const bad = await context.newPage();
  await bad.goto(BASE + '/phishing-login.html');
  await expect(bad.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await bad.waitForTimeout(500);

  const stats = await readStats(sw);
  expect(stats.pagesCheckedTotal).toBeGreaterThanOrEqual(2);
  expect(stats.threatsBlocked).toBeGreaterThanOrEqual(1);

  const today = stats.statsDaily.find((b) => b.d === todayKey());
  expect(today, `no bucket for ${todayKey()} in ${JSON.stringify(stats.statsDaily)}`).toBeTruthy();
  expect(today.checked).toBeGreaterThanOrEqual(2);
  expect(today.threats).toBeGreaterThanOrEqual(1);

  // The block is attributed to a category (a credential form posting off-domain
  // is phishing), and the categories sum to the ring's threat count.
  const types = Object.entries(stats.threatsByType);
  expect(types.some(([, n]) => n > 0)).toBe(true);
  expect(stats.threatsByType.phishing).toBeGreaterThanOrEqual(1);
  expect(types.reduce((a, [, n]) => a + n, 0)).toBe(today.threats);

  // "Protecting you since" — set on install/boot, a plausible epoch, not future.
  expect(stats.installedAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
  expect(stats.installedAt).toBeLessThanOrEqual(Date.now() + 60000);
  // Feed size falls back to the bundled ruleset before the first OTA.
  expect(stats.feedRuleCount).toBeGreaterThan(0);
});

test('a ClickFix block is filed under the clickfix category, not the generic detector kind', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clickfix.html');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
  const stats = await readStats(sw);
  expect(stats.threatsByType.clickfix).toBeGreaterThanOrEqual(1);
  expect(stats.threatsByType.clipboard || 0).toBe(0);
});

test('stats live in storage.local only — never in settings or sync', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/clean.html');
  await page.waitForTimeout(800);
  const s = await sw.evaluate(() => getSettings());
  for (const k of ['statsDaily', 'pagesCheckedTotal', 'threatsByType', 'installedAt']) {
    expect(s[k], `${k} leaked into the settings object`).toBeUndefined();
  }
  const exported = await sw.evaluate(async () => exportSettings(await getSettings()));
  for (const k of ['statsDaily', 'pagesCheckedTotal', 'threatsByType', 'installedAt']) {
    expect(exported.settings[k], `${k} leaked into the export/sync payload`).toBeUndefined();
  }
});

// --- The Statistics tab (options.html#stats) --------------------------------

test('options#stats renders the dashboard from a fresh install', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#stats`);
  await expect(page.locator('nav a.cur')).toHaveText('Statistics');
  await expect(page.locator('#tab-stats')).toBeVisible();
  await expect(page.locator('#statssince')).toContainText('Protecting this browser since');

  // Four tiles, every number rendered (never left as the "—" placeholder).
  const tiles = page.locator('#tab-stats .tiles .tile');
  await expect(tiles).toHaveCount(4);
  for (const id of ['#st-checked', '#st-threats', '#st-privacy', '#st-rules']) {
    await expect(page.locator(id)).toHaveText(/^[0-9.,\s]+$/);
  }
  // Nothing blocked yet — the reassuring subline, not a scam count.
  await expect(page.locator('#st-threats')).toHaveText('0');
  await expect(page.locator('#st-threats-sub')).toHaveText(/nothing slipped through/);
  await expect(page.locator('#st-threats-tile')).toHaveClass(/zero/);
  // The bundled ruleset is enforced before the first OTA, and the tile says so.
  await expect(page.locator('#st-rules')).not.toHaveText('0');
  await expect(page.locator('#tab-stats .tile .note')).toContainText('built into ScamShield');

  // Chart: 7 zero-filled daily bars, an axis and the every-category list.
  await expect(page.locator('#st-charttitle')).toHaveText('Pages checked · last 7 days');
  await expect(page.locator('#st-bars .b')).toHaveCount(7);
  await expect(page.locator('#st-axstart')).not.toBeEmpty();
  await expect(page.locator('#st-cats .cat')).toHaveCount(8);
  await expect(page.locator('#st-recent li')).toHaveCount(1); // the empty-state row
  await expect(page.locator('#tab-stats .dfoot')).toContainText('Nothing on this page is sent anywhere');
});

test('options#stats: the period toggle re-renders the chart', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#stats`);
  await expect(page.locator('#st-bars .b')).toHaveCount(7);

  await page.click('#statsseg button[data-p="30"]');
  await expect(page.locator('#st-charttitle')).toHaveText('Pages checked · last 30 days');
  await expect(page.locator('#st-bars .b')).toHaveCount(30);
  await expect(page.locator('#statsseg button[data-p="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#statsseg button[data-p="7"]')).toHaveAttribute('aria-pressed', 'false');

  // A same-day install spans one day, so "All time" is a single bar.
  await page.click('#statsseg button[data-p="all"]');
  await expect(page.locator('#st-charttitle')).toHaveText('Pages checked · since install');
  await expect(page.locator('#st-bars .b')).toHaveCount(1);
  await expect(page.locator('#statsseg button[data-p="all"]')).toHaveClass(/on/);

  await page.click('#statsseg button[data-p="7"]');
  await expect(page.locator('#st-bars .b')).toHaveCount(7);
});

test('options#stats counts a real block: threats tile, category row, recent list', async ({ context, extensionId }) => {
  const bad = await context.newPage();
  await bad.goto(BASE + '/phishing-login.html');
  await expect(bad.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await bad.waitForTimeout(500);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#stats`);
  await expect(page.locator('#st-threats')).not.toHaveText('0');
  await expect(page.locator('#st-threats-sub')).toHaveText(/never reached you/);
  await expect(page.locator('#st-threats-tile')).not.toHaveClass(/zero/);
  await expect(page.locator('#st-checked')).not.toHaveText('0');
  // Today's bar carries the threat marker.
  await expect(page.locator('#st-bars .b.hit')).toHaveCount(1);
  // Phishing leads the by-type list with a non-zero count.
  await expect(page.locator('#st-cats .cat').first()).toContainText('Phishing');
  await expect(page.locator('#st-cats .cat').first().locator('b')).not.toHaveText('0');
  // Recent shows the blocked host with the Blocked pill.
  const first = page.locator('#st-recent li').first();
  await expect(first.locator('.pill')).toHaveText('Blocked');
  await expect(first.locator('.host')).toHaveText('localhost');
});

test('popup links to the Statistics tab', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.local.set({ history: [{ ts: Date.now(), host: 'old-scam.example', kind: 'page', level: 'dangerous' }] }));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const link = popup.locator('#viewall');
  await expect(link).toBeVisible();
  await expect(link).toHaveText('Statistics →');
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await opened.waitForLoadState('domcontentloaded').catch(() => {});
  expect(opened.url()).toContain('options.html#stats');
  await expect(opened.locator('#tab-stats')).toBeVisible();
});

test('a page with privacy findings counts once, however many findings it has', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const before = await readStats(sw);
  expect(before.privacyFindingsTotal).toBe(0);
  const page = await context.newPage();
  await page.goto(BASE + '/fingerprint.html');
  await page.waitForTimeout(1500);
  const stats = await readStats(sw);
  const today = stats.statsDaily.find((b) => b.d === todayKey());
  expect(today).toBeTruthy();
  expect(today.privacy).toBe(1);
  // The lifetime counter moves with the ring — it is what the "All time" tile
  // reads, since the ring forgets after 90 days.
  expect(stats.privacyFindingsTotal).toBe(1);
});

test('privacyFindingsTotal backfills once from an existing ring, then only increments', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  // An install that predates the counter: a ring with privacy days, no total.
  await sw.evaluate(() => {
    const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    return chrome.storage.local.set({
      statsDaily: [{ d: day(3), checked: 9, threats: 0, privacy: 2 }, { d: day(1), checked: 4, threats: 0, privacy: 3 }]
    }).then(() => chrome.storage.local.remove('privacyFindingsTotal'));
  });
  // The seed happens on the next boot, so re-run it the way the SW does.
  await sw.evaluate(() => ensurePrivacyTotal());
  expect((await readStats(sw)).privacyFindingsTotal).toBe(5);

  // Seeding never runs twice: a ring that later rolls over cannot lower it.
  await sw.evaluate(() => chrome.storage.local.set({ statsDaily: [] }));
  await sw.evaluate(() => ensurePrivacyTotal());
  expect((await readStats(sw)).privacyFindingsTotal).toBe(5);

  // A real finding increments from the seeded value.
  const page = await context.newPage();
  await page.goto(BASE + '/fingerprint.html');
  await page.waitForTimeout(1500);
  expect((await readStats(sw)).privacyFindingsTotal).toBe(6);
});

test('options#stats "All time" privacy tile reads the lifetime counter, not the ring', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  // A total larger than anything the ring holds — only the counter can show it.
  await sw.evaluate(() => chrome.storage.local.set({ privacyFindingsTotal: 137, statsDaily: [] }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#stats`);
  await expect(page.locator('#st-privacy')).toHaveText('0'); // 7-day view: the ring
  await page.click('#statsseg button[data-p="all"]');
  await expect(page.locator('#st-privacy')).toHaveText('137');
  await page.click('#statsseg button[data-p="7"]');
  await expect(page.locator('#st-privacy')).toHaveText('0');
});
