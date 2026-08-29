const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';
async function openPopup(context, extensionId, page) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront(); await popup.bringToFront(); await popup.reload();
  return popup;
}
test('dangerous brand page: red card, Leave + real-site actions, evidence rows', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/brand-visual.html'); await page.waitForTimeout(800);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/dangerous/, { timeout: 5000 });
  await expect(popup.locator('#level')).toHaveText('Dangerous page');
  await expect(popup.locator('#leave')).toBeVisible(); await expect(popup.locator('#rescue')).toBeVisible();
  await expect(popup.locator('#reasons li')).not.toHaveCount(0);
  // "Why this verdict?" opens by default on a dangerous verdict — no manual
  // "Show why" click needed any more (0.8.0: the panel absorbed that button).
  await expect(popup.locator('#whypanel')).toHaveJSProperty('open', true);
  await expect(popup.locator('#trustmenu')).toBeHidden();
  await expect(popup.locator('#reportbtn')).toHaveText(/this is safe/i);
});
test('safe page: quiet card, stats tiles, report label says scam', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/);
  await expect(popup.locator('#level')).toHaveText('Nothing suspicious here');
  await expect(popup.locator('#level')).not.toHaveText('Checking…');
  await expect(popup.locator('#leave')).toBeHidden();
  await expect(popup.locator('#tile-since b')).toHaveText(/^\d+$/);
  await expect(popup.locator('#tile-week b')).toHaveText(/^\d+$/);
  await expect(popup.locator('#reportbtn')).toHaveText(/this is a scam/i);
});
test('hero counters render both since-install and this-week totals from seeded stats', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  const today = new Date().toISOString().slice(0, 10);
  await sw.evaluate(async (d) => {
    await setSettings({ threatsBlocked: 12 });
    await chrome.storage.local.set({ statsDaily: [{ d, checked: 5, threats: 4, privacy: 0 }] });
  }, today);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#tile-since b')).toHaveText('12');
  await expect(popup.locator('#tile-week b')).toHaveText('4');
});
// clean-login.html over this host is a documented "safe" fixture (see
// tests/e2e/detection.spec.js) whose URL still trips one weak rule
// (randomHost, host-entropy heuristic) — exactly the case the "Why this
// verdict?" panel exists for: a safe verdict that still has something to
// show, collapsed behind a signal count until the user asks for it.
test('Why-verdict panel: collapsed with a signal count on a safe page, expands on click', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://shop.contoso-fixture.com:5600/clean-login.html');
  await page.waitForTimeout(1200);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/, { timeout: 5000 });
  const panel = popup.locator('#whypanel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveJSProperty('open', false);
  await expect(popup.locator('#whycount')).toContainText('signal');
  await popup.click('#whypanel summary');
  await expect(panel).toHaveJSProperty('open', true);
  await expect(popup.locator('#reasons li')).not.toHaveCount(0);
});
test('Pause protection → 1 hour suppresses the banner and shows a resume time', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const popup = await openPopup(context, extensionId, page);
  await popup.click('#trust'); await popup.click('[data-choice="1h"]');
  await expect(popup.locator('#trusted')).toContainText(/Paused until/);
  await expect(popup.locator('#untrust')).toHaveText('Resume now');
  // Protection is off for this site: the danger banner no longer renders.
  await page.reload(); await page.waitForTimeout(1200);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await popup.reload(); await popup.click('#untrust'); await page.reload();
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
});
test('Pause protection → Always shows a plain "Paused" state (no time), Resume now restores it', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const popup = await openPopup(context, extensionId, page);
  await popup.click('#trust'); await popup.click('[data-choice="always"]');
  await expect(popup.locator('#trustedtext')).toHaveText('Paused');
  await page.reload(); await page.waitForTimeout(1200);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  await popup.reload(); await popup.click('#untrust'); await page.reload();
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
});
test('Report a mistake (opted out) confirms inline and opens a GitHub issue tab', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(400);
  const popup = await openPopup(context, extensionId, page);
  const [issue] = await Promise.all([context.waitForEvent('page'), popup.click('#reportbtn')]);
  const firstUrl = issue.url();
  expect(decodeURIComponent(firstUrl) + ' ' + decodeURIComponent(issue.url())).toContain('joelstephen97/parry/issues/new');
  await expect(popup.locator('#reportdone')).toBeVisible();
});
test('Leave this page navigates away from a dangerous page', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const popup = await openPopup(context, extensionId, page);
  await popup.click('#leave');
  await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('phishing-login');
});
test('non-http tab shows the grey not-checked card', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto('about:blank');
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/unknown/);
});
test("What's new dismisses and stays dismissed after reload; Escape closes the trust menu", async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#whatsnew')).toBeVisible();
  await popup.click('#whatsnewx');
  await expect(popup.locator('#whatsnew')).toBeHidden();
  await popup.reload();
  await expect(popup.locator('#whatsnew')).toBeHidden();
  await popup.click('#trust');
  await expect(popup.locator('#trustmenu')).toBeVisible();
  await popup.keyboard.press('Escape');
  await expect(popup.locator('#trustmenu')).toBeHidden();
});

test('popup layout: body is the scroll container, so a classic scrollbar can never clip the right edge', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/safe.html');
  // 0.8.0: #support only renders when the footer's rotation lands on the
  // support slot. Step parity can't be relied on — a reload can interrupt an
  // init() before its rotation write persists, so the number of EFFECTIVE
  // steps is timing-dependent. Observe instead: if this open landed on the
  // trust slot, one more reload is one more rotation step to support.
  const popup = await openPopup(context, extensionId, page);
  await popup.waitForTimeout(400);
  if (!(await popup.locator('#footsupport').isVisible())) { await popup.reload(); await popup.waitForTimeout(400); }
  await expect(popup.locator('#footsupport')).toBeVisible();
  // Force content taller than the 600px popup cap, as real settings/history growth does.
  const m = await popup.evaluate(() => {
    const filler = document.createElement('div');
    filler.style.height = '1200px';
    document.body.insertBefore(filler, document.querySelector('footer'));
    const de = document.documentElement, b = document.body;
    return {
      bodyScrolls: b.scrollHeight > b.clientHeight + 1,
      viewportScrolls: de.scrollHeight > de.clientHeight + 1,
      docHeight: de.getBoundingClientRect().height,
      htmlBoxWidth: de.getBoundingClientRect().width,
      bodyHorizontalOverflow: b.scrollWidth - b.clientWidth,
      supportRight: document.getElementById('support').getBoundingClientRect().right,
      bodyClientWidth: b.clientWidth
    };
  });
  // The scrollbar must live INSIDE the 340px body box (content reflows), never on
  // the viewport (fixed 340px html would be clipped by the scrollbar/gutter).
  expect(m.bodyScrolls).toBe(true);
  expect(m.viewportScrolls).toBe(false);
  expect(m.docHeight).toBeLessThanOrEqual(601);
  expect(m.htmlBoxWidth).toBe(340);
  expect(m.bodyHorizontalOverflow).toBeLessThanOrEqual(0);
  expect(m.supportRight).toBeLessThanOrEqual(m.bodyClientWidth + 1);
});

// Rotating footer slot (0.8.0): with no review ask eligible (fresh install,
// 0 blocks), the footer alternates trust line <-> support link once per
// popup open, persisting the choice in storage.local so the NEXT open
// continues the rotation rather than replaying the same variant.
test('footer: rotates between the trust line and the support link across popup opens', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  // Seed the last-shown variant as 'support' so this open's rotation
  // (nextVariant('support') === 'trust') is deterministic.
  await sw.evaluate(() => chrome.storage.local.set({ footerVariant: 'support' }));

  const popup1 = await context.newPage();
  await popup1.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup1.locator('#foottrust')).toBeVisible();
  await expect(popup1.locator('#footsupport')).toBeHidden();
  await expect(popup1.locator('#askcard')).toBeHidden();

  // Next open: the rotation this open just persisted ('trust') alternates to 'support'.
  const popup2 = await context.newPage();
  await popup2.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup2.locator('#footsupport')).toBeVisible();
  await expect(popup2.locator('#foottrust')).toBeHidden();
});
