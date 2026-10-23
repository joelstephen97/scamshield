/** Screenshot matrix (0.15.0, Task 14): every alert surface and extension page, across widths x colour
 * scheme x UI language (+ touch), as full-viewport PNGs and an index.html contact sheet. This is a
 * verification tool, NOT the store-listing tool (tools/screenshots.js is untouched).
 *
 *   npm run screenshots:matrix -- [--out DIR] [--only a,b] [--widths 375,1440] [--langs en,ar]
 *                                 [--schemes light,dark] [--no-touch] [--headless]
 *
 * Touch shots are taken twice: -touch-nometa (the fixture page has no <meta viewport>, so the phone gets a ~980px layout
 * viewport zoomed out, like most phishing kits) and -touch-meta (the same page served with one; server.js ?viewport=1).
 * Output: <out>/screenshots/<surface>/<w>-<scheme>-<lang>[-touch-nometa|-touch-meta].png + <out>/index.html.
 * Default <out> is a fresh folder under the OS temp dir, never the repo. Fixtures only, no live sites.
 * --only matches a surface name or its prefix ("banner" = banner-warn + banner-danger). */
const { chromium } = require('@playwright/test');
const path = require('path'); const fs = require('fs'); const os = require('os');
const http = require('http'); const { spawn } = require('child_process');
const { HOST_RULES } = require('./lib/ext-launch');

const EXT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:5599'; const BASE_HTTPS = 'https://localhost:5600';
const ALL_WIDTHS = [320, 375, 768, 1024, 1440, 2560, 3440];
const TOUCH_WIDTHS = [375, 768];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { out: null, only: null, widths: ALL_WIDTHS, langs: ['en', 'de', 'ar'], schemes: ['light', 'dark'], touch: true, headless: false };
  const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') a.out = argv[++i];
    else if (k === '--only') a.only = list(argv[++i]);
    else if (k === '--widths') a.widths = list(argv[++i]).map(Number).filter((n) => n > 0);
    else if (k === '--langs') a.langs = list(argv[++i]);
    else if (k === '--schemes') a.schemes = list(argv[++i]);
    else if (k === '--no-touch') a.touch = false;
    else if (k === '--headless') a.headless = true;
    else throw new Error('unknown argument ' + k);
  }
  for (const s of a.schemes) if (!['light', 'dark'].includes(s)) throw new Error('bad scheme ' + s);
  return a;
}

function fixturesUp() {
  return new Promise((res) => { const r = http.get(BASE + '/clean.html', (x) => { x.resume(); res(x.statusCode === 200); }); r.on('error', () => res(false)); r.setTimeout(1500, () => { r.destroy(); res(false); }); });
}

// ---- trigger helpers ------------------------------------------------------------------------------
// The isolated-world CDP trick tests/e2e use (copy-report.spec.js): content-script globals such as
// ScamShield.actions live in the extension's isolated world, unreachable from page.evaluate.
async function openIso(ctx, page, url) {
  const cdp = await ctx.newCDPSession(page); const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  await cdp.send('Runtime.enable');
  await page.goto(url);
  const find = () => ctxs.find((x) => x.auxData && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
  const run = async (expression) => { const c = find(); return c ? cdp.send('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true }) : null; };
  for (let i = 0; i < 80; i++) { const r = await run('typeof ScamShield !== "undefined" && !!ScamShield.actions'); if (r && r.result.value === true) return run; await sleep(100); }
  throw new Error('content-script world never appeared on ' + url);
}
const waitSel = (page, sel, timeout = 8000) => page.locator(sel).first().waitFor({ state: 'visible', timeout });
const toastOn = (call) => async (ctx, page) => { const run = await openIso(ctx, page, BASE + '/clean.html'); await run(call); await waitSel(page, '.scamshield-toast'); };

// Surfaces rendered into an in-page shadow host. Each trigger leaves the surface open on `page`.
const PAGE_SURFACES = {
  'banner-danger': async (ctx, page) => { await page.goto(BASE + '/phishing-login.html'); await waitSel(page, '.scamshield-banner.danger'); },
  // 0.15.0: no static fixture yields a suspicious+confident verdict, so render the suspicious banner from the
  // isolated world with the same verdict shape content_script builds (copy-report.spec.js does the same).
  'banner-warn': async (ctx, page) => {
    const run = await openIso(ctx, page, BASE_HTTPS + '/clean.html');
    await run(`ScamShield.actions.showBanner({ level: 'suspicious', score: 0.6, flags: ['feed-warn'], reasons: [{ code: 'feedWarn', kind: 'link', params: ['2'] }], reasonCodes: ['feedWarn'] }, { onLeave() {}, onReport() {}, onHide() {} })`);
    await waitSel(page, '.scamshield-banner.suspicious');
  },
  interstitial: async (ctx, page) => { await page.goto(BASE + '/seed-phrase.html'); await waitSel(page, '.scamshield-interstitial'); },
  // Form guard: the dangerous banner appears first, then a password submit raises the modal overlay on top.
  formguard: async (ctx, page) => {
    await page.goto(BASE + '/phishing-login.html'); await waitSel(page, '.scamshield-banner.danger'); await sleep(450);
    await page.fill('input[name="pw"]', 'hunter2'); await page.click('button[type="submit"]'); await waitSel(page, '.scamshield-overlay');
  },
  wallet: async (ctx, page) => { await page.goto(BASE + '/drainer.html'); await sleep(700); await page.click('#go'); await waitSel(page, '.scamshield-overlay'); },
  techscam: async (ctx, page) => { await page.goto(BASE + '/techscam.html'); await waitSel(page, '.scamshield-overlay'); },
  // Toasts: one per kind (ok / warn / notice / danger), driven through the real actions with the real strings.
  'toast-ok': toastOn('ScamShield.actions.supportToast()'),
  'toast-warn': toastOn(`ScamShield.actions.privacyToast({ level: 'warn', title: "Don't click Allow here", text: 'This site is trying to get notification permission using a "click Allow to continue" trick. You can safely Block it.', muteKind: 'notify', onMute() {}, onReport() {} })`),
  'toast-notice': toastOn(`ScamShield.actions.clipboardToast({ tier: 'notice', host: 'docs.example.com', reasons: [{ code: 'clipboardCommand' }], onMute() {}, onReport() {} })`),
  'toast-danger': toastOn(`ScamShield.actions.crossOriginCredToast({ code: 'crossOriginCredPost', params: ['pay.example.net'] }, () => {}, () => {}, () => {})`),
  'toast-danger-frame': toastOn('ScamShield.actions.frameFormBlockedToast()'),
  ack: async (ctx, page) => { const run = await openIso(ctx, page, BASE + '/clean.html'); await run(`ScamShield.actions.ackSurface('example.com', null)`); await waitSel(page, '.scamshield-ack'); }
};

// Extension pages: [file, hash]. The popup is handled separately (it reads the active tab).
const EXT_PAGES = {
  options: ['options.html', ''], blocked: ['blocked.html', '#' + encodeURIComponent(BASE + '/clean.html?ref=matrix')],
  onboarding: ['onboarding.html', ''], goodbye: ['goodbye.html', '']
};
const SURFACES = [...Object.keys(PAGE_SURFACES), 'popup', 'popup-natural', ...Object.keys(EXT_PAGES)];
const selected = (only) => SURFACES.filter((n) => !only || only.some((o) => n === o || n.startsWith(o + '-')));

// ---- capture ---------------------------------------------------------------------------------------
async function capture(ctx, sw, id, name, v, outFile) {
  const page = await ctx.newPage();
  try {
    // 0.15.0 interruption budget: a site gets at most one warn banner per 24 h (engine/budget.js, local
    // 'quietSites'). Clear it so every shot is a first visit; without this only the first banner ever shows.
    await sw.evaluate(() => chrome.storage.local.remove(['quietSites', 'firstSeen']));
    // Reduced motion: the entrance animation and the toast progress bar would otherwise blur the shot.
    await page.emulateMedia({ colorScheme: v.scheme, reducedMotion: 'reduce' });
    if (v.meta) { // serve every fixture page with <meta name="viewport"> (tests/e2e/server.js ?viewport=1)
      const go = page.goto.bind(page);
      page.goto = (url, o) => go(/^https?:/.test(url) ? url + (url.includes('?') ? '&' : '?') + 'viewport=1' : url, o);
    }
    await page.setViewportSize({ width: v.w, height: v.h });
    if (PAGE_SURFACES[name]) await PAGE_SURFACES[name](ctx, page);
    else if (name === 'popup' || name === 'popup-natural') {
      // The popup reads the active tab: open a dangerous page, then the popup, and reload it with the page in front.
      const host = await ctx.newPage(); await host.emulateMedia({ colorScheme: v.scheme, reducedMotion: 'reduce' });
      await host.goto(BASE + '/phishing-login.html'); await sleep(900);
      await page.goto(`chrome-extension://${id}/popup.html`); await host.bringToFront(); await page.reload();
      await page.locator('body').waitFor(); v.cleanup = () => host.close();
    } else { const [f, hash] = EXT_PAGES[name]; await page.goto(`chrome-extension://${id}/${f}${hash}`); }
    await sleep(800);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    // Viewport, not element: overflow and mispositioning must be visible.
    await page.screenshot({ path: outFile, fullPage: false });
  } finally { if (v.cleanup) await v.cleanup().catch(() => {}); delete v.cleanup; await page.close().catch(() => {}); }
}

async function launch(args, touch) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    ...(touch ? { hasTouch: true, isMobile: true } : {}),
    args: [
      ...(args.headless ? ['--headless=new'] : []),
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--no-first-run', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors',
      '--host-resolver-rules=' + HOST_RULES
    ]
  });
  for (let i = 0; i < 30 && !ctx.serviceWorkers()[0]; i++) await sleep(100);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  // Fresh install opens onboarding.html from onInstalled; close it so it can't steal the active tab.
  for (let i = 0; i < 50; i++) { const ob = ctx.pages().find((p) => p.url().includes('/onboarding.html')); if (ob) { await ob.close().catch(() => {}); break; } await sleep(100); }
  return { ctx, sw, id: sw.url().match(/chrome-extension:\/\/([^/]+)/)[1] };
}

function contactSheet(outDir, shots) {
  const bySurface = {};
  for (const s of shots) (bySurface[s.surface] = bySurface[s.surface] || []).push(s);
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = Object.keys(bySurface).map((n) => `<h2>${esc(n)} <small>${bySurface[n].length}</small></h2><div class="g">` +
    bySurface[n].map((s) => `<figure><a href="${esc(s.rel)}"><img loading="lazy" src="${esc(s.rel)}"></a><figcaption>${esc(s.label)}</figcaption></figure>`).join('') + '</div>').join('\n');
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>ScamShield screenshot matrix</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f4f6;color:#111}h2{margin:28px 0 8px}small{color:#666;font-weight:400}.g{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}figure{margin:0;background:#fff;border:1px solid #ccc;padding:6px;max-width:360px}img{width:100%;height:auto;display:block;border:1px solid #ddd}figcaption{font:12px ui-monospace,monospace;margin-top:4px;word-break:break-all}</style>
<h1>ScamShield screenshot matrix</h1><p>${shots.length} images. Click an image for full size.</p>\n${body}`);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || fs.mkdtempSync(path.join(os.tmpdir(), 'scamshield-matrix-')));
  if (outDir.startsWith(EXT + path.sep)) throw new Error('--out must not be inside the repo: ' + outDir);
  const names = selected(args.only);
  if (!names.length) throw new Error('--only matched nothing; surfaces: ' + SURFACES.join(', '));
  let server = null;
  if (!(await fixturesUp())) { server = spawn('node', [path.join(__dirname, '../tests/e2e/server.js')], { stdio: 'ignore' }); await sleep(1000); }
  const shots = []; let failed = 0;
  const variants = [false, ...(args.touch && args.widths.some((w) => TOUCH_WIDTHS.includes(w)) ? [true] : [])];
  try {
    for (const touch of variants) {
      const widths = touch ? args.widths.filter((w) => TOUCH_WIDTHS.includes(w)) : args.widths;
      const { ctx, sw, id } = await launch(args, touch);
      for (const lang of args.langs) {
        // supportAskShown: the one-time 'chip in' toast would otherwise ride along on the first dangerous shot.
        // theme 'auto' so the surfaces follow the emulated colour scheme; uiLang drives every extension string.
        await sw.evaluate(([l]) => setSettings({ uiLang: l, theme: 'auto', supportAskShown: true }), [lang]);
        await sleep(300);
        for (const scheme of args.schemes) for (const name of names) {
          // The popup's natural 380px width is width-independent: shoot it once per scheme/lang (not per --widths).
          const ws = name === 'popup-natural' ? [380] : widths;
          for (const w of ws) for (const meta of (touch ? [false, true] : [false])) {
            const h = name === 'popup-natural' ? 600 : (w < 600 ? 812 : 900);
            const file = `${w}-${scheme}-${lang}${touch ? (meta ? '-touch-meta' : '-touch-nometa') : ''}.png`;
            const rel = `screenshots/${name}/${file}`;
            try { await capture(ctx, sw, id, name, { w, h, scheme, meta }, path.join(outDir, rel)); shots.push({ surface: name, rel, label: `${name} ${file}` }); console.log('  ok  ', rel); }
            catch (e) { failed++; console.log('  FAIL', rel, '-', String(e.message).split('\n')[0]); }
          }
        }
      }
      await ctx.close();
    }
  } finally { if (server) server.kill(); }
  contactSheet(outDir, shots);
  console.log(`Done: ${shots.length} images, ${failed} failed -> ${outDir}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
