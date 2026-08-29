#!/usr/bin/env node
// tools/build-brand-hashes.js — computes brand icon dHashes INSIDE Chromium using
// the same engine/image_hash.js the extension uses. Output: engine/brand_icons.json
// Run: npm run build:brands   (network required)
'use strict';
const { chromium } = require('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const C = require('../engine/constants');
const { resolveCollisions } = require('./lib/brand_hash_guard');
const IH_SRC = fs.readFileSync(path.join(__dirname, '..', 'engine', 'image_hash.js'), 'utf8');
const OUT = path.join(__dirname, '..', 'engine', 'brand_icons.json');

(async () => {
  const browser = await chromium.launch();
  // A fresh context (and a fresh page per domain, below) is deliberate: brand
  // homepages routinely fire a delayed client-side redirect a few seconds
  // after domcontentloaded (consent walls, geo/locale bounces). With a single
  // reused page, that stray navigation lands while we've already moved on to
  // the NEXT brand's goto() and cancels it — a cascading false-negative, not
  // a real network failure. Isolating each domain visit in its own page
  // stops that cross-brand contamination.
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 ParryBrandBuilder' });
  await context.addInitScript(IH_SRC);
  const brands = [];
  for (const b of C.BRANDS) {
    const hashes = new Set();
    // Per-hash provenance: kind = 'icon' for link[rel~=icon]/apple-touch-icon/
    // favicon.ico, 'logo' for <img> logo candidates (more FP-prone, so
    // engine/heuristics.js scoreDom treats a 'logo' match more conservatively).
    const entriesByHash = new Map(); // hash -> { hash, kind, src }
    for (const d of b.domains.slice(0, 2)) {
      const page = await context.newPage();
      try {
        await page.goto('https://' + d + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500); // let same-tick redirects settle before we read the DOM
        const cands = await page.evaluate(() => {
          const u = (h) => { try { return new URL(h, location.href).href; } catch (_) { return null; } };
          const out = [];
          document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach((l) => out.push({ url: u(l.getAttribute('href')), kind: 'icon' }));
          out.push({ url: u('/favicon.ico'), kind: 'icon' });
          [...document.querySelectorAll('img')].filter((i) => /logo/i.test(i.src + ' ' + i.alt + ' ' + i.className + ' ' + i.id) && i.naturalWidth >= 40).slice(0, 2).forEach((i) => out.push({ url: i.src, kind: 'logo' }));
          const seen = new Set();
          return out.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url)).slice(0, 6);
        });
        for (const cand of cands) {
          const url = cand.url;
          const h = await page.evaluate(async (url) => {
            try { const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) return null;
              const blob = await r.blob(); if (!/^image\//.test(blob.type) && !/\.ico$/i.test(url)) return null;
              return await Parry.hashImageBlob(blob); } catch (_) { return null; }
          }, url);
          if (h && h !== '0000000000000000' && h !== 'ffffffffffffffff') {
            hashes.add(h);
            if (!entriesByHash.has(h)) entriesByHash.set(h, { hash: h, kind: cand.kind, src: url });
          }
          if (hashes.size >= 4) break;
        }
      } catch (e) { console.log('  ! ' + d + ': ' + e.message.split('\n')[0]); }
      finally { await page.close().catch(() => {}); }
    }
    if (hashes.size) brands.push({ key: b.key, hashes: [...hashes], entries: [...entriesByHash.values()] });
    console.log(`  ${b.key}: ${hashes.size} hash(es)`);
  }
  await browser.close();
  // Ambiguity guard: drop hashes that sit < 12 bits from another brand's hash.
  // Order-independent (tools/lib/brand_hash_guard.js): a hash shared with a
  // sub-brand (e.g. gmail's icon colliding with google's) is kept on the
  // brand whose known domains are the superset and dropped from the
  // narrower one; a collision between two unrelated brands drops the hash
  // from both sides.
  const domainsByKey = Object.fromEntries(C.BRANDS.map((b) => [b.key, b.domains]));
  const { brands: kept, dropped } = resolveCollisions(brands, domainsByKey, 12);
  for (const d of dropped) console.log(`  ✗ dropping ${d.brand} ${d.hash} (${d.reason} vs ${d.other})`);
  fs.writeFileSync(OUT, JSON.stringify({ version: 2, generated: new Date().toISOString().slice(0, 10), brands: kept }, null, 1) + '\n');
  console.log(`Wrote ${kept.length} brands → ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
