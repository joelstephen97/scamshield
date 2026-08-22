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
  await expect(popup.locator('#trustmenu')).toBeHidden();
  await expect(popup.locator('#reportbtn')).toHaveText(/This is safe/);
});
test('safe page: quiet card, stats tiles, report label says scam', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/clean.html'); await page.waitForTimeout(500);
  const popup = await openPopup(context, extensionId, page);
  await expect(popup.locator('#status')).toHaveClass(/safe/);
  await expect(popup.locator('#level')).toHaveText('Nothing suspicious here');
  await expect(popup.locator('#leave')).toBeHidden();
  await expect(popup.locator('#tile-all b')).toHaveText(/^\d+$/);
  await expect(popup.locator('#reportbtn')).toHaveText(/This is a scam/);
});
test('Trust this site → For 1 hour suppresses the banner and shows until-time', async ({ context, extensionId }) => {
  const page = await context.newPage(); await page.goto(BASE + '/phishing-login.html');
  await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  const popup = await openPopup(context, extensionId, page);
  await popup.click('#trust'); await popup.click('[data-choice="1h"]');
  await expect(popup.locator('#trusted')).toContainText(/Trusted until/);
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
  expect(decodeURIComponent(firstUrl) + ' ' + decodeURIComponent(issue.url())).toContain('joelstephen97/scamshield/issues/new');
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
