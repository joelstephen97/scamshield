// tests/e2e/dialogs.spec.js — the interstitial and dialogs as native <dialog>s on the shadow host
// (0.15.0, Task 13): modal state, body.inert (previous value restored), Tab trap, reopen-if-closed,
// the Details-driven Continue countdown, tiny frames, and layout from 320 px phones to ultra-wide.
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const BASE = 'http://localhost:5599';
const IHOST = 'scamshield-surface[data-kind=interstitial]';
const DHOST = 'scamshield-surface[data-kind=dialog]';

async function interstitial(context, viewport) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(BASE + '/seed-phrase.html');
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
  return page;
}
const state = (page, sel) => page.evaluate((s) => {
  const h = document.querySelector(s); if (!h) return null;
  const d = h.shadowRoot.querySelector('dialog');
  return { open: d.open, modal: d.matches(':modal'), inert: document.body.inert, active: !!h.shadowRoot.activeElement && d.contains(h.shadowRoot.activeElement), docActive: document.activeElement === h };
}, sel);

test('interstitial is a modal <dialog> in a shadow host, body is inert, Leave has focus', async ({ context }) => {
  const page = await interstitial(context);
  const s = await state(page, IHOST);
  expect(s.open).toBe(true);
  expect(s.modal).toBe(true);
  expect(s.inert).toBe(true);
  await expect(page.locator('.scamshield-interstitial .ss-primary')).toBeFocused();
  // the host sits on <html>, never in <body> (an inert body must not disable it)
  expect(await page.evaluate((s) => document.querySelector(s).parentElement === document.documentElement, IHOST)).toBe(true);
  await page.close();
});

test('Tab cycles inside the dialog in both directions and never reaches the page', async ({ context }) => {
  const page = await interstitial(context);
  await page.locator('.ss-details summary').click(); // more controls to cycle through
  const seen = new Set();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const s = await state(page, IHOST);
    expect(s.active, 'focus stayed inside the dialog after Tab #' + (i + 1)).toBe(true);
    seen.add(await page.evaluate((h) => document.querySelector(h).shadowRoot.activeElement.className + '|' + document.querySelector(h).shadowRoot.activeElement.textContent.slice(0, 20), IHOST));
  }
  expect(seen.size).toBeGreaterThan(3); // really cycled through several controls, not stuck
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Shift+Tab');
    expect((await state(page, IHOST)).active).toBe(true);
  }
  await page.close();
});

test('body.inert is true while open and the previous value is restored after (wallet dialog)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/drainer-slow.html');
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.body.inert = true; document.getElementById('go').click(); }); // page had inert=true before ScamShield
  await expect(page.locator('.scamshield-wallet')).toBeVisible({ timeout: 6000 });
  expect((await state(page, DHOST)).inert).toBe(true);
  await expect(page.locator('.scamshield-wallet .ss-primary')).toBeFocused();
  await page.locator('.scamshield-wallet .ss-primary').click();
  await expect(page.locator('.scamshield-wallet')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.inert)).toBe(true); // restored to what the page had, not to false
  await expect.poll(() => page.evaluate(() => window.__settled)).toBe(4001);
  await page.close();
});

test('body.inert returns to false when the interstitial is dismissed', async ({ context }) => {
  const page = await interstitial(context);
  expect(await page.evaluate(() => document.body.inert)).toBe(true);
  await page.locator('.ss-details summary').click();
  const cont = page.locator('.scamshield-interstitial .ss-danger-ghost');
  await expect(cont).toBeEnabled({ timeout: 6000 });
  await cont.click();
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.inert)).toBe(false);
  await page.close();
});

test('page script dialog.close() reopens it; the 4th close escalates to blocked.html', async ({ context, extensionId }) => {
  const page = await interstitial(context);
  const sw = context.serviceWorkers()[0];
  const blockedBefore = await sw.evaluate(() => getSettings().then((s) => s.threatsBlocked || 0));
  const close = () => page.evaluate((s) => { const h = document.querySelector(s); if (h) h.shadowRoot.querySelector('dialog').close(); return !!h; }, IHOST);
  for (let i = 0; i < 3; i++) {
    expect(await close()).toBe(true);
    await expect.poll(async () => (await state(page, IHOST) || {}).modal, { timeout: 3000 }).toBe(true); // canary: it came back
    expect((await state(page, IHOST)).inert).toBe(true);
  }
  await close();
  // (0.15.0, Task 19) The escalation says WHY (?r=escalated) and the page tells the truth: it was not stopped before
  // loading, it kept hiding the warning. It is not a feed/DNR catch, so nothing is counted.
  await expect.poll(() => page.url(), { timeout: 8000 }).toBe('chrome-extension://' + extensionId + '/blocked.html?r=escalated#' + BASE + '/seed-phrase.html');
  await expect(page.locator('#lead')).toHaveText('ScamShield closed this page because it kept hiding the warning.');
  await expect(page.locator('#lead')).not.toContainText('before it could load');
  await expect(page.locator('#src')).toBeHidden();
  await expect(page.locator('#back')).toBeFocused();
  await expect(page.locator('#url')).toHaveText(BASE + '/seed-phrase.html');
  await page.waitForTimeout(800); // a dnrBlocked round trip, if the page wrongly sent one, would have landed by now
  expect(await sw.evaluate(() => getSettings().then((s) => s.threatsBlocked || 0))).toBe(blockedBefore);
  const hist = await sw.evaluate(async () => ((await chrome.storage.local.get('history')).history || []).filter((h) => h.kind === 'blocklist').length);
  expect(hist).toBe(0);
  // Canary for the other direction: the old-style hash-only form (what the DNR redirect produces) is still the list-catch wording.
  const legacy = await context.newPage();
  await legacy.goto('chrome-extension://' + extensionId + '/blocked.html#' + encodeURIComponent('http://block-feed-fixture.example:5599/clean.html'));
  await expect(legacy.locator('#lead')).toContainText('known scam and malicious sites');
  await expect(legacy.locator('#src')).toBeVisible();
  await legacy.close();
  await page.close();
});

test('a page removing the interstitial host: it is re-attached and modal again', async ({ context }) => {
  const page = await interstitial(context);
  await page.evaluate((s) => document.querySelector(s).remove(), IHOST);
  await expect.poll(async () => (await state(page, IHOST) || {}).modal, { timeout: 3000 }).toBe(true);
  await page.close();
});

test('Escape does nothing on the interstitial; a real Escape closes the form guard', async ({ context }) => {
  const page = await interstitial(context);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  expect((await state(page, IHOST)).modal).toBe(true);
  await page.close();
  const p2 = await context.newPage();
  await p2.goto(BASE + '/phishing-login.html');
  await expect(p2.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
  await p2.fill('input[name="pw"]', 'x'); await p2.press('input[name="pw"]', 'Enter'); // banner may cover the button
  await expect(p2.locator('.scamshield-overlay')).toBeVisible();
  expect((await state(p2, DHOST)).inert).toBe(true);
  await p2.keyboard.press('Escape');
  await expect(p2.locator('.scamshield-overlay')).toHaveCount(0);
  expect(await p2.evaluate(() => document.body.inert)).toBe(false);
  await p2.close();
});

test('Continue (unsafe): its countdown has not started before Details opens, and starts on open', async ({ context }) => {
  const page = await interstitial(context);
  const read = () => page.evaluate((s) => { const b = document.querySelector(s).shadowRoot.querySelector('.ss-danger-ghost'); return { text: b.textContent, disabled: b.disabled }; }, IHOST);
  await page.waitForTimeout(4500); // longer than the 3 s arm: if it had started at build it would be spent
  const before = await read();
  expect(before.disabled).toBe(true);
  expect(before.text).toBe('Continue to this site (unsafe)');
  await page.locator('.ss-details summary').click();
  await expect(page.locator('.scamshield-interstitial .ss-danger-ghost')).toContainText(/\(\D*\d\D*\)\s*$/); // "(3)" with the digit bidi-isolated
  expect((await read()).disabled).toBe(true);
  await expect(page.locator('.scamshield-interstitial .ss-danger-ghost')).toBeEnabled({ timeout: 6000 });
  expect((await read()).text).toBe('Continue to this site (unsafe)');
  // closing Details and re-opening re-arms it
  await page.locator('.ss-details summary').click();
  await page.locator('.ss-details summary').click();
  await expect(page.locator('.scamshield-interstitial .ss-danger-ghost')).toBeDisabled();
  await page.close();
});

test('"This site is fine" on the interstitial reports, trusts via:mistake and offers Undo', async ({ context }) => {
  const page = await interstitial(context); const sw = context.serviceWorkers()[0];
  await page.locator('.ss-details summary').click();
  await page.waitForTimeout(400); // past the arm delay
  const fine = page.locator('.scamshield-interstitial .ss-details .ss-report');
  await expect(fine).toHaveText('This site is fine');
  await fine.click();
  await expect(page.locator('.scamshield-interstitial')).toHaveCount(0);
  await expect(page.locator('.scamshield-ack')).toBeVisible();
  const s = await sw.evaluate(() => getSettings()); expect(s.allowlist).toContain('localhost');
  await page.locator('.scamshield-ack .ss-undo').click();
  await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 4000 }); // Undo restores the interstitial
  await sw.evaluate(() => setSettings({ allowlist: [] }));
  await page.close();
});

test('a credential form in a frame under 200x200 is still blocked (no navigation), and the top frame explains', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(BASE + '/iframe-phish-tiny.html');
  await page.waitForTimeout(2500);
  const fr = page.frameLocator('#fr');
  const frame = page.frames().find((f) => f.url().endsWith('/phishing-login.html'));
  await fr.locator('input[name="pw"]').fill('hunter2');
  await fr.locator('input[name="pw"]').press('Enter');
  await expect(page.locator('.scamshield-toast')).toContainText(/embedded frame/i, { timeout: 8000 });
  await page.waitForTimeout(1000);
  expect(frame.url()).toBe(BASE + '/phishing-login.html'); // the POST to evil-collector.tk never navigated the frame
  await expect(fr.locator('.scamshield-overlay')).toHaveCount(0); // nothing rendered inside the frame itself
  await page.close();
  const big = await context.newPage();
  await big.goto(BASE + '/iframe-phish.html');
  await big.waitForTimeout(2500);
  const bf = big.frameLocator('#fr');
  await bf.locator('input[name="pw"]').fill('x');
  await bf.locator('button[type="submit"]').click();
  await expect(bf.locator('.scamshield-overlay')).toBeVisible({ timeout: 8000 }); // canary: a normal frame gets the dialog
  await big.close();
});

for (const [w, h] of [[320, 568], [375, 667], [1920, 1080], [3440, 1440]]) {
  test(`layout at ${w}x${h}: centred card, no horizontal overflow, every button reachable`, async ({ context }) => {
    const page = await interstitial(context, { width: w, height: h });
    await page.locator('.ss-details summary').click();
    const m = await page.evaluate((s) => {
      const root = document.querySelector(s).shadowRoot; const dlg = root.querySelector('dialog'); const card = root.querySelector('.ss-card');
      const c = card.getBoundingClientRect();
      return {
        docOver: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        dlgOver: dlg.scrollWidth > dlg.clientWidth, cardOver: card.scrollWidth > card.clientWidth,
        cardW: c.width, cardTop: c.top, cardBottom: innerHeight - c.bottom, vw: innerWidth, vh: innerHeight, fits: card.scrollHeight <= card.clientHeight
      };
    }, IHOST);
    expect(m.docOver).toBe(false); expect(m.dlgOver).toBe(false); expect(m.cardOver).toBe(false);
    expect(m.cardW).toBeLessThanOrEqual(Math.min(680, m.vw - 32) + 0.5);
    expect(m.cardTop).toBeGreaterThanOrEqual(11.5); expect(m.cardBottom).toBeGreaterThanOrEqual(11.5);
    if (m.fits) expect(Math.abs(m.cardTop - m.cardBottom)).toBeLessThanOrEqual(2); // vertically centred when it fits
    const buttons = page.locator('.scamshield-interstitial button, .scamshield-interstitial summary');
    const n = await buttons.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i); await b.scrollIntoViewIfNeeded();
      await expect(b).toBeVisible();
      const r = await b.boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(-0.5); expect(r.x + r.width).toBeLessThanOrEqual(w + 0.5);
      expect(r.y).toBeGreaterThanOrEqual(-0.5); expect(r.y + r.height).toBeLessThanOrEqual(h + 0.5);
      if (w < 600 && await b.evaluate((e) => e.tagName === 'BUTTON')) expect(r.height).toBeGreaterThanOrEqual(43.5); // phone: stacked, >= 44px
    }
    await page.close();
  });
}

// ---- 0.15.0 final fix B: watching the open shadow roots ----------------------------------------------------------------
test('hardening (a): a page rewriting the host style (display:none, tiny box) gets BASE_STYLE back', async ({ context }) => {
  const page = await interstitial(context);
  await page.evaluate((s) => { const h = document.querySelector(s); h.style.cssText = 'display:none!important'; h.setAttribute('hidden', ''); }, IHOST);
  await page.waitForTimeout(400);
  const r = await page.evaluate((s) => { const h = document.querySelector(s); const d = h.shadowRoot.querySelector('dialog'); return { display: getComputedStyle(h).display, hidden: h.hasAttribute('hidden'), pos: getComputedStyle(h).position, open: d.open, rect: d.getBoundingClientRect().width }; }, IHOST);
  expect(r.hidden).toBe(false);
  expect(r.display).not.toBe('none');
  expect(r.pos).toBe('fixed');
  expect(r.open).toBe(true);
  expect(r.rect).toBeGreaterThan(100);
  await page.close();
});

test('hardening (b): a page removing the open attribute from our dialog, or emptying our shadow root, is undone', async ({ context }) => {
  const page = await interstitial(context);
  await page.evaluate((s) => { const d = document.querySelector(s).shadowRoot.querySelector('dialog'); d.removeAttribute('open'); }, IHOST);
  await page.waitForTimeout(400);
  expect((await state(page, IHOST)).modal).toBe(true);
  await page.evaluate((s) => { const sr = document.querySelector(s).shadowRoot; const d = sr.querySelector('dialog'); d.remove(); }, IHOST);
  await page.waitForTimeout(500);
  const s2 = await state(page, IHOST);
  expect(s2 && s2.modal).toBe(true);
  await page.close();
});

test('hardening (c): a page dialog opened after ours is stacked below it again (close+showModal)', async ({ context }) => {
  const page = await interstitial(context);
  await page.evaluate(() => {
    const d = document.createElement('dialog');
    d.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;padding:0;background:#fff';
    d.innerHTML = '<p>Page dialog over everything</p>';
    document.body.appendChild(d);
    d.showModal();
  });
  await page.waitForTimeout(700);
  const top = await page.evaluate((s) => {
    const h = document.querySelector(s); const b = h.shadowRoot.querySelector('.ss-primary').getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { onTop: hit === h, modal: h.shadowRoot.querySelector('dialog').matches(':modal') };
  }, IHOST);
  expect(top).toEqual({ onTop: true, modal: true });
  await page.close();
});

test('re-stack (re-review I3): two page dialogs opened 200 ms apart still end up below ours', async ({ context }) => {
  const page = await interstitial(context);
  await page.evaluate(() => new Promise((resolve) => {
    const mk = (t) => { const d = document.createElement('dialog'); d.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;padding:0;background:#fff'; d.innerHTML = '<p>' + t + '</p>'; document.body.appendChild(d); d.showModal(); };
    mk('first'); setTimeout(() => { mk('second'); resolve(); }, 200);
  }));
  await page.waitForTimeout(1200);
  const top = await page.evaluate((s) => {
    const h = document.querySelector(s); const b = h.shadowRoot.querySelector('.ss-primary').getBoundingClientRect();
    return { onTop: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === h, modal: h.shadowRoot.querySelector('dialog').matches(':modal') };
  }, IHOST);
  expect(top).toEqual({ onTop: true, modal: true });
  await page.close();
});
