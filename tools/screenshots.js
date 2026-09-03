/** Store screenshots: capture real UI at true size, compose into 1280x800 frames.
 * Run: npm run screenshots  → store/screenshots/0N-*.png */
const { chromium } = require('@playwright/test');
const path = require('path'); const fs = require('fs'); const { spawn } = require('child_process');
const EXT = path.resolve(__dirname, '..'); const OUT = path.resolve(__dirname, '../store/screenshots'); const BASE = 'http://localhost:5599';
const FRAME = 'file://' + path.join(__dirname, 'frame.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', [path.join(__dirname, '../tests/e2e/server.js')], { stdio: 'ignore' }); await sleep(800);
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run', '--disable-gpu', '--disable-dev-shm-usage',
      '--window-size=1280,800',
      // Same test-only trust + hostname mapping as tests/e2e/fixtures.js, so
      // the fixture pages (brand-visual.html etc.) resolve and render as they
      // do under the real e2e suite.
      '--ignore-certificate-errors',
      '--host-resolver-rules=MAP amazon.ae 127.0.0.1, MAP accounts.google.com 127.0.0.1, MAP shop.contoso-fixture.com 127.0.0.1, MAP portal-hr-benefits.fixture 127.0.0.1, MAP www.aramex.com 127.0.0.1, MAP secure-paypa1-login.com 127.0.0.1'
    ]
  });
  for (let i = 0; i < 30 && !ctx.serviceWorkers()[0]; i++) await sleep(100);
  const sw = ctx.serviceWorkers()[0]; const id = sw.url().match(/chrome-extension:\/\/([^/]+)/)[1];
  await sw.evaluate(() => chrome.storage.local.set({ history: [
    { ts: Date.now() - 7200000, host: 'secure-paypa1-login.com', kind: 'page', level: 'dangerous' },
    { ts: Date.now() - 90000000, host: 'claim-airdrop.site', kind: 'wallet', level: 'dangerous' },
    { ts: Date.now() - 300000000, host: 'pc-alert-0093.top', kind: 'techscam', level: 'dangerous' } ] }));
  // whatsNewSeen is pinned to the CURRENT what's-new version so the popup's
  // "New in 0.8…" banner stays dismissed. It sits below the 600px fold on the
  // dangerous shot either way, but the language-picker shot's popup is short
  // enough to show it, and a stale version banner is not what that shot is
  // about.
  await sw.evaluate(() => setSettings({ threatsBlocked: 23, whatsNewSeen: '0.12.0' }));

  // Statistics-tab seed. The dashboard is the one surface that looks empty on
  // a fresh profile — a store shot of it has to show a real install's worth of
  // history, so the day ring is filled with plausible traffic before capture.
  // Deterministic (a tiny LCG, not Math.random) so re-running the script
  // reproduces the same chart rather than a new one each time.
  function seedBuckets(days) {
    let s = 20250823; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    // UTC day keys, matching background/stats.js dayKey().
    const key = (i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      if (i === 4 || i === 12 || i === 21) continue; // a few quiet days — real installs have them
      const b = { d: key(i), checked: 30 + Math.floor(rnd() * 61), threats: 0, privacy: 0 };
      if ([1, 3, 8, 14, 19, 25].includes(i)) b.threats = i === 8 ? 2 : 1;
      if ([0, 2, 6, 9, 15, 20, 24, 26].includes(i)) b.privacy = 1 + Math.floor(rnd() * 2);
      out.push(b);
    }
    return out;
  }
  async function seedStats() {
    const statsDaily = seedBuckets(28);
    await sw.evaluate((d) => chrome.storage.local.set({
      statsDaily: d.statsDaily,
      pagesCheckedTotal: 4213,
      privacyFindingsTotal: 19,
      threatsByType: { phishing: 11, fakeShop: 5, wallet: 4, techSupport: 3 },
      installedAt: d.installedAt,
      // A 150-day-old install with 23 blocks satisfies every condition in
      // ui/review.js, so the popup would start showing its "Rate ScamShield"
      // card from here on and cover the language menu in shot 4. 'declined' is
      // the one permanently-ineligible state.
      reviewAsk: { state: 'declined', asks: 0, snoozeUntil: 0 }
    }), { statsDaily, installedAt: Date.now() - 150 * 86400000 });
    // threatsBlocked lives in settings (not the ring) and drives the all-time
    // tile; page visits earlier in this run bump it, so restore the seeded
    // value right before the dashboard is captured.
    await sw.evaluate(() => setSettings({ threatsBlocked: 23 }));
  }

  async function compose(name, caption, shotPng, w, h, theme) {
    const f = await ctx.newPage(); await f.setViewportSize({ width: 1280, height: 800 });
    await f.goto(FRAME + '?caption=' + encodeURIComponent(caption) + (theme === 'dark' ? '&theme=dark' : ''));
    await f.evaluate(([d, w, h]) => window.__setShot(d, w, h), ['data:image/png;base64,' + shotPng.toString('base64'), w, h]);
    await sleep(200); await f.screenshot({ path: path.join(OUT, name) }); await f.close(); console.log('  ✓', name);
  }
  // `after` runs on the settled popup page (menus opened, fields filled) just
  // before it is measured and shot.
  async function popupShot(contentPage, theme, after) {
    if (theme) await sw.evaluate((t) => setSettings({ theme: t }), theme);
    const p = await ctx.newPage(); await p.setViewportSize({ width: 340, height: 600 });
    // popup reads the active tab (api.tabs.query({active:true, currentWindow:true}))
    // via getVerdict — activate the content tab, then reload the popup *without*
    // bringing the popup itself back to front, or tabs.query would see the
    // popup's own extension-page tab as "active" and report a false "safe".
    await p.goto(`chrome-extension://${id}/popup.html`); await contentPage.bringToFront(); await p.reload(); await sleep(700);
    if (after) await after(p);
    const full = await p.evaluate(() => document.body.scrollHeight);
    let h = Math.min(600, full);
    if (full > 600) {
      // 0.8.0 grew the popup (hero counters, why-this-verdict panel, rotating
      // footer) past the 600px cap popup.css puts on <body> (real installs
      // scroll for it — see tests/e2e/popup.spec.js). A static store shot
      // can't scroll, and stopping the capture at a flat 600px lands mid-tile
      // or mid-footer, which reads as broken rather than "scrollable". Stop
      // instead at the lowest *complete* top-level section so the shot always
      // ends on a clean edge.
      h = await p.evaluate((cap) => {
        const els = document.querySelectorAll('body > *, main > *, footer > *');
        let best = 0;
        for (const el of els) {
          // Skip anything not in normal document flow (the #toast notification
          // is position:fixed/opacity:0 off in a corner regardless of scroll
          // position — it is not a content boundary) and anything hidden.
          if (el.hidden || getComputedStyle(el).position === 'fixed') continue;
          const rect = el.getBoundingClientRect();
          if (rect.height <= 0 || rect.bottom > cap) continue;
          if (rect.bottom > best) best = rect.bottom;
        }
        // Degenerate case: one tall section (the auto-open why-verdict panel
        // on a signal-heavy page) spans the cap, so no "complete section"
        // boundary exists below it and `best` collapses to the status card.
        // A real popup shows exactly cap-height with a scrollbar there — so
        // does the shot.
        if (best < cap * 0.65) return cap;
        return Math.round(best) || cap;
      }, 600);
    }
    await p.setViewportSize({ width: 340, height: h });
    const png = await p.screenshot(); await p.close(); if (theme) await sw.evaluate(() => setSettings({ theme: 'auto' })); return { png, w: 340, h };
  }
  console.log('Capturing…');
  // 1 popup on a dangerous look-alike page — served from the mapped
  // secure-paypa1-login.com:5600 HTTPS fixture (not localhost:5599) so the
  // popup's host line reads like a real phishing domain. brand-visual.html
  // already carries "PayPal" in its title/og tags, which trips the NAME rule
  // on this host and produces the brand = paypal rescue button.
  let page = await ctx.newPage(); await page.goto('https://secure-paypa1-login.com:5600/brand-visual.html'); await sleep(900);
  let s = await popupShot(page); await compose('01-popup-dangerous.png', 'Spots fake login pages before you type', s.png, s.w, s.h); await page.close();
  // 2 Statistics tab, dark. Seeded immediately before capture: the dangerous
  // page visited for shot 1 bumps the very counters this dashboard draws, so
  // seeding at the top of the run would show 24 threats and a today bucket
  // that does not match the rest of the seeded ring.
  await seedStats();
  await sw.evaluate(() => setSettings({ theme: 'dark' }));
  // 980px wide is the narrowest viewport that still fits all four stat tiles
  // on one row (208px nav + main's 28px padding leaves 716px, and the tiles
  // grid needs 4×160 + 3×10 = 670).
  const OW = 980;
  page = await ctx.newPage(); await page.setViewportSize({ width: OW, height: 700 }); await page.goto(`chrome-extension://${id}/options.html#stats`); await sleep(600);
  // The 30-day view is the one that shows the ring off: 7 days is a handful of
  // bars, and "All time" collapses 90 days into 14 grouped buckets.
  await page.click('#statsseg button[data-p="30"]'); await sleep(500);
  // Match the viewport to the rendered dashboard instead of guessing: too
  // short clips the Recent list and the privacy footer (and draws a
  // scrollbar), too tall leaves the sidebar trailing empty space.
  const OH = Math.min(920, Math.max(640, await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))));
  await page.setViewportSize({ width: OW, height: OH }); await sleep(400);
  await compose('02-statistics.png', 'See the work it does — counted on your device, never sent', await page.screenshot(), OW, OH, 'dark'); await page.close();
  await sw.evaluate(() => setSettings({ theme: 'auto' }));
  // 3 in-page banner with rescue — a shorter, narrower viewport so the
  // banner (a thin bar pinned to the top of the page) occupies much more of
  // the frame's cropped area instead of sitting atop a tall slab of empty
  // page background.
  page = await ctx.newPage(); await page.setViewportSize({ width: 900, height: 360 }); await page.goto(BASE + '/brand-visual.html'); await page.locator('.scamshield-banner').waitFor({ timeout: 8000 });
  await compose('03-banner-rescue.png', 'One click back to the real site', await page.screenshot(), 900, 360); await page.close();
  // 4 popup on a safe page with the header globe menu open. buildLangMenu()
  // fills the dropdown after the popup's async settings/locale read resolves,
  // so wait for the items to exist before clicking — the same guard
  // tests/e2e/lang.spec.js uses — then click #langbtn itself (not a
  // setLangMenu() call) so the real open path runs.
  page = await ctx.newPage(); await page.goto(BASE + '/clean.html'); await sleep(600);
  s = await popupShot(page, null, async (pp) => {
    await pp.waitForFunction(() => document.querySelectorAll('#langdd .langitem').length > 0);
    await pp.click('#langbtn');
    await pp.locator('#langdd').waitFor({ state: 'visible' });
    // The dropdown scrolls internally (popup.css caps it at 260px), and
    // focusing the checked item can leave it mid-list; pin it to the top so
    // "Browser default ✓" leads the list in the shot.
    await pp.evaluate(() => { document.getElementById('langdd').scrollTop = 0; document.documentElement.scrollTop = 0; });
    await sleep(200);
  });
  await compose('04-language-picker.png', 'Speaks your language — 20 of them', s.png, s.w, s.h); await page.close();
  // 5 wallet overlay
  page = await ctx.newPage(); await page.setViewportSize({ width: 1100, height: 640 }); await page.goto(BASE + '/drainer.html'); await sleep(700); await page.click('#go'); await page.locator('.scamshield-overlay').waitFor({ timeout: 6000 });
  await compose('05-wallet-guard.png', 'Stops wallet drainers and scare pop-ups', await page.screenshot(), 1100, 640); await page.close();
  // 6 QR / quishing scan (0.11.0). The qr-quishing.html fixture embeds a
  // real QR PNG encoding a URL that trips local heuristics alone (see
  // tests/e2e/qr.spec.js). Open the popup's "Scan this page for QR codes"
  // <details>, press "Scan now" and wait for the per-code result chips.
  page = await ctx.newPage(); await page.goto(BASE + '/qr-quishing.html'); await sleep(700);
  s = await popupShot(page, null, async (pp) => {
    await pp.locator('#qrcheck').waitFor({ state: 'visible' });
    await pp.evaluate(() => { document.getElementById('qrcheck').open = true; });
    await pp.click('#qrscanbtn');
    await pp.locator('#qrresult').waitFor({ state: 'visible', timeout: 8000 });
    await pp.locator('#qrlist li').first().waitFor({ timeout: 8000 });
    // The QR card sits below the pause menu, hero counters, quick actions
    // and recent-history list — well past the 600px fold on a page that has
    // just logged a catch. This shot is about the QR card, so hide the
    // in-between sections (shot 1 already shows them) and pin the scroll to
    // the top so the header, status card and QR card land in one frame.
    await pp.evaluate(() => {
      for (const sel of ['#siteacts', '#whypanel', '#actions', '#recent', '#shopcard', '#privacycard']) { const el = document.querySelector(sel); if (el) el.hidden = true; }
      const tiles = document.getElementById('tile-since'); if (tiles && tiles.parentElement) tiles.parentElement.hidden = true;
      document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    });
    await sleep(300);
  });
  await compose('06-qr-scan.png', 'Checks QR codes before your phone does', s.png, s.w, s.h); await page.close();
  // 7 the network-level block page (0.12.0). Install a dynamic block rule for
  // the mapped secure-paypa1-login.com fixture host through the worker's own
  // applyNetworkRules() (block + redirect rules, exactly as an OTA would),
  // then navigate: the redirect rule lands on blocked.html#<url>.
  await sw.evaluate(async () => { await applyNetworkRules(['||secure-paypa1-login.com^'], true); });
  page = await ctx.newPage(); await page.setViewportSize({ width: 900, height: 560 });
  await page.goto('https://secure-paypa1-login.com:5600/brand-visual.html'); await page.waitForURL(/blocked\.html#/, { timeout: 8000 }); await sleep(900);
  await compose('07-blocked-page.png', 'Known scam sites never even load', await page.screenshot(), 900, 560); await page.close();
  await ctx.close(); server.kill(); console.log('Done →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
