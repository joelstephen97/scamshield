// tests/unit/helpers/typosquat_walk.js — one-edit brand typosquat walk through the REAL pipeline (final fix A, C1).
// For every brand key of >= 5 letters it builds the one-edit variants (deletion, adjacent transposition,
// keyboard-neighbour substitution, homoglyph substitution, doubled letter) on .com and runs each with and
// without a visible password field and a generic "Sign in" title.
//   node -e "console.log(require('./tests/unit/helpers/typosquat_walk').walk())"
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('../../../engine/constants.js');
const BM = require('../../../engine/brand_match.js');
const B = require('../../../engine/blockset.js');
const D = require('../../../engine/doctrine.js');
const { runPipeline } = require('./pipeline.js');

const NEIGHBOURS = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
  a: 'qsz', s: 'awdx', d: 'serfc', f: 'drtgv', g: 'ftyhb', h: 'gyujn', j: 'huikm', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk'
};
const HOMOGLYPH = { o: '0', l: '1', i: '1', e: '3', a: '4', s: '5' };

function variantsOf(key) {
  const out = new Set();
  for (let i = 0; i < key.length; i++) out.add(key.slice(0, i) + key.slice(i + 1)); // deletion
  for (let i = 0; i < key.length - 1; i++) out.add(key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2)); // transposition
  for (let i = 0; i < key.length; i++) {
    for (const n of NEIGHBOURS[key[i]] || '') out.add(key.slice(0, i) + n + key.slice(i + 1)); // keyboard neighbour
    if (HOMOGLYPH[key[i]]) out.add(key.slice(0, i) + HOMOGLYPH[key[i]] + key.slice(i + 1)); // homoglyph
    out.add(key.slice(0, i + 1) + key[i] + key.slice(i + 1)); // doubled letter
  }
  out.delete(key);
  return [...out].filter((v) => /^[a-z0-9]+$/.test(v) && v.length >= 4);
}

function popularSet() {
  const bin = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'rules', 'popular40.bin'));
  return B.open(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
}

function walk() {
  const pop = popularSet();
  const isPopular = (d) => B.has(pop, B.hash40FromBytes(crypto.createHash('sha256').update(d).digest()));
  // Bases: the brand KEY (what the reviewer walked) plus the brand's primary-domain label (what the matcher compares
  // against, e.g. key 'steam' -> 'steampowered'), each >= 5 letters.
  const bases = new Set();
  for (const b of C.BRANDS) {
    if (b.fuzzy === false) continue;
    if (/^[a-z]{5,}$/.test(b.key)) bases.add(b.key);
    const f = C.registrableParts(b.domains[0]).sld;
    if (/^[a-z]{5,}$/.test(f)) bases.add(f);
  }
  const brandKeys = [...bases];
  const seen = new Set();
  const s = { brands: brandKeys.length, variants: 0, skippedRealBrand: 0, skippedPopular: 0, tested: 0, recognised: 0, unrecognised: 0,
    warnBefore: 0, warnBeforeRecognised: 0, warnAfter: 0, warnAfterRecognised: 0, quietNoPassword: 0, noPasswordWarn: [], noPasswordWarnNotPreDangerous: [], notWarned: [], unrecognisedSample: [] };
  for (const key of brandKeys) for (const v of variantsOf(key)) {
    const host = v + '.com';
    if (seen.has(host)) continue; seen.add(host);
    s.variants++;
    if (BM.allowlistBrandMatch(host)) { s.skippedRealBrand++; continue; }
    if (isPopular(host)) { s.skippedPopular++; continue; }
    s.tested++;
    const url = 'https://' + host + '/signin';
    const withPw = runPipeline({ url, signals: { hasVisiblePasswordField: true }, riskTlds: {} });
    const noPw = runPipeline({ url, riskTlds: {} });
    const recognised = withPw.urlRules.reasons.some((r) => r.code === 'brandFuzzyMatch' && (r.grade === 'strong' || r.grade === 'strongest'));
    if (recognised) s.recognised++; else { s.unrecognised++; if (s.unrecognisedSample.length < 40) s.unrecognisedSample.push(host); }
    // "before" = the 0.15.0 gate: credentialFlags only ran when the fused verdict was already not "safe", so a page
    // warned if it was dangerous, or suspicious with a lookalike reason (which then got the confident flag).
    if (withPw.preVerdict.level === 'dangerous' || (withPw.preVerdict.level === 'suspicious' && withPw.urlRules.reasons.some(D.isLookalikeReason))) { s.warnBefore++; if (recognised) s.warnBeforeRecognised++; }
    if (withPw.tier === 'warn') { s.warnAfter++; if (recognised) s.warnAfterRecognised++; } else if (s.notWarned.length < 400) s.notWarned.push(host);
    if (noPw.tier === 'quiet') s.quietNoPassword++;
    else { s.noPasswordWarn.push(host); if (noPw.preVerdict.level !== 'dangerous') s.noPasswordWarnNotPreDangerous.push(host); }
  }
  return s;
}

module.exports = { walk, variantsOf };
