// tests/e2e/a11y.spec.js — the accessibility gate (0.15.0, Task 19).
//   1. axe-core on popup, options, blocked, onboarding (3 steps), demo (banner + stop page), goodbye, and the real in-page
//      surfaces (danger banner, suspicious banner, interstitial), in light AND dark. Gate: 0 serious / critical violations.
//   2. A keyboard-only walk of every Options section: Tab reaches every control, and each one shows a visible focus.
//   3. A 200% zoom / reflow check: no horizontal scroll on the popup or blocked.html.
// Fixtures and extension pages only; goodbye.html is opened from disk (it is a static Pages file, not part of the zip).
const { test } = require('./fixtures');
const { expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('path');
const { pathToFileURL } = require('url');
const BASE = 'http://localhost:5599';
const BASE_HTTPS = 'https://localhost:5600';
const BLOCKED_TARGET = encodeURIComponent(BASE + '/clean.html?ref=a11y');

// The gate. `disabled` is empty on purpose: if a rule ever has to be switched off, name it here with the reason.
const DISABLED_RULES = [];
async function axeScan(page, include) {
  let b = new AxeBuilder({ page }).disableRules(DISABLED_RULES);
  if (include) b = b.include(include);
  const res = await b.analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const brief = bad.map((v) => v.id + ' (' + v.impact + '): ' + v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' => ' + (n.any[0] || n.all[0] || n.none[0] || {}).message).join(' | '));
  expect(brief, 'serious/critical axe violations').toEqual([]);
  return res;
}
const SCHEMES = ['light', 'dark'];

for (const scheme of SCHEMES) {
  test.describe(`axe, ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });
    const open = async (context, url, viewport) => {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      if (viewport) await page.setViewportSize(viewport);
      await page.goto(url);
      return page;
    };

    test('popup, options (every section), blocked, escalated blocked', async ({ context, extensionId }) => {
      const X = `chrome-extension://${extensionId}`;
      let page = await open(context, `${X}/popup.html`);
      await page.locator('body').waitFor();
      await axeScan(page);
      await page.close();
      for (const tab of ['protection', 'trusted', 'history', 'surfaces', 'stats', 'feed', 'about']) {
        page = await open(context, `${X}/options.html#${tab}`, { width: 1100, height: 800 });
        await expect(page.locator('.tab:visible').first()).toBeVisible();
        await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
        await axeScan(page);
        await page.close();
      }
      page = await open(context, `${X}/blocked.html#${BLOCKED_TARGET}`);
      await expect(page.locator('#back')).toBeFocused();
      const res = await axeScan(page);
      // Not vacuous: contrast was really evaluated on this page (axe skips it when it cannot resolve a background).
      expect(res.passes.some((p) => p.id === 'color-contrast' && p.nodes.length > 3)).toBe(true);
      await page.close();
      page = await open(context, `${X}/blocked.html?r=escalated#${BLOCKED_TARGET}`);
      await expect(page.locator('#lead')).toContainText('kept hiding');
      await axeScan(page);
      await page.close();
    });

    test('onboarding (3 steps), demo (banner + stop page), goodbye', async ({ context, extensionId }) => {
      const X = `chrome-extension://${extensionId}`;
      let page = await open(context, `${X}/onboarding.html`);
      for (const n of [1, 2, 3]) {
        if (n > 1) await page.locator(`#s${n - 1} [data-go="${n}"]`).click();
        await expect(page.locator(`#s${n}`)).toBeVisible();
        await axeScan(page);
      }
      await page.close();

      page = await open(context, `${X}/demo.html`);
      await expect(page.locator('.scamshield-banner.danger')).toBeVisible();
      await axeScan(page); // the whole page, shadow surface included
      await page.click('#tabStop');
      await expect(page.locator('.scamshield-interstitial')).toBeVisible();
      await axeScan(page, 'scamshield-surface');
      await page.close();

      page = await open(context, pathToFileURL(path.join(__dirname, '..', '..', 'goodbye.html')).href + '?v=0.15.0');
      await axeScan(page);
      await page.click('#reasons button >> nth=1');
      await expect(page.locator('#note')).toHaveText('ScamShield uninstall reason: it broke a site, version 0.15.0');
      await axeScan(page);
      await page.close();
    });

    test('the real in-page surfaces: danger banner, suspicious banner, interstitial', async ({ context }) => {
      let page = await open(context, BASE + '/phishing-login.html');
      await expect(page.locator('.scamshield-banner.danger')).toBeVisible({ timeout: 8000 });
      await axeScan(page, 'scamshield-surface');
      await page.close();

      // The suspicious banner has no static fixture; render it from the content script's isolated world, like copy-report.spec.js.
      page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const cdp = await context.newCDPSession(page);
      const ctxs = [];
      cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
      await cdp.send('Runtime.enable');
      await page.goto(BASE_HTTPS + '/clean.html');
      await expect.poll(() => ctxs.some((c) => c.auxData && c.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(c.origin || ''))).toBe(true);
      const iso = ctxs.find((c) => c.auxData && c.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(c.origin || ''));
      await cdp.send('Runtime.evaluate', {
        contextId: iso.id,
        expression: `ScamShield.actions.showBanner({ level: 'suspicious', score: 0.6, flags: ['feed-warn'], reasons: [{ code: 'feedWarn', kind: 'link', params: ['2'] }, { code: 'newDomain', kind: 'url' }], reasonCodes: ['feedWarn'] }, { onLeave() {}, onReport() {}, onHide() {} })`
      });
      await expect(page.locator('.scamshield-banner.suspicious')).toBeVisible();
      await axeScan(page, 'scamshield-surface');
      await page.close();

      page = await open(context, BASE + '/seed-phrase.html');
      await expect(page.locator('.scamshield-interstitial')).toBeVisible({ timeout: 8000 });
      await page.locator('.scamshield-interstitial .ss-details summary').click(); // the folded options are part of the card
      await axeScan(page, 'scamshield-surface');
      await page.close();
    });
  });
}

// ---- keyboard-only walk of Options ---------------------------------------------------------------------------------
test('Options: Tab reaches every control in every section, each with a visible focus indicator', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const tab of ['protection', 'trusted', 'history', 'surfaces', 'stats', 'feed', 'about']) {
    await page.goto(`chrome-extension://${extensionId}/options.html#${tab}`);
    await expect(page.locator('.tab:visible').first()).toBeVisible();
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    // Every focusable control in the nav and the visible panel.
    const total = await page.evaluate(() => {
      const SEL = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
      const shown = (el) => {
        if (el.disabled || el.closest('[hidden]')) return false;
        const box = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        // A visually-hidden switch checkbox ('.sr') is shown through its label.
        return box(el) || (el.closest('label') && box(el.closest('label')));
      };
      const roots = [document.querySelector('nav'), document.querySelector('.tab:not([hidden])') || document.querySelector('main')];
      const els = roots.flatMap((r) => Array.from(r.querySelectorAll(SEL))).filter(shown);
      els.forEach((el, i) => el.setAttribute('data-kbd', String(i)));
      return els.length;
    });
    expect(total).toBeGreaterThan(3);
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    const seen = new Set(), unfocused = [];
    for (let i = 0; i < total + 40 && seen.size < total; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const vis = (n) => { const s = getComputedStyle(n); return (parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none') || (s.boxShadow && s.boxShadow !== 'none'); };
        const label = a.closest('label');
        const candidates = [a, label, label && label.querySelector('i'), a.nextElementSibling, a.parentElement];
        const ok = candidates.filter(Boolean).some(vis);
        return { id: a.getAttribute('data-kbd'), desc: a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.getAttribute('data-i18n') ? '[' + a.getAttribute('data-i18n') + ']' : ''), ok };
      });
      if (!r || r.id == null) continue;
      if (!seen.has(r.id)) seen.add(r.id);
      if (!r.ok) unfocused.push(r.desc);
    }
    test.info().annotations.push({ type: tab, description: total + ' controls' });
    expect(seen.size, `${tab}: Tab reached ${seen.size} of ${total} controls`).toBe(total);
    expect([...new Set(unfocused)], `${tab}: controls with no visible focus indicator`).toEqual([]);
  }
});

// ---- 200% zoom / reflow --------------------------------------------------------------------------------------------
// A 1280 px window at 200% zoom is a 640 CSS px viewport (a popup is capped near 400 CSS px there); WCAG 1.4.10 reflow is
// 320 CSS px. Neither may scroll sideways.
test('no horizontal scroll at 200% zoom / 320 px: popup and blocked.html', async ({ context, extensionId }) => {
  const X = `chrome-extension://${extensionId}`;
  const overflow = (page) => page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth
  }));
  const cases = [
    { name: 'popup', url: `${X}/popup.html`, widths: [400, 320] },
    { name: 'blocked', url: `${X}/blocked.html#${BLOCKED_TARGET}`, widths: [640, 320] },
    { name: 'blocked (escalated)', url: `${X}/blocked.html?r=escalated#${BLOCKED_TARGET}`, widths: [640, 320] }
  ];
  for (const c of cases) {
    for (const w of c.widths) {
      const page = await context.newPage();
      await page.setViewportSize({ width: w, height: 700 });
      await page.goto(c.url);
      await page.locator('body').waitFor();
      await page.waitForTimeout(300);
      const o = await overflow(page);
      expect(o.doc, `${c.name} @${w}px documentElement overflow`).toBeLessThanOrEqual(0);
      expect(o.body, `${c.name} @${w}px body overflow`).toBeLessThanOrEqual(0);
      await page.close();
    }
    // The same through the browser's own zoom (Emulation.setPageScaleFactor is pinch zoom, so use CSS zoom on the root).
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(c.url);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await page.waitForTimeout(300);
    const o = await overflow(page);
    expect(o.doc, `${c.name} zoom:2 documentElement overflow`).toBeLessThanOrEqual(0);
    await page.close();
  }
});
