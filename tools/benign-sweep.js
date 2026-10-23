#!/usr/bin/env node
// Live benign-site sweep (0.15.0). Loads the unpacked extension in a headed Chrome, visits every
// site in a list the way a user would (settle, scroll, focus an input, copy a code block) and records
// whatever ScamShield did. The release gate is ZERO in-page surfaces: exit code 1 if any fired or
// the local surfaceLog grew on any site. Badges alone are listed for review but do not fail the run.
// Not part of CI (real network, real sites). Never touches the user's Chrome profile: a fresh temp
// profile is used per run, Chrome runs with --lang=en-US.
//
// Usage: node tools/benign-sweep.js --sites tools/sweep-sites/tranco-500.txt [--out <file.jsonl>]
//        [--ext <path>] [--limit N] [--headless] [--no-update]
// --headed is the default (browser automation is always visible); --headless is opt-in only.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GOTO_MS = 30000;        // domcontentloaded budget per navigation attempt
const SITE_BUDGET_MS = 45000; // hard cap per site; a stuck page is recorded as a timeout and the sweep moves on

function parseArgs(argv) {
  const a = { sites: null, out: null, ext: path.resolve(__dirname, '..'), limit: Infinity, headless: false, update: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--sites') a.sites = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--ext') a.ext = path.resolve(argv[++i]);
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--headed') a.headless = false;
    else if (k === '--headless') a.headless = true;
    else if (k === '--no-update') a.update = false;
    else throw new Error('unknown argument: ' + k);
  }
  if (!a.sites) throw new Error('usage: node tools/benign-sweep.js --sites <file> [--out <jsonl>] [--ext <path>] [--limit N] [--headless]');
  if (!a.out) a.out = path.join(os.tmpdir(), `scamshield-sweep-${Date.now()}.jsonl`);
  return a;
}

function readSites(file, limit) {
  const urls = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  return urls.slice(0, Number.isFinite(limit) ? limit : undefined);
}

// ONE place that defines "an in-page surface". Runs in the page. Today: any element whose class
// contains "scamshield" or has a token starting "ss-". Part 2 moves surfaces into shadow hosts; add
// their host selector here and nowhere else.
function collectSurfaces() {
  const out = [];
  const isSurface = (el) => {
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
    // (0.15.0 part 2) surfaces live in open shadow roots under <scamshield-surface> hosts: the walk below
    // pierces every open shadowRoot, and the host itself counts as a surface.
    if (el.localName === 'scamshield-surface') return 'scamshield-surface';
    if (!cls) return null;
    if (/scamshield/i.test(cls)) return cls;
    return cls.split(/\s+/).some((c) => c.startsWith('ss-')) ? cls : null;
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = isSurface(el);
      if (c) out.push({ tag: el.tagName.toLowerCase(), cls: c.trim().slice(0, 120) });
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
}

// Network-level failures where the apex may still work. Not HTTP errors, not timeouts.
const HOST_DOWN = /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT)|ERR_ADDRESS_UNREACHABLE|ERR_SSL|ERR_CERT/;

async function visit(context, sw, url, makeReader) {
  const page = await context.newPage();
  const rec = { url, finalUrl: null, surfaces: [], badge: '', verdict: null, tier: null, scanned: false, trusted: false, unscanned: false, navFailed: false, surfaceLog: [], errors: [] };
  try {
    await page.bringToFront().catch(() => {});
    const logBefore = await sw.evaluate(() => readSurfaceLog()).catch(() => []);
    const cdp = await context.newCDPSession(page);
    const read = await makeReader(cdp);
    let target = url;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: GOTO_MS });
        ok = true;
      } catch (e) {
        const msg = String((e && e.message) || e).split('\n')[0];
        rec.errors.push(`goto ${target}: ${msg}`);
        if (attempt === 0 && /^https:\/\/www\./.test(target) && HOST_DOWN.test(msg)) { target = target.replace('://www.', '://'); continue; }
        break;
      }
    }
    rec.navFailed = !ok;
    if (ok) {
      await page.waitForTimeout(6000);
      for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 2500).catch(() => {}); await page.waitForTimeout(2000); }
      // First visible input: focus only, never type.
      await page.evaluate(() => {
        const i = [...document.querySelectorAll('input:not([type=hidden]),textarea')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        if (i) i.focus();
      }).catch((e) => rec.errors.push('focus: ' + e.message));
      // First <pre>/code text: select and Ctrl+C (copy-guard paths).
      const hadCode = await page.evaluate(() => {
        const n = document.querySelector('pre, code');
        if (!n || !(n.textContent || '').trim()) return false;
        const r = document.createRange(); r.selectNodeContents(n);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true;
      }).catch(() => false);
      if (hadCode) { await page.keyboard.press('Control+C').catch(() => {}); }
      await page.waitForTimeout(800);
    }
    rec.finalUrl = page.url();
    rec.surfaces = await page.evaluate(collectSurfaces).catch((e) => { rec.errors.push('surfaces: ' + e.message); return []; });
    // Poll up to 8 s for the top frame's isolated world to report. A null tier is NOT a read bug: the content
    // script returns before scoring on trusted hosts (built-in safe list, content_script.js isTrustedHost) and
    // only reports a safe verdict. So: scanned = a tier was set; trusted = engine loaded and host on the safe
    // list (deliberately skipped, can never interrupt); anything else is "unscanned" and counts against the run.
    let probe = null;
    for (let t = 0; t < 16 && ok; t++) {
      probe = await read(PROBE).catch(() => null);
      if (probe && (probe.tier || probe.trusted)) break;
      await page.waitForTimeout(500);
    }
    rec.tier = (probe && probe.tier) || null;
    rec.engine = !!(probe && probe.engine);
    rec.trusted = !!(probe && !probe.tier && probe.trusted);
    rec.scanned = !!rec.tier;
    rec.unscanned = ok && !rec.scanned && !rec.trusted;
    const tab = (await sw.evaluate(() => chrome.tabs.query({}))).filter((t) => t.url === rec.finalUrl).pop();
    if (tab) {
      rec.badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tab.id).catch(() => '');
      const v = await sw.evaluate(async (id) => { const k = 'verdict:' + id; const s = await chrome.storage.session.get(k); return s[k] || null; }, tab.id).catch(() => null);
      if (v) rec.verdict = { level: v.level, score: v.score, reasons: (v.reasons || v.flags || []).map((r) => (typeof r === 'string' ? r : r.id || r.code || r.reason || JSON.stringify(r))).slice(0, 12) };
    }
    // Key diff, not length: the ring is capped, so a length delta would lie once it is full.
    const seen = new Set(logBefore.map((r) => `${r.ts}|${r.host}|${r.kind}`));
    const logAfter = await sw.evaluate(() => readSurfaceLog()).catch(() => []);
    rec.surfaceLog = logAfter.filter((r) => !seen.has(`${r.ts}|${r.host}|${r.kind}`));
  } catch (e) {
    rec.errors.push('sweep: ' + String((e && e.message) || e).split('\n')[0]);
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
  }
  return rec;
}

const PROBE = '({ tier: window.__ssLastTier || null, engine: !!(window.ScamShield && ScamShield.scoreUrl), trusted: !!(window.ScamShield && ScamShield.isSafeHost && ScamShield.isSafeHost(location.hostname)) })';

// Reads a global from the TOP frame's isolated (extension) world over CDP, as hard-benign-pack.spec.js does.
async function makeReader(cdp) {
  const ctxs = [];
  cdp.on('Runtime.executionContextCreated', (e) => ctxs.push(e.context));
  cdp.on('Runtime.executionContextDestroyed', (e) => { const i = ctxs.findIndex((x) => x.id === e.executionContextId); if (i >= 0) ctxs.splice(i, 1); });
  await cdp.send('Runtime.enable');
  return async (expression) => {
    const top = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    // Last match: navigation leaves destroyed contexts earlier in the list.
    const c = ctxs.slice().reverse().find((x) => x.auxData && x.auxData.frameId === top && x.auxData.type === 'isolated' && /^chrome-extension:\/\//.test(x.origin || ''));
    return c ? cdp.send('Runtime.evaluate', { expression, contextId: c.id, returnByValue: true }).then((r) => r.result.value).catch(() => null) : null;
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const sites = readSites(args.sites, args.limit);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scamshield-sweep-profile-'));
  console.log(`sweep: ${sites.length} sites, headless=${args.headless}, ext=${args.ext}, out=${args.out}`);
  const servers = await startFixtureServers();
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: null,
    args: [
      ...(args.headless ? ['--headless=new'] : []),
      `--disable-extensions-except=${args.ext}`, `--load-extension=${args.ext}`,
      '--lang=en-US', '--no-first-run', '--no-default-browser-check',
      // Canary fixtures only: lookalike host -> local fixture server (self-signed cert, same as the e2e suite).
      '--ignore-certificate-errors',
      `--host-resolver-rules=MAP paypa1-verify-human.com 127.0.0.1:${servers.httpsPort}, MAP scamshield-test-blocked.example 127.0.0.1:${servers.httpPort}`,
    ],
    locale: 'en-US',
  });
  const results = [];
  try {
    let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    for (let i = 0; i < 50; i++) {
      const ob = context.pages().find((p) => p.url().includes('/onboarding.html'));
      if (ob) { await ob.close().catch(() => {}); break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    await sw.evaluate(() => awaitBootReady()).catch(() => {});
    if (args.update) {
      for (const fn of ['runFeedUpdate', 'runHotUpdate', 'runOtaUpdate']) {
        const r = await sw.evaluate((f) => globalThis[f]().then((x) => (x === undefined ? 'ok' : x)), fn).catch((e) => 'ERR ' + e.message);
        console.log(`${fn}: ${typeof r === 'string' ? r : JSON.stringify(r).slice(0, 160)}`);
      }
    }
    const canaryFails = await runCanaries(context, sw, servers);
    if (canaryFails.length) { console.error('CANARY FAILED, aborting before the sweep:\n  ' + canaryFails.join('\n  ')); throw new Error('canary'); }
    console.log('canaries: phish banner + blocked redirect OK');
    fs.writeFileSync(args.out, '');
    for (let i = 0; i < sites.length; i++) {
      sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => sw);
      let timer;
      const rec = await Promise.race([
        visit(context, sw, sites[i], makeReader),
        new Promise((res) => { timer = setTimeout(() => res({ url: sites[i], finalUrl: null, surfaces: [], badge: '', verdict: null, tier: null, scanned: false, trusted: false, unscanned: false, navFailed: true, surfaceLog: [], errors: ['timeout: site budget exceeded'] }), SITE_BUDGET_MS); }),
      ]);
      clearTimeout(timer);
      results.push(rec);
      fs.appendFileSync(args.out, JSON.stringify(rec) + '\n');
      const flag = rec.surfaces.length || rec.surfaceLog.length ? ' SURFACE' : rec.badge ? ' badge=' + rec.badge : '';
      console.log(`[${i + 1}/${sites.length}] ${rec.url} -> ${rec.finalUrl || '-'} tier=${rec.tier}${rec.trusted ? '(trusted)' : rec.unscanned ? '(UNSCANNED)' : ''} ${rec.errors.length ? 'err=' + rec.errors.length : 'ok'}${flag}`);
      // Popups a site opened must not accumulate: keep at most the pages that were open before this visit.
      for (const p of context.pages()) if (!p.isClosed() && p.url() !== 'about:blank' && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
    }
  } finally {
    servers.close();
    await context.close().catch(() => {});
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  }
  return summarize(results, args.out);
}

// --- Positive canary: prove detection works in THIS profile before trusting a "0 surfaces" result. ---
const CERT_DIR = path.resolve(__dirname, '..', 'tests', 'e2e', 'certs');
const PAGES_DIR = path.resolve(__dirname, '..', 'tests', 'e2e', 'pages');
function startFixtureServers() {
  const http = require('http');
  const https = require('https');
  const handler = (req, res) => {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.resolve(PAGES_DIR, '.' + (p === '/' ? '/clean.html' : p));
    if (!file.startsWith(PAGES_DIR + path.sep)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }); res.end(buf);
    });
  };
  const h = http.createServer(handler);
  const s = https.createServer({ key: fs.readFileSync(path.join(CERT_DIR, 'localhost.key')), cert: fs.readFileSync(path.join(CERT_DIR, 'localhost.crt')) }, handler);
  return new Promise((resolve) => h.listen(0, '127.0.0.1', () => s.listen(0, '127.0.0.1', () => resolve({
    httpPort: h.address().port, httpsPort: s.address().port, close: () => { h.close(); s.close(); },
  }))));
}

async function runCanaries(context, sw, ports) {
  const fails = [];
  // 1) lookalike login page must raise a warn banner (same fixture as hard-benign-2.spec.js).
  const page = await context.newPage();
  try {
    await page.goto(`https://paypa1-verify-human.com:${ports.httpsPort}/challenge-phish.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    let surfaces = [];
    let logRows = [];
    for (let i = 0; i < 16 && !surfaces.length && !logRows.some((r) => r.kind === 'banner'); i++) {
      await page.waitForTimeout(500);
      surfaces = await page.evaluate(collectSurfaces).catch(() => []);
      logRows = await sw.evaluate(() => readSurfaceLog()).catch(() => []);
    }
    if (!surfaces.length && !logRows.some((r) => r.kind === 'banner')) fails.push('phish canary: no banner and no surfaceLog banner row');
  } catch (e) { fails.push('phish canary: ' + String(e.message).split('\n')[0]); }
  await page.close().catch(() => {});
  // 2) the packaged blocklist must redirect to blocked.html (dynamic redirect rules land on boot, so retry).
  const bp = await context.newPage();
  try {
    let landed = false;
    for (let i = 0; i < 6 && !landed; i++) {
      await bp.goto('http://scamshield-test-blocked.example/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      landed = /blocked\.html/.test(bp.url());
      if (!landed) await bp.waitForTimeout(1000);
    }
    if (!landed) fails.push('block canary: ended at ' + bp.url());
  } catch (e) { fails.push('block canary: ' + String(e.message).split('\n')[0]); }
  await bp.close().catch(() => {});
  await sw.evaluate(() => chrome.storage.local.remove('surfaceLog')).catch(() => {});
  return fails;
}

function summarize(results, out) {
  const kinds = {};
  const bad = [];
  const badged = [];
  let errored = 0;
  const reachable = results.filter((r) => !r.navFailed);
  const unscanned = reachable.filter((r) => r.unscanned);
  const trusted = reachable.filter((r) => r.trusted);
  for (const r of results) {
    if (r.errors.length) errored++;
    for (const s of r.surfaces) { const k = 'dom:' + s.cls.split(/\s+/)[0]; kinds[k] = (kinds[k] || 0) + 1; }
    for (const s of r.surfaceLog) { const k = 'log:' + s.kind; kinds[k] = (kinds[k] || 0) + 1; }
    if (r.surfaces.length || r.surfaceLog.length) bad.push(r);
    else if (r.badge) badged.push(r);
  }
  console.log('\n=== SWEEP SUMMARY ===');
  console.log(`sites: ${results.length}  with errors/timeouts: ${errored}  with surfaces: ${bad.length}  badge only: ${badged.length}`);
  console.log(`reachable: ${reachable.length}  scanned: ${reachable.filter((r) => r.scanned).length}  trusted-skip (safe list, by design): ${trusted.length}  unscanned: ${unscanned.length}`);
  for (const r of unscanned) console.log(`UNSCANNED ${r.finalUrl || r.url}`);
  const unscannedFail = reachable.length > 0 && unscanned.length / reachable.length > 0.05;
  if (unscannedFail) console.log(`FAIL: ${unscanned.length}/${reachable.length} reachable sites unscanned (> 5%), the sweep proves nothing`);
  console.log('surface kinds: ' + (Object.keys(kinds).length ? JSON.stringify(kinds) : 'none'));
  for (const r of bad) console.log(`SURFACE ${r.finalUrl || r.url} dom=${JSON.stringify(r.surfaces.map((s) => s.cls))} log=${JSON.stringify(r.surfaceLog.map((s) => s.kind))} verdict=${JSON.stringify(r.verdict)}`);
  for (const r of badged) console.log(`BADGE   ${r.finalUrl || r.url} badge=${r.badge} verdict=${JSON.stringify(r.verdict)}`);
  console.log('results: ' + out);
  return bad.length || unscannedFail ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { if (!e || e.message !== 'canary') console.error(e); process.exit(2); });
