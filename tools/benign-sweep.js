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

const GOTO_MS = 20000;        // domcontentloaded budget per navigation attempt
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
  const rec = { url, finalUrl: null, surfaces: [], badge: '', verdict: null, tier: null, surfaceLog: [], errors: [] };
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
    rec.tier = (await read('window.__ssLastTier').catch(() => null)) || null;
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
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: null,
    args: [
      ...(args.headless ? ['--headless=new'] : []),
      `--disable-extensions-except=${args.ext}`, `--load-extension=${args.ext}`,
      '--lang=en-US', '--no-first-run', '--no-default-browser-check',
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
    fs.writeFileSync(args.out, '');
    for (let i = 0; i < sites.length; i++) {
      sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => sw);
      let timer;
      const rec = await Promise.race([
        visit(context, sw, sites[i], makeReader),
        new Promise((res) => { timer = setTimeout(() => res({ url: sites[i], finalUrl: null, surfaces: [], badge: '', verdict: null, tier: null, surfaceLog: [], errors: ['timeout: site budget exceeded'] }), SITE_BUDGET_MS); }),
      ]);
      clearTimeout(timer);
      results.push(rec);
      fs.appendFileSync(args.out, JSON.stringify(rec) + '\n');
      const flag = rec.surfaces.length || rec.surfaceLog.length ? ' SURFACE' : rec.badge ? ' badge=' + rec.badge : '';
      console.log(`[${i + 1}/${sites.length}] ${rec.url} -> ${rec.finalUrl || '-'} tier=${rec.tier} ${rec.errors.length ? 'err=' + rec.errors.length : 'ok'}${flag}`);
      // Popups a site opened must not accumulate: keep at most the pages that were open before this visit.
      for (const p of context.pages()) if (!p.isClosed() && p.url() !== 'about:blank' && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  }
  return summarize(results, args.out);
}

function summarize(results, out) {
  const kinds = {};
  const bad = [];
  const badged = [];
  let errored = 0;
  for (const r of results) {
    if (r.errors.length) errored++;
    for (const s of r.surfaces) { const k = 'dom:' + s.cls.split(/\s+/)[0]; kinds[k] = (kinds[k] || 0) + 1; }
    for (const s of r.surfaceLog) { const k = 'log:' + s.kind; kinds[k] = (kinds[k] || 0) + 1; }
    if (r.surfaces.length || r.surfaceLog.length) bad.push(r);
    else if (r.badge) badged.push(r);
  }
  console.log('\n=== SWEEP SUMMARY ===');
  console.log(`sites: ${results.length}  with errors/timeouts: ${errored}  with surfaces: ${bad.length}  badge only: ${badged.length}`);
  console.log('surface kinds: ' + (Object.keys(kinds).length ? JSON.stringify(kinds) : 'none'));
  for (const r of bad) console.log(`SURFACE ${r.finalUrl || r.url} dom=${JSON.stringify(r.surfaces.map((s) => s.cls))} log=${JSON.stringify(r.surfaceLog.map((s) => s.kind))} verdict=${JSON.stringify(r.verdict)}`);
  for (const r of badged) console.log(`BADGE   ${r.finalUrl || r.url} badge=${r.badge} verdict=${JSON.stringify(r.verdict)}`);
  console.log('results: ' + out);
  return bad.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
