const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';

// Per-user language override (0.7.0). Chrome has no API to render an extension
// in a language other than the browser's, so the strings below come from our
// own packaged _locales/ through the custom loader. The browser under test runs
// in English, which is what makes these assertions meaningful: German or Arabic
// on screen can only have come from the override.
//
// Every test gets a fresh persistent context (fixtures.js), so each starts on
// the default uiLang:'auto'.
const optionsUrl = (id, hash) => `chrome-extension://${id}/options.html` + (hash || '');

test('options: picking Deutsch reloads the page in German, and the popup follows', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(optionsUrl(extensionId, '#about'));
  // The picker lists autonyms, so it reads the same whatever the UI language.
  await expect(page.locator('#lang option[value="de"]')).toHaveText('Deutsch');
  await expect(page.locator('#lang')).toHaveValue('auto');
  await expect(page.locator('nav a[data-tab="protection"]')).toHaveText('Protection');

  await page.selectOption('#lang', 'de');
  // The change handler saves and reloads; the reloaded page renders in German.
  await expect(page.locator('nav a[data-tab="protection"]')).toHaveText('Schutz');
  await expect(page.locator('#lang')).toHaveValue('de');
  await expect(page).toHaveTitle('ScamShield-Einstellungen');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  // Strings this page builds in JavaScript, not from a data-i18n attribute,
  // are German too: the trusted-sites empty state and the network receipt are
  // both written by options.js after its own async settings read.
  await expect(page.locator('#net-report')).toHaveText('aus (Standard)');
  await page.click('nav a[data-tab="trusted"]');
  await expect(page.locator('#allowlist li')).toHaveText('Noch keine');

  // The setting is one storage key, and it syncs like the other preferences.
  const sw = context.serviceWorkers()[0];
  expect(await sw.evaluate(() => getSettings().then((s) => s.uiLang))).toBe('de');
  const exported = await sw.evaluate(async () => exportSettings(await getSettings()));
  expect(exported.settings.uiLang).toBe('de');

  // A popup opened afterwards picks the language up on its own — both the
  // markup it declares (data-i18n) and the strings it builds in JavaScript.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#lockline')).toContainText('Läuft auf deinem Gerät');
  await expect(popup.locator('#msgcheck summary')).toHaveText('Nachricht oder Link prüfen');
});

test('options: numbers, dates and relative times follow the override too', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  // A seeded lifetime counter and a history row two hours old cover the three
  // things these pages format through Intl — number grouping, a date+time
  // stamp, a relative time — each with a visibly different German and English
  // rendering. Deliberately NOT the feed counters: runOtaUpdate() rewrites
  // those from the live feed on install, which would race this test.
  await sw.evaluate(() => setSettings({ uiLang: 'de' }));
  // History is newest-first, the order the worker writes it in.
  await sw.evaluate(() => chrome.storage.local.set({
    pagesCheckedTotal: 12345,
    history: [{ ts: Date.now() - 2 * 3600 * 1000, host: 'recent-scam.example', kind: 'page', level: 'dangerous' },
      { ts: Date.parse('2026-08-18T09:53:20Z'), host: 'old-scam.example', kind: 'page', level: 'dangerous' }]
  }));

  const page = await context.newPage();
  await page.goto(optionsUrl(extensionId, '#history'));
  // History stamps: German day.month.year, never the US month/day/year.
  // `new Date(ts).toLocaleString()` with no locale printed the English form.
  await expect(page.locator('#history')).toContainText('18.8.2026');
  await expect(page.locator('#history')).not.toContainText('8/18/2026');

  await page.click('nav a[data-tab="stats"]');
  // 12345 → "12.345" in German, "12,345" in English.
  await page.click('#statsseg button[data-p="all"]');
  await expect(page.locator('#st-checked')).toHaveText('12.345');
  // The "Recent" list formats through the same relative-time helper, from a
  // second entry point (loadStats, not load): "vor 2 Stunden", not "2 hours ago".
  await expect(page.locator('#st-recent time').first()).toHaveText('vor 2 Stunden');
  // And the popup's own history list, which has its own copy of UI_LANG.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#hist time').first()).toHaveText('vor 2 Stunden');
});

test('options: an RTL language flips the page direction', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(optionsUrl(extensionId, '#about'));
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.selectOption('#lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('إعدادات ScamShield');
  await expect(page.locator('#lang')).toHaveValue('ar');

  // The popup flips with it.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('options: Browser default restores English', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(optionsUrl(extensionId, '#about'));
  await page.selectOption('#lang', 'de');
  await expect(page.locator('nav a[data-tab="protection"]')).toHaveText('Schutz');

  await page.selectOption('#lang', 'auto');
  await expect(page.locator('nav a[data-tab="protection"]')).toHaveText('Protection');
  await expect(page.locator('#lang')).toHaveValue('auto');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const sw = context.serviceWorkers()[0];
  expect(await sw.evaluate(() => getSettings().then((s) => s.uiLang))).toBe('auto');
});

test('content script: a warning banner renders in the chosen language', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ uiLang: 'de' }));
  // Warm the worker's dictionary cache first. The content script asks for the
  // dictionary and never waits for it (a warning must always be on time), so
  // warming removes the only thing that could make this a race: the one-off
  // read of the packaged locale file.
  expect(await sw.evaluate(() => getLangDict().then((r) => r && r.lang))).toBe('de');

  const page = await context.newPage();
  await page.goto(BASE + '/phishing-login.html');
  const banner = page.locator('.scamshield-banner.danger');
  await expect(banner).toBeVisible({ timeout: 8000 });
  await expect(banner.locator('b')).toHaveText('Gefährliche Seite');
  await expect(banner.locator('.ss-leave')).toHaveText('Diese Seite verlassen');
  await expect(banner).toHaveAttribute('dir', 'ltr');
  // The banner leads with the top reason, which the engine emits as a code
  // (noHttps / credentialFormForeignDomain here) — so it is translated by the
  // same dictionary rather than by a second, parallel mechanism.
  await expect(banner.locator('.ss-text > span').first())
    .toHaveText(/Die Verbindung ist nicht sicher|Passwortformular/);
});

// Popup header language switcher (0.7.1) — the same `uiLang` setting as
// above, one tap away from the popup's start screen via a globe button
// between the On toggle and the gear.
// popup.js's init() attaches the globe button's click handler only after a
// few awaits (settings, and — when an override is set — an async fetch of
// that locale's messages.json for SSi18n.ready), so clicking the button the
// instant goto() resolves can race that wiring, especially with a real
// locale fetch in flight (ar below). Wait for buildLangMenu() to have run —
// it populates #langdd in the same synchronous block that attaches the click
// listener — before clicking, so the test exercises the real interaction
// instead of an occasional no-op click on an unwired button.
async function waitForLangMenuReady(popup) {
  await popup.waitForFunction(() => document.querySelectorAll('#langdd .langitem').length > 0);
}

test('popup: globe opens a 21-item dropdown, Deutsch reloads the popup and updates the options page, Escape and Browser default both work', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#langbtn')).toHaveAttribute('aria-label', 'Language');
  await expect(popup.locator('#langbtn')).toHaveAttribute('title', 'Language');
  await expect(popup.locator('#langdd')).toBeHidden();

  await waitForLangMenuReady(popup);
  await popup.click('#langbtn');
  await expect(popup.locator('#langdd')).toBeVisible();
  const items = popup.locator('#langdd .langitem');
  await expect(items).toHaveCount(21); // "Browser default" + the 20 shipped locales
  await expect(items.first()).toHaveText(/Browser default/);
  await expect(items.first()).toHaveClass(/cur/);

  // Esc closes it without picking anything (same interaction as the Trust menu).
  await popup.keyboard.press('Escape');
  await expect(popup.locator('#langdd')).toBeHidden();

  // Pick Deutsch: saves uiLang, then the popup reloads itself in German.
  await popup.click('#langbtn');
  await popup.click('#langdd .langitem[data-lang="de"]');
  await expect(popup.locator('#lockline')).toContainText('Läuft auf deinem Gerät');
  await expect(popup.locator('#langbtn')).toHaveAttribute('aria-label', 'Sprache');

  // The options page's own dropdown shows the same setting — one storage key.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#lang')).toHaveValue('de');

  // Re-open the popup's menu: the current item is now Deutsch, checked.
  // (After the reload above, so wait for init() to have re-wired the button.)
  await waitForLangMenuReady(popup);
  await popup.click('#langbtn');
  await expect(popup.locator('#langdd .langitem[data-lang="de"]')).toHaveClass(/cur/);

  // Browser default restores English.
  await popup.click('#langdd .langitem[data-lang="auto"]');
  await expect(popup.locator('#lockline')).toContainText('Runs on your device');
  const sw = context.serviceWorkers()[0];
  expect(await sw.evaluate(() => getSettings().then((s) => s.uiLang))).toBe('auto');
});

test('popup: with Arabic set, the language dropdown still renders on screen under RTL', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ uiLang: 'ar' }));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('html')).toHaveAttribute('dir', 'rtl');
  // ar's override dictionary is a real async fetch of _locales/ar/messages.json
  // (see waitForLangMenuReady's comment above) — slower than the default
  // 'auto' path, so this is exactly the case that race would show up in.
  await waitForLangMenuReady(popup);
  await popup.click('#langbtn');
  const dd = popup.locator('#langdd');
  await expect(dd).toBeVisible();
  await expect(dd.locator('.langitem[data-lang="ar"]')).toHaveClass(/cur/);
  // toBeVisible() alone would still pass for a dropdown clipped mostly
  // off-screen (review round 1 caught exactly that: the header's flex row
  // mirrors under dir=rtl, so a purely physical `right:0` anchor ran the menu
  // off the popup's 340px-wide box). Assert the actual box stays fully within
  // the popup's 340px width instead of just "exists in the DOM" — measured
  // relative to <html>'s own box, not the raw viewport: this test loads
  // popup.html into a full browser tab (not the real fixed-size popup
  // window), and Chromium right-aligns a narrower `dir=rtl` root element
  // inside a wider viewport, which would make a plain viewport-relative
  // bounding box look "off-screen" even when the dropdown sits correctly
  // inside the 340px page.
  const box = await popup.evaluate(() => {
    const h = document.documentElement.getBoundingClientRect();
    const d = document.getElementById('langdd').getBoundingClientRect();
    return { x: d.left - h.left, width: d.width };
  });
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(340);
});

// Review round 1: the Trust menu and the language menu could previously both
// be open at once — each button's click handler stopPropagation()s, so the
// OTHER menu's outside-click listener never saw the click and never closed
// it. Opening either now closes the other directly (setTrustMenu/setLangMenu
// in popup.js), and Esc closes whichever one is actually open.
test('popup: opening the language menu closes an open Trust menu, and vice versa; Escape closes whichever is open', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  // popup.js's currentTab() picks the popup's own content tab as "the other tab
  // with the highest index" when more than one non-popup tab exists — which
  // includes the extension's own auto-opened onboarding tab (a pre-existing,
  // unrelated race: whether onboarding finishes opening before or after this
  // `page` is created is timing-dependent). Closing every tab except `page`
  // before opening the popup removes that race entirely for this test, which
  // is about the language/Trust menu interaction, not tab selection.
  for (const p of context.pages()) if (p !== page) await p.close();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();

  await expect(popup.locator('#trust')).toBeVisible();
  await popup.click('#trust');
  await expect(popup.locator('#trustmenu')).toBeVisible();

  // Opening the language menu must close the Trust menu, not stack on top of it.
  await popup.click('#langbtn');
  await expect(popup.locator('#langdd')).toBeVisible();
  await expect(popup.locator('#trustmenu')).toBeHidden();

  // And the reverse: opening Trust again closes the language menu.
  await popup.click('#trust');
  await expect(popup.locator('#trustmenu')).toBeVisible();
  await expect(popup.locator('#langdd')).toBeHidden();

  // Escape closes whichever one is actually open (the Trust menu here).
  await popup.keyboard.press('Escape');
  await expect(popup.locator('#trustmenu')).toBeHidden();
  await expect(popup.locator('#langdd')).toBeHidden();
});

test('the language service refuses anything that is not a shipped locale', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  // The default is "follow the browser" — no dictionary, today's behavior.
  expect(await sw.evaluate(() => getLangDict())).toBe(null);
  // A junk value (hand-edited storage, a corrupt import) is ignored rather
  // than sending the UI looking for a locale file that does not exist.
  await sw.evaluate(() => setSettings({ uiLang: '../../etc/passwd' }));
  expect(await sw.evaluate(() => getLangDict())).toBe(null);
  expect(await sw.evaluate(() => sanitizeImport({ settings: { uiLang: 'klingon' } }))).toBe(null);
  expect(await sw.evaluate(() => sanitizeImport({ settings: { uiLang: 'de' } }))).toEqual({ uiLang: 'de' });

  // A real locale answers with a positional dictionary, named tokens resolved.
  await sw.evaluate(() => setSettings({ uiLang: 'de' }));
  const r = await sw.evaluate(() => getLangDict());
  expect(r.lang).toBe('de');
  expect(r.dict.bannerDanger).toBe('Gefährliche Seite');
  expect(r.dict.guardLeakyFormHashed).toContain('$1');
  expect(Object.values(r.dict).some((v) => /\$[A-Z_]+\$/.test(v))).toBe(false);
});
