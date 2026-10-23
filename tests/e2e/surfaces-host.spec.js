// tests/e2e/surfaces-host.spec.js — the shadow-host primitive (0.15.0, Task 11).
// clipboard-auto.html writes the clipboard with no user gesture 1.5 s after load, which raises the
// warn-tier clipboard toast (the same trigger warning-memory.spec.js uses). Playwright's locator
// polling carries a gesture, so the specs wait idle until the toast is up.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');

const URL = 'http://localhost:5599/clipboard-auto.html';
const HOST = 'scamshield-surface[data-kind=toast]';

async function toastPage(context) {
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForTimeout(3500);
  await expect(page.locator('.scamshield-toast')).toBeVisible();
  return page;
}

test('(a) the toast host is a child of <html> with an open shadow root holding .scamshield-toast', async ({ context }) => {
  const page = await toastPage(context);
  const info = await page.evaluate((sel) => {
    const h = document.querySelector(sel);
    return h && { parentIsHtml: h.parentElement === document.documentElement, open: !!h.shadowRoot, inside: !!(h.shadowRoot && h.shadowRoot.querySelector('.scamshield-toast')), light: !!document.body.querySelector('.scamshield-toast'), theme: h.getAttribute('data-theme') };
  }, HOST);
  expect(info).toEqual({ parentIsHtml: true, open: true, inside: true, light: false, theme: 'auto' });
  await page.close();
});

test('(b) page script removing the host: it re-attaches, then gives up after 3 within 10 s', async ({ context }) => {
  const page = await toastPage(context);
  const remove = () => page.evaluate((sel) => { const h = document.querySelector(sel); if (h) h.remove(); return !!h; }, HOST);
  for (let i = 0; i < 3; i++) {
    expect(await remove()).toBe(true);
    await page.waitForTimeout(250);
    await expect(page.locator(HOST)).toHaveCount(1); // canary: re-attached
    await expect(page.locator('.scamshield-toast')).toBeVisible();
  }
  expect(await remove()).toBe(true); // 4th removal inside the window
  await page.waitForTimeout(500);
  await expect(page.locator(HOST)).toHaveCount(0);
  await page.close();
});

test('(c) a page-script click inside the shadow root does nothing; a real click does', async ({ context }) => {
  const page = await toastPage(context);
  await page.evaluate((sel) => { document.querySelector(sel).shadowRoot.querySelector('button').click(); }, HOST);
  await page.evaluate((sel) => { const b = document.querySelector(sel).shadowRoot.querySelector('.ss-x'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, HOST);
  await page.waitForTimeout(400);
  await expect(page.locator('.scamshield-toast')).toHaveCount(1);
  await page.locator('.scamshield-toast .ss-x').click();
  await expect(page.locator('.scamshield-toast')).toHaveCount(0);
  await page.close();
});

test('(d) data-theme follows the Options theme', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  try {
    await sw.evaluate(() => setSettings({ theme: 'dark' }));
    const page = await toastPage(context);
    await expect(page.locator(HOST)).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel).shadowRoot.querySelector('.scamshield-toast')).backgroundColor, HOST);
    expect(bg).toBe('rgb(23, 31, 27)'); // dark --ss-surface #171F1B
    await page.close();
  } finally { await sw.evaluate(() => setSettings({ theme: 'auto' })); }
});

test('(e) phone width, touch: toast fits 375-24 and every button is >= 44px tall', async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto(URL);
  await page.waitForTimeout(3500);
  const toast = page.locator('.scamshield-toast');
  await expect(toast).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
  const box = await toast.boundingBox();
  expect(box.width).toBeLessThanOrEqual(375 - 24 + 0.5);
  expect(box.x).toBeGreaterThanOrEqual(11.5);
  expect(box.x + box.width).toBeLessThanOrEqual(375 - 11.5);
  const buttons = toast.locator('button');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) expect((await buttons.nth(i).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.close();
});

test('(f) the clipboard toast offers "Report a mistake" and it acknowledges the click', async ({ context }) => {
  const page = await toastPage(context);
  const rep = page.locator('.scamshield-toast .ss-report');
  await expect(rep).toHaveCount(1);
  await rep.click();
  await expect(rep).toHaveText(/thanks/i);
  await expect(rep).toBeDisabled();
  await page.close();
});
