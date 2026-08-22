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
      '--host-resolver-rules=MAP amazon.ae 127.0.0.1, MAP accounts.google.com 127.0.0.1, MAP shop.contoso-fixture.com 127.0.0.1, MAP portal-hr-benefits.fixture 127.0.0.1, MAP www.aramex.com 127.0.0.1'
    ]
  });
  for (let i = 0; i < 30 && !ctx.serviceWorkers()[0]; i++) await sleep(100);
  const sw = ctx.serviceWorkers()[0]; const id = sw.url().match(/chrome-extension:\/\/([^/]+)/)[1];
  await sw.evaluate(() => chrome.storage.local.set({ history: [
    { ts: Date.now() - 7200000, host: 'secure-paypa1-login.com', kind: 'page', level: 'dangerous' },
    { ts: Date.now() - 90000000, host: 'claim-airdrop.site', kind: 'wallet', level: 'dangerous' },
    { ts: Date.now() - 300000000, host: 'pc-alert-0093.top', kind: 'techscam', level: 'dangerous' } ] }));
  await sw.evaluate(() => setSettings({ threatsBlocked: 23, whatsNewSeen: '0.5.0' }));

  async function compose(name, caption, shotPng, w, h, theme) {
    const f = await ctx.newPage(); await f.setViewportSize({ width: 1280, height: 800 });
    await f.goto(FRAME + '?caption=' + encodeURIComponent(caption) + (theme === 'dark' ? '&theme=dark' : ''));
    await f.evaluate(([d, w, h]) => window.__setShot(d, w, h), ['data:image/png;base64,' + shotPng.toString('base64'), w, h]);
    await sleep(200); await f.screenshot({ path: path.join(OUT, name) }); await f.close(); console.log('  ✓', name);
  }
  async function popupShot(contentPage, theme) {
    if (theme) await sw.evaluate((t) => setSettings({ theme: t }), theme);
    const p = await ctx.newPage(); await p.setViewportSize({ width: 340, height: 600 });
    // popup reads the active tab (api.tabs.query({active:true, currentWindow:true}))
    // via getVerdict — activate the content tab, then reload the popup *without*
    // bringing the popup itself back to front, or tabs.query would see the
    // popup's own extension-page tab as "active" and report a false "safe".
    await p.goto(`chrome-extension://${id}/popup.html`); await contentPage.bringToFront(); await p.reload(); await sleep(700);
    const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewportSize({ width: 340, height: Math.min(600, h) });
    const png = await p.screenshot(); await p.close(); if (theme) await sw.evaluate(() => setSettings({ theme: 'auto' })); return { png, w: 340, h: Math.min(600, h) };
  }
  console.log('Capturing…');
  // 1 popup on a dangerous look-alike page
  let page = await ctx.newPage(); await page.goto(BASE + '/brand-visual.html'); await sleep(900);
  let s = await popupShot(page); await compose('01-popup-dangerous.png', 'Spots fake login pages before you type', s.png, s.w, s.h); await page.close();
  // 2 in-page banner with rescue
  page = await ctx.newPage(); await page.setViewportSize({ width: 1100, height: 640 }); await page.goto(BASE + '/brand-visual.html'); await page.locator('.scamshield-banner').waitFor({ timeout: 8000 });
  await compose('02-banner-rescue.png', 'One click back to the real site', await page.screenshot(), 1100, 640); await page.close();
  // 3 popup safe + message checker open with a verdict
  page = await ctx.newPage(); await page.goto(BASE + '/clean.html'); await sleep(500);
  const pp = await ctx.newPage(); await pp.setViewportSize({ width: 340, height: 600 }); await pp.goto(`chrome-extension://${id}/popup.html`); await page.bringToFront(); await pp.reload(); await sleep(500);
  // Message text matches the proven-dangerous case from tests/e2e/detection.spec.js
  // ("popup message checker flags a scam text on-device") — an arbitrary
  // "customs fee" message scored only 1 reason and stayed under the
  // safe/suspicious threshold, which produced a contradictory-looking shot
  // (green "Looks safe" banner sitting above a scam-wording reason bullet).
  await pp.click('#msgcheck summary'); await pp.fill('#msgtext', 'Your account will be blocked today. Share your OTP to verify: http://verify-bank-login.tk/otp'); await pp.click('#msgbtn'); await sleep(300);
  const h3 = await pp.evaluate(() => document.body.scrollHeight); await pp.setViewportSize({ width: 340, height: Math.min(600, h3) });
  // The message-check result renders below the fold, and Playwright's
  // click()/fill() auto-scroll their target into view — not the result that
  // appears afterwards — so without an explicit scroll here the capture
  // lands mid-page (header cut off, result cut off). Despite popup.css's
  // `body{...max-height:600px;overflow:auto}`, body's own internal overflow
  // never actually engages here (a flex-container/min-height:auto quirk lets
  // it grow taller than its max-height instead of clipping), so it's the
  // page itself — document.documentElement — that scrolls; scroll that to
  // the bottom so the full result (the last content before the footer)
  // renders in frame.
  await pp.evaluate(() => { document.documentElement.scrollTop = document.documentElement.scrollHeight; window.scrollTo(0, document.documentElement.scrollHeight); });
  await sleep(50);
  await compose('03-message-checker.png', 'Check any SMS or WhatsApp message, privately', await pp.screenshot(), 340, Math.min(600, h3)); await pp.close(); await page.close();
  // 4 options dark
  await sw.evaluate(() => setSettings({ theme: 'dark' }));
  page = await ctx.newPage(); await page.setViewportSize({ width: 960, height: 620 }); await page.goto(`chrome-extension://${id}/options.html`); await sleep(400);
  await compose('04-settings-dark.png', 'Everything runs on your device', await page.screenshot(), 960, 620, 'dark'); await page.close(); await sw.evaluate(() => setSettings({ theme: 'auto' }));
  // 5 wallet overlay
  page = await ctx.newPage(); await page.setViewportSize({ width: 1100, height: 640 }); await page.goto(BASE + '/drainer.html'); await sleep(700); await page.click('#go'); await page.locator('.scamshield-overlay').waitFor({ timeout: 6000 });
  await compose('05-wallet-guard.png', 'Stops wallet drainers and scare pop-ups', await page.screenshot(), 1100, 640); await page.close();
  await ctx.close(); server.kill(); console.log('Done →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
