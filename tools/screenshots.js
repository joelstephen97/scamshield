/**
 * Generate store screenshots by driving the real extension with Playwright.
 * Run: node tools/screenshots.js   (output: store/screenshots/*.png, 1280x800)
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const EXT = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, '../store/screenshots');
const BASE = 'http://localhost:5599';
const VW = { width: 1280, height: 800 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', [path.join(__dirname, '../tests/e2e/server.js')], { stdio: 'ignore' });
  await sleep(800);

  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: VW,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run', '--disable-gpu', '--disable-dev-shm-usage',
      '--window-size=1280,800'
    ]
  });
  for (let i = 0; i < 30 && !ctx.serviceWorkers()[0]; i++) await sleep(100);

  async function shot(name, url, prep) {
    const page = await ctx.newPage();
    await page.setViewportSize(VW);
    await page.goto(url);
    try { if (prep) await prep(page); } catch (e) { console.log('  ! prep failed for', name, e.message); }
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('  ✓', name);
    await page.close();
  }

  console.log('Capturing store screenshots @1280x800 ...');

  await shot('01-phishing-login.png', BASE + '/phishing-login.html', async (p) => {
    await p.locator('.scamshield-banner').waitFor({ timeout: 8000 });
  });
  await shot('02-brand-impersonation.png', BASE + '/brand-visual.html', async (p) => {
    await p.locator('.scamshield-banner').waitFor({ timeout: 8000 });
  });
  await shot('03-wallet-guard.png', BASE + '/drainer.html', async (p) => {
    await sleep(700);
    await p.click('#go');
    await p.locator('.scamshield-overlay').waitFor({ timeout: 6000 });
  });
  await shot('04-techsupport-scam.png', BASE + '/techscam.html', async (p) => {
    await p.locator('.scamshield-overlay').waitFor({ timeout: 8000 });
  });
  await shot('05-clipboard-guard.png', BASE + '/clipboard.html', async (p) => {
    await p.bringToFront();
    await p.click('#c');
    await p.locator('.scamshield-toast').waitFor({ timeout: 6000 });
  });

  // Popup (default state). Open as a page; sits top-left on the 1280x800 canvas.
  const sw = ctx.serviceWorkers()[0];
  if (sw) {
    const id = sw.url().match(/chrome-extension:\/\/([^/]+)/)[1];
    const popup = await ctx.newPage();
    await popup.setViewportSize(VW);
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await sleep(500);
    await popup.screenshot({ path: path.join(OUT, '06-popup.png') });
    console.log('  ✓ 06-popup.png');
  }

  await ctx.close();
  server.kill();
  console.log('Done →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
