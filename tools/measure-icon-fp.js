#!/usr/bin/env node
// tools/measure-icon-fp.js — measures the icon/favicon brand-hash false-positive
// rate against real-world sites. Visits the first 400 Tranco domains, collects
// icon candidates exactly like content/content_script.js's iconCandidates(),
// hashes them in-page with engine/image_hash.js, and matches against
// engine/brand_icons.json. A "match" is a false positive when the visited
// site's registrable domain is NOT in the matched brand's BRAND_DOMAINS.
// Run: npm run measure:icon-fp   (network + Playwright required)
// CLI: --sites=N (default 400), --maxdist=N (default THRESHOLDS.iconHamming),
// --timeout=Nms (default 15000, per-site navigation timeout).
'use strict';
const { chromium } = require('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const C = require('../engine/constants');
const H = require('../scripts/lib/crawl_helpers');
// The page-side hash comes back over evaluate() as a plain hex string, so
// brand matching itself is cheap enough to run here in Node (not inside the
// page) against the same table, using the same implementation the extension
// ships (engine/image_hash.js's matchBrand).
const { matchBrand } = require('../engine/image_hash');

const IH_SRC = fs.readFileSync(path.join(__dirname, '..', 'engine', 'image_hash.js'), 'utf8');
const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'engine', 'brand_icons.json'), 'utf8'));
const TRANCO_URL = 'https://tranco-list.eu/top-1m.csv.zip';
const SITE_COUNT = Number((process.argv.find((a) => a.startsWith('--sites=')) || '').split('=')[1] || 400);
const MAX_DIST = Number((process.argv.find((a) => a.startsWith('--maxdist=')) || '').split('=')[1] || (C.THRESHOLDS.iconHamming || 6));
const NAV_TIMEOUT = Number((process.argv.find((a) => a.startsWith('--timeout=')) || '').split('=')[1] || 15000);

// In-page candidate collection mirrors content/content_script.js iconCandidates()
// (rel icon, apple-touch-icon, /favicon.ico, <=2 logo imgs >=40px).
// Assigns explicitly onto globalThis: Playwright's addInitScript evaluates
// the source in a way that does NOT hoist a bare top-level `function foo(){}`
// declaration onto the real global object (unlike a plain <script> tag), so a
// later page.evaluate(() => foo()) throws "foo is not defined" — confirmed by
// running this exact pattern standalone. engine/image_hash.js avoids this by
// explicitly assigning onto its `root` (globalThis) parameter; mirror that here.
const COLLECT_CANDIDATES_SRC = `
  globalThis.__ssIconCandidates = function () {
    const out = [];
    const add = (h) => { try { const u = new URL(h, location.href); if (/^https?:$/.test(u.protocol)) out.push(u.href); } catch (_) {} };
    document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach((l) => add(l.getAttribute('href') || ''));
    add('/favicon.ico');
    [...document.querySelectorAll('img')].filter((i) => /logo/i.test((i.getAttribute('src') || '') + ' ' + (i.getAttribute('alt') || '') + ' ' + i.className + ' ' + i.id) && (i.naturalWidth >= 40 || i.width >= 40)).slice(0, 2).forEach((i) => add(i.getAttribute('src') || ''));
    return [...new Set(out)].slice(0, 6);
  };
`;

async function fetchFeed(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'ParryFpMeasure/0.5' }, redirect: 'follow', signal: ctl.signal });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (_) { return null; } finally { clearTimeout(t); }
}

async function main() {
  console.log(`Downloading Tranco (need ${SITE_COUNT} domains)…`);
  const zbuf = await fetchFeed(TRANCO_URL);
  if (!zbuf) throw new Error('Tranco feed fetch failed');
  const csv = H.readFirstZipEntry(zbuf).toString('utf8');
  const domains = csv.split('\n').slice(0, SITE_COUNT).map((l) => l.split(',')[1]).filter(Boolean).map((d) => d.trim());
  console.log(`  ${domains.length} domains`);

  const entriesByHash = new Map();
  for (const b of TABLE.brands) for (const e of (b.entries || [])) if (!entriesByHash.has(e.hash)) entriesByHash.set(e.hash, e);

  async function launch() {
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 ParryFpMeasure' });
    await context.addInitScript(IH_SRC);
    await context.addInitScript(COLLECT_CANDIDATES_SRC);
    return { browser, context };
  }

  let { browser, context } = await launch();
  let sitesVisited = 0, sitesWithIcons = 0, iconsHashed = 0;
  const fps = [];

  // Node-side backstop on top of the in-page fetch timeout above: bounds the
  // WHOLE per-site block (nav + candidate collection + all icon fetches).
  // A plain Promise.race is NOT enough on its own — page.evaluate() has no
  // built-in timeout and racing it doesn't cancel the underlying CDP call, so
  // a wedged evaluate (e.g. the in-page AbortController itself never firing)
  // can leave the page's CDP session busy indefinitely; a later page.close()
  // then queues up behind it and hangs too, stalling the whole run forever
  // (confirmed: two full runs hung solid after ~40-60 sites with no forward
  // progress). The only reliable way out of a wedged CDP session is to kill
  // the browser process outright and relaunch — page/context-level APIs are
  // not trustworthy once one call has wedged.
  const PER_SITE_BUDGET = NAV_TIMEOUT + 15000;
  class BudgetExceeded extends Error {}
  const withBudget = (p) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new BudgetExceeded('per-site budget exceeded')), PER_SITE_BUDGET))
  ]);

  for (const d of domains) {
    let page;
    let wedged = false;
    try {
      page = await withBudget(context.newPage());
      await withBudget((async () => {
        await page.goto('https://' + d + '/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        sitesVisited++;
        await page.waitForTimeout(300);
        const cands = await page.evaluate(() => __ssIconCandidates());
        let hashedAny = false;
        for (const url of cands) {
          // The in-page fetch has its own timeout (AbortController), independent
          // of the outer page.goto navigation timeout — without this, a single
          // icon URL that never resolves (hung connection, blocked request)
          // stalls this loop. Mirrors background/service_worker.js's
          // hashIconUrl ICON_TIMEOUT. Kept as defense in depth even with the
          // browser-relaunch backstop above.
          const hash = await page.evaluate(async (url) => {
            try {
              const ctl = new AbortController();
              const t = setTimeout(() => ctl.abort(), 5000);
              try {
                const r = await fetch(url, { credentials: 'omit', signal: ctl.signal });
                if (!r.ok) return null;
                const blob = await r.blob();
                if (!/^image\//.test(blob.type) && !/\.ico(\?|$)/i.test(url)) return null;
                return await Parry.hashImageBlob(blob);
              } finally { clearTimeout(t); }
            } catch (_) { return null; }
          }, url);
          if (!hash) continue;
          iconsHashed++; hashedAny = true;
          const m = matchBrand(hash, TABLE.brands, MAX_DIST);
          if (m) {
            const legit = C.BRAND_DOMAINS[m.brand] || [];
            const reg = C.registrableDomain(d);
            const onBrand = legit.some((ld) => reg === ld || d.endsWith('.' + ld));
            if (!onBrand) {
              const entry = entriesByHash.get(m.hash);
              fps.push({ domain: d, brand: m.brand, distance: m.distance, kind: entry ? entry.kind : 'unknown', url });
            }
          }
        }
        if (hashedAny) sitesWithIcons++;
      })());
      await withBudget(page.close());
    } catch (e) {
      // fail-open: unreachable / timed-out / wedged sites just don't count.
      wedged = e instanceof BudgetExceeded;
      if (!wedged && page) { try { await page.close(); } catch (_) {} }
    }
    if (wedged) {
      // A budget timeout means the page (and possibly the whole CDP session)
      // may be wedged — don't trust page.close() to work; kill the browser
      // process directly and relaunch a fresh one for the next site. An
      // ordinary fast failure (DNS error, refused connection, etc.) is NOT a
      // BudgetExceeded and does not pay this cost — only genuine hangs do.
      try { browser.process() && browser.process().kill('SIGKILL'); } catch (_) {}
      try { await browser.close(); } catch (_) {}
      ({ browser, context } = await launch());
    }
    if (sitesVisited && sitesVisited % 20 === 0) console.log(`  ...${sitesVisited} sites visited, ${iconsHashed} icons hashed so far`);
  }
  try { await browser.close(); } catch (_) {}

  const fpRate = sitesWithIcons ? (fps.length / sitesWithIcons) * 100 : 0;
  console.log('');
  console.log(`Sites visited:       ${sitesVisited}`);
  console.log(`Sites with icons:    ${sitesWithIcons}`);
  console.log(`Icons hashed:        ${iconsHashed}`);
  console.log(`False positives:     ${fps.length} (maxDist=${MAX_DIST})`);
  console.log(`FP rate:             ${fpRate.toFixed(2)}% (of sites with hashed icons)`);
  if (fps.length) {
    console.log('');
    console.log('False positives:');
    for (const fp of fps) console.log(`  ${fp.domain} → ${fp.brand} (distance=${fp.distance}, kind=${fp.kind})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
