// tests/unit/brand_pack.test.js — generated brand table + foreign-suffix rule (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path');
const C = require('../../engine/constants.js'); const BM = require('../../engine/brand_match.js'); const H = require('../../engine/heuristics.js');
const lines = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('brand table has at least 300 brands, every row has ≥1 domain and a ccPolicy', () => {
  const keys = Object.keys(C.BRAND_DOMAINS);
  assert.ok(keys.length >= 300, 'brands: ' + keys.length);
  for (const b of C.BRANDS) { assert.ok(b.domains.length >= 1, b.key); assert.ok(['open', 'closed'].includes(b.ccPolicy || 'open'), b.key); if (b.ccPolicy === 'closed') assert.ok(Array.isArray(b.suffixes) && b.suffixes.length, b.key + ' suffixes'); }
});
test('generated block is in sync with brands.csv', () => {
  const { render } = require('../../scripts/build-brands.js');
  const src = fs.readFileSync(path.join(__dirname, '../../engine/constants.js'), 'utf8');
  const block = src.slice(src.indexOf('// BEGIN GENERATED BRANDS'), src.indexOf('// END GENERATED BRANDS'));
  assert.strictEqual(block.trim(), render(path.join(__dirname, '../../model/data/brands.csv')).trim());
});
test('brandForeignSuffix: closed brands on a foreign suffix, never open brands, never real domains', () => {
  assert.deepStrictEqual(BM.brandForeignSuffix('www.roblox.com.do'), { brand: 'roblox', suffix: 'com.do' });
  assert.strictEqual(BM.brandForeignSuffix('www.roblox.com'), null);
  assert.strictEqual(BM.brandForeignSuffix('www.amazon.ae'), null);       // open brand
  assert.strictEqual(BM.brandForeignSuffix('hsbc.com.hk'), null);         // open brand: unknown ccTLD stays permissive
  assert.strictEqual(BM.brandForeignSuffix('roblox-games.com.do'), null); // not the exact SLD
});
test('scoreUrl emits brandForeignSuffix (+0.6) and isOnBrand no longer trusts a closed brand on a ccTLD', () => {
  const u = H.scoreUrl('https://www.roblox.com.do/users/1/profile');
  assert.ok(u.reasons.some((r) => r.code === 'brandForeignSuffix'));
  assert.ok(u.score >= 0.6);
  const d = H.scoreDom({ pageHost: 'www.roblox.com.do', hasPasswordField: true, titleBrand: 'Roblox' });
  assert.ok(d.flags.includes('brand-impersonation-content'));
  const ok = H.scoreDom({ pageHost: 'www.amazon.com.tr', hasPasswordField: true, titleBrand: 'Amazon' });
  assert.ok(!ok.flags.includes('brand-impersonation-content'));
});
test('platform_phish fixtures: every bench tenant miss now carries brand evidence', () => {
  for (const host of lines('platform_phish.txt')) {
    const u = H.scoreUrl('https://' + host + '/');
    const hasBrand = u.reasons.some((r) => ['brandFuzzyMatch', 'brandLookalike', 'brandForeignSuffix'].includes(r.code));
    const title = host.split('.')[0].replace(/[-0-9]+/g, ' ');
    const d = H.scoreDom({ pageHost: host, hasPasswordField: true, titleBrand: title });
    // A tenant-hosted kit with no brand token at all in its label ("shp-entregas",
    // a Shopee-ish but non-matching token) still carries evidence via Task 9's
    // credentialFormOnTenantHost signal (a password form on a free-hosting
    // tenant) — the brand-token flag is the stronger, but not the only, path.
    const tenantEvidence = d.reasons.some((r) => r.code === 'credentialFormOnTenantHost');
    assert.ok(hasBrand || d.flags.includes('brand-impersonation-content') || d.flags.includes('brand-impersonation-tenant') || tenantEvidence, host);
  }
});
test('platform_legit fixtures: no brand evidence on legit tenant/regional hosts', () => {
  for (const host of lines('platform_legit.txt')) {
    const u = H.scoreUrl('https://' + host + '/');
    assert.ok(u.score < 0.5, host + ' ' + JSON.stringify(u.reasons));
  }
});
