#!/usr/bin/env node
// tools/build-brand-hashes.js — computes brand icon dHashes INSIDE Chromium using
// the same engine/image_hash.js the extension uses. Output: engine/brand_icons.json
// Run: npm run build:brands   (network required)
'use strict';
const { chromium } = require('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const C = require('../engine/constants');
const { hamming } = require('../engine/image_hash');
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
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 ScamShieldBrandBuilder' });
  await context.addInitScript(IH_SRC);
  const brands = [];
  for (const b of C.BRANDS) {
    const hashes = new Set();
    for (const d of b.domains.slice(0, 2)) {
      const page = await context.newPage();
      try {
        await page.goto('https://' + d + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500); // let same-tick redirects settle before we read the DOM
        const cands = await page.evaluate(() => {
          const u = (h) => { try { return new URL(h, location.href).href; } catch (_) { return null; } };
          const out = [];
          document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach((l) => out.push(u(l.getAttribute('href'))));
          out.push(u('/favicon.ico'));
          [...document.querySelectorAll('img')].filter((i) => /logo/i.test(i.src + ' ' + i.alt + ' ' + i.className + ' ' + i.id) && i.naturalWidth >= 40).slice(0, 2).forEach((i) => out.push(i.src));
          return [...new Set(out.filter(Boolean))].slice(0, 6);
        });
        for (const url of cands) {
          const h = await page.evaluate(async (url) => {
            try { const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) return null;
              const blob = await r.blob(); if (!/^image\//.test(blob.type) && !/\.ico$/i.test(url)) return null;
              return await ScamShield.hashImageBlob(blob); } catch (_) { return null; }
          }, url);
          if (h && h !== '0000000000000000' && h !== 'ffffffffffffffff') hashes.add(h);
          if (hashes.size >= 4) break;
        }
      } catch (e) { console.log('  ! ' + d + ': ' + e.message.split('\n')[0]); }
      finally { await page.close().catch(() => {}); }
    }
    if (hashes.size) brands.push({ key: b.key, hashes: [...hashes] });
    console.log(`  ${b.key}: ${hashes.size} hash(es)`);
  }
  await browser.close();
  // Ambiguity guard: drop hashes that sit < 12 bits from another brand's hash.
  for (let i = 0; i < brands.length; i++) for (let j = 0; j < brands.length; j++) if (i !== j)
    brands[i].hashes = brands[i].hashes.filter((a) => brands[j].hashes.every((b) => hamming(a, b) >= 12) || (console.log(`  ✗ dropping ambiguous ${brands[i].key} hash (close to ${brands[j].key})`), false));
  const kept = brands.filter((b) => b.hashes.length);
  fs.writeFileSync(OUT, JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), brands: kept }, null, 1) + '\n');
  console.log(`Wrote ${kept.length} brands → ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
