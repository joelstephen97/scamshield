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

// ---------------------------------------------------------------------------------------------
// Banner (0.15.0, Task 12): floating card / bottom sheet, wrapping text, keyboard menu, RTL.
// phishing-login.html raises the dangerous banner; brand-visual.html adds a brand comparison and a
// long headline ("Dangerous page - looks like X, but isn't").
const BANNER = 'http://localhost:5599/phishing-login.html';
const BRAND = 'http://localhost:5599/brand-visual.html';
const BHOST = 'scamshield-surface[data-kind=banner]';

async function bannerPage(context, url, size) {
  const page = await context.newPage();
  if (size) await page.setViewportSize(size);
  await page.goto(url);
  await expect(page.locator('.scamshield-banner')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(450); // entrance animation + arm delay
  return page;
}
const kbFocus = (page) => page.evaluate((sel) => { const a = document.querySelector(sel).shadowRoot.activeElement; return a ? (a.getAttribute('role') || '') + ':' + a.className : null; }, BHOST);

for (const w of [1440, 3440]) {
  test(`banner (${w}px): a floating card <= 880px wide, centred, near the top, in the top layer`, async ({ context }) => {
    const page = await bannerPage(context, BANNER, { width: w, height: 900 });
    const box = await page.locator('.scamshield-banner').boundingBox();
    expect(box.width).toBeLessThanOrEqual(880.5);
    expect(box.width).toBeGreaterThan(300);
    expect(Math.abs(box.x + box.width / 2 - w / 2)).toBeLessThanOrEqual(2);
    expect(box.y).toBeGreaterThanOrEqual(11.5); expect(box.y).toBeLessThanOrEqual(40);
    expect(await page.evaluate((sel) => document.querySelector(sel).matches(':popover-open'), BHOST)).toBe(true);
    // Fallback path (no popover support): the host's own fixed positioning must hold the same geometry.
    await page.evaluate((sel) => { const h = document.querySelector(sel); h.hidePopover(); h.removeAttribute('popover'); }, BHOST);
    const box2 = await page.locator('.scamshield-banner').boundingBox();
    expect(Math.abs(box2.x - box.x)).toBeLessThanOrEqual(1); expect(Math.abs(box2.y - box.y)).toBeLessThanOrEqual(1); expect(Math.abs(box2.width - box.width)).toBeLessThanOrEqual(1);
    await page.close();
  });
}

test('banner (375px): a bottom sheet - full width, anchored to the bottom, 44px controls, top radius only', async ({ context }) => {
  const page = await bannerPage(context, BANNER, { width: 375, height: 812 });
  const box = await page.locator('.scamshield-banner').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(375 - 1);
  expect(Math.abs(box.y + box.height - 812)).toBeLessThanOrEqual(2);
  const r = await page.evaluate((sel) => { const c = getComputedStyle(document.querySelector(sel).shadowRoot.querySelector('.scamshield-banner')); return [c.borderTopLeftRadius, c.borderBottomLeftRadius]; }, BHOST);
  expect(parseFloat(r[0])).toBeGreaterThan(0); expect(parseFloat(r[1])).toBe(0);
  const btns = page.locator('.scamshield-banner .ss-acts > button');
  const n = await btns.count(); expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) expect((await btns.nth(i).boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  // the actions row stacks under the text, not beside it
  const textBox = await page.locator('.scamshield-banner .ss-text').boundingBox(); const actsBox = await page.locator('.scamshield-banner .ss-acts').boundingBox();
  expect(actsBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height - 1);
  // the labelled close drops its visible text on a phone but keeps its aria-label
  await expect(page.locator('.scamshield-banner .ss-x .ss-x-label')).toBeHidden();
  expect(await page.locator('.scamshield-banner .ss-x').getAttribute('aria-label')).toBeTruthy();
  await page.close();
});

test('banner: a long German headline wraps (height grows) and is not clipped', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ uiLang: 'de' }));
  // one page, resized: the warn budget allows a single banner per site per day
  const narrow = await bannerPage(context, BRAND, { width: 360, height: 800 });
  const measure = (p) => p.evaluate((sel) => {
    const root = document.querySelector(sel).shadowRoot; const b = root.querySelector('.ss-text b'); const card = root.querySelector('.scamshield-banner');
    const cs = getComputedStyle(b); const line = parseFloat(cs.lineHeight) || 18;
    return { lines: Math.round(b.getBoundingClientRect().height / line), clipped: b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1, overflow: cs.textOverflow, ws: cs.whiteSpace, cardRight: card.getBoundingClientRect().right, cardLeft: card.getBoundingClientRect().left };
  }, BHOST);
  const m = await measure(narrow);
  expect(m.ws).not.toBe('nowrap'); expect(m.overflow).not.toBe('ellipsis');
  expect(m.lines).toBeGreaterThanOrEqual(2); // wrapped
  expect(m.clipped).toBe(false);
  expect(m.cardLeft).toBeGreaterThanOrEqual(-0.5); expect(m.cardRight).toBeLessThanOrEqual(360.5);
  await narrow.setViewportSize({ width: 1440, height: 900 }); await narrow.waitForTimeout(200);
  expect((await measure(narrow)).clipped).toBe(false);
  await narrow.close();
});

test('banner: the menu is role=menu with menuitems and a full keyboard model; Escape returns focus to the trigger', async ({ context }) => {
  const page = await bannerPage(context, BANNER, { width: 1280, height: 800 });
  const more = page.locator('.scamshield-banner .ss-more');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const menu = page.locator('.scamshield-banner .ss-menu');
  await expect(menu).toHaveAttribute('role', 'menu');
  const items = menu.locator('[role=menuitem]');
  const n = await items.count(); expect(n).toBeGreaterThanOrEqual(2);
  expect(await menu.locator('button').count()).toBe(n); // every control in the menu is a menuitem
  expect(await kbFocus(page)).toMatch(/^menuitem:/); // opens with the first item focused
  const first = await kbFocus(page);
  await page.keyboard.press('ArrowDown'); expect(await kbFocus(page)).not.toBe(first);
  await page.keyboard.press('End'); const last = await kbFocus(page);
  await page.keyboard.press('ArrowDown'); expect(await kbFocus(page)).toBe(first); // wraps
  await page.keyboard.press('ArrowUp'); expect(await kbFocus(page)).toBe(last); // wraps back
  await page.keyboard.press('Home'); expect(await kbFocus(page)).toBe(first);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(await kbFocus(page)).toBe(':ss-btn ss-more');
  await page.close();
});

test('banner: "Why?" toggles aria-expanded and the reasons list', async ({ context }) => {
  const page = await bannerPage(context, BANNER, { width: 1280, height: 800 });
  const why = page.locator('.scamshield-banner .ss-why');
  await expect(why).toHaveCount(1);
  const list = page.locator('.scamshield-banner .ss-why-list');
  await expect(why).toHaveAttribute('aria-expanded', 'false'); await expect(list).toBeHidden();
  await why.click();
  await expect(why).toHaveAttribute('aria-expanded', 'true'); await expect(list).toBeVisible();
  await why.click();
  await expect(why).toHaveAttribute('aria-expanded', 'false'); await expect(list).toBeHidden();
  await page.close();
});

test('banner: the menu opens from the inline-end edge toward inline-start, in LTR and in RTL (ar)', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  const geo = async (page) => {
    await page.locator('.scamshield-banner .ss-more').click(); await page.waitForTimeout(100);
    return page.evaluate((sel) => { const r = document.querySelector(sel).shadowRoot; const a = r.querySelector('.ss-acts').getBoundingClientRect(); const m = r.querySelector('.ss-menu').getBoundingClientRect(); return { aL: a.left, aR: a.right, mL: m.left, mR: m.right, dir: r.querySelector('.scamshield-banner').getAttribute('dir') }; }, BHOST);
  };
  const ltr = await bannerPage(context, BANNER, { width: 1280, height: 800 });
  const g1 = await geo(ltr);
  expect(g1.dir).toBe('ltr'); expect(Math.abs(g1.mR - g1.aR)).toBeLessThanOrEqual(2); expect(g1.mL).toBeLessThan(g1.aR);
  await ltr.close();
  await sw.evaluate(() => setSettings({ uiLang: 'ar' }));
  // second page uses another mapped host: the warn budget allows one banner per site per day
  const rtl = await bannerPage(context, 'http://secure-paypa1-login.com:5599/phishing-login.html', { width: 1280, height: 800 });
  const g2 = await geo(rtl);
  expect(g2.dir).toBe('rtl'); expect(Math.abs(g2.mL - g2.aL)).toBeLessThanOrEqual(2); expect(g2.mR).toBeGreaterThan(g2.aL);
  await rtl.close();
});

test('banner: dark theme - white text on the darker solid red; primary reads danger-solid on white', async ({ context }) => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => setSettings({ theme: 'dark' }));
  const page = await bannerPage(context, BRAND, { width: 1280, height: 800 });
  const c = await page.evaluate((sel) => { const r = document.querySelector(sel).shadowRoot; const b = getComputedStyle(r.querySelector('.scamshield-banner')); const p = getComputedStyle(r.querySelector('.ss-rescue')); return { bg: b.backgroundColor, color: b.color, pbg: p.backgroundColor, pcolor: p.color }; }, BHOST);
  expect(c.bg).toBe('rgb(185, 28, 28)'); expect(c.color).toBe('rgb(255, 255, 255)');
  expect(c.pbg).toBe('rgb(255, 255, 255)'); expect(c.pcolor).toBe('rgb(185, 28, 28)');
  await page.close();
});
