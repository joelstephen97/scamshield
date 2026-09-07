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
  // 0.13.0 final review (I3): the fuzzy TLD-swap grade and brandForeignSuffix
  // are the SAME observation for this host, so only one of them is counted —
  // the URL alone stays "suspicious" (0.60) instead of being pinned at 1.0.
  const bare = H.scoreUrl('https://roblox.com.do/');
  assert.ok(Math.abs(bare.score - 0.6) < 1e-9, 'score ' + bare.score);
  assert.ok(!bare.reasons.some((r) => r.code === 'brandFuzzyMatch'), JSON.stringify(bare.reasons));
  // A brand's own regional storefront is untouched.
  assert.strictEqual(H.scoreUrl('https://www.amazon.com.tr/').score, 0);
  // ...and one corroborating DOM signal still reaches dangerous.
  const dom = H.scoreDom({ pageHost: 'roblox.com.do', hasPasswordField: true, titleBrand: 'Roblox' });
  assert.ok(dom.score >= 0.8, 'dom ' + dom.score);
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
    // 0.13.0 final review (C2): a credential form on these hosts is warn-tier
    // evidence at most — never a brand-impersonation flag.
    const d = H.scoreDom({ pageHost: host, hasPasswordField: true });
    assert.ok(!d.flags.some((f) => f.startsWith('brand-impersonation-')), host + ' ' + JSON.stringify(d.flags));
    assert.ok(d.score < 0.8, host + ' dom ' + d.score);
  }
});

// C3: a brand key that is also a bare English word must not carry that word
// as a content `names` entry, or brandNameIn fires on any page using it.
test('common-word brands only match content by their qualified product name', () => {
  const fp = H.scoreDom({ pageHost: 'zoomlens.example.com', hasPasswordField: true, titleBrand: 'Zoom Lens Store' });
  assert.ok(!fp.flags.includes('brand-impersonation-content'), JSON.stringify(fp.flags));
  const tp = H.scoreDom({ pageHost: 'zoomlens.example.com', hasPasswordField: true, titleBrand: 'Zoom Meetings sign in' });
  assert.ok(tp.flags.includes('brand-impersonation-content'), JSON.stringify(tp.flags));
});

test('build-brands.js rejects a common-word key that keeps the bare word as a name', () => {
  const { validate } = require('../../scripts/build-brands.js');
  assert.throws(() => validate([{ key: 'zoom', display: 'Zoom', names: ['zoom'], domains: ['zoom.us'], ccPolicy: 'open', suffixes: [], fuzzy: true, _line: 1 }], []),
    /common English word/);
  assert.doesNotThrow(() => validate([{ key: 'zoom', display: 'Zoom', names: ['zoom meetings'], domains: ['zoom.us'], ccPolicy: 'open', suffixes: [], fuzzy: true, _line: 1 }], []));
});
