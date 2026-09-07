// tests/unit/verified_namespace.test.js — registry-verified namespaces suppress brand-impersonation evidence (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const C = require('../../engine/constants.js');
const BM = require('../../engine/brand_match.js');
const H = require('../../engine/heuristics.js');

test('bank.in is a public suffix for us: hdfc.bank.in is its own registrable domain', () => {
  assert.deepStrictEqual(C.registrableParts('www.hdfc.bank.in'), { domain: 'hdfc.bank.in', sld: 'hdfc', suffix: 'bank.in' });
});
test('isVerifiedNamespace: financial and government registries only', () => {
  for (const h of ['hdfc.bank.in', 'www.icici.bank.in', 'login.chase.bank', 'www.irs.gov', 'services.gov.uk', 'u.ae', 'www.gov.ae', 'moh.gov.sg', 'www.gouv.fr', 'sat.gob.mx', 'www.nhs.uk'])
    assert.strictEqual(C.isVerifiedNamespace(h), true, h);
  for (const h of ['hdfcbank.com', 'gov.uk.evil.tk', 'bank.in.evil.com', 'student.mit.edu', 'x.pages.dev', 'gov-uk-refund.com'])
    assert.strictEqual(C.isVerifiedNamespace(h), false, h);
});
test('fuzzy brand match never fires inside a verified namespace', () => {
  assert.strictEqual(BM.allowlistBrandMatch('hdfc.bank.in'), 'hdfc');
  assert.strictEqual(BM.allowlistBrandMatch('www.icici.bank.in'), 'icici');
  assert.strictEqual(H.scoreUrl('https://www.hdfc.bank.in/').reasons.some((r) => r.code === 'brandFuzzyMatch'), false);
  assert.strictEqual(H.scoreUrl('https://sbi-bank-in.com/').reasons.some((r) => r.code === 'brandFuzzyMatch' || r.code === 'brandLookalike'), true);
});
test('icon mismatch never fires for a brand icon on its verified-namespace site', () => {
  const d = H.scoreDom({ pageHost: 'www.icici.bank.in', hasPasswordField: true, iconMatches: [{ brand: 'icici', kind: 'favicon' }] });
  assert.strictEqual(d.flags.includes('brand-impersonation-visual'), false);
  assert.strictEqual(d.reasons.some((r) => r.code === 'brandIconMismatch'), false);
  const evil = H.scoreDom({ pageHost: 'icici-netbanking.zya.me', hasPasswordField: true, iconMatches: [{ brand: 'icici', kind: 'favicon' }] });
  assert.strictEqual(evil.flags.includes('brand-impersonation-visual'), true);
});
test('fp_regressions fixture: the three bench pages score safe on URL rules', () => {
  const fx = require('./fixtures/fp_regressions.json');
  for (const row of fx) {
    const u = H.scoreUrl(row.url);
    assert.ok(u.score < 0.5, `${row.url} url score ${u.score}`);
    assert.ok(!u.reasons.some((r) => r.code === 'brandFuzzyMatch'), row.url);
  }
});
