#!/usr/bin/env node
// Regenerates model/parity.json — the frozen JS feature vectors that
// tests/unit/parity.test.js asserts against and model/check_parity.py compares
// with the Python extraction in model/train.py. Run after ANY change to
// feature semantics in engine/features.js or engine/constants.js:
//   npm run gen:parity
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { extractUrlFeatures } = require('../engine/features');

// Each URL freezes a semantic decision. Keep the originals; add one per new rule.
const URLS = [
  // originals (0.1.0)
  'https://www.paypal.com/',
  'http://paypa1-secure.tk/login',
  'http://192.168.0.1/verify',
  'https://xn--pple-43d.com/',
  // 0.3.1 — regional brand domains and multi-label suffixes are NOT lookalikes
  'https://www.amazon.co.uk/',
  'https://www.google.com.sg/',
  'https://login.microsoftonline.com/',
  'https://amazon.ae/',
  // 0.3.1 — exact brand SLD on a high-abuse TLD IS a lookalike
  'http://amazon.tk/',
  // 0.3.1 — homoglyph + subdomain-embedded brand still detected
  'http://amaz0n.xyz/login',
  'http://secure-paypal.com-verify.tk/',
  // 0.3.1 — token word boundaries
  'https://www.microsoft.com/windows',
  'https://accountant-services.example.org/',
  'https://freelance.example.org/',
  'http://free-gift-win.tk/claim'
];

// 15 curated semantic cases above + 185 deterministic samples from the real
// dataset so parity also covers "ordinary" URLs. Seeded LCG → reproducible.
const csv = fs.readFileSync(path.join(__dirname, '..', 'model', 'data', 'real.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((l) => l.slice(0, l.lastIndexOf(',')));
let seed = 20260822;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const picked = new Set();
while (picked.size < 185 && picked.size < csv.length) picked.add(csv[Math.floor(rnd() * csv.length)]);
const ALL = [...URLS, ...picked];
const out = ALL.map((url) => ({ url, vector: Array.from(extractUrlFeatures(url)) }));
const dest = path.join(__dirname, '..', 'model', 'parity.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.length} parity vectors to ${dest}`);
