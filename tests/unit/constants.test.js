// tests/unit/constants.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../engine/constants');

test('FEATURE_NAMES is a non-empty unique list', () => {
  assert.ok(Array.isArray(C.FEATURE_NAMES));
  assert.equal(C.FEATURE_NAMES.length, 17);
  assert.equal(new Set(C.FEATURE_NAMES).size, C.FEATURE_NAMES.length);
});

test('risk thresholds are ordered', () => {
  assert.ok(C.THRESHOLDS.suspicious < C.THRESHOLDS.dangerous);
});

test('brand and tld lists are present', () => {
  assert.ok(C.POPULAR_BRANDS.includes('paypal'));
  assert.ok(C.SUSPICIOUS_TLDS.includes('zip'));
  assert.ok(C.SUSPICIOUS_TOKENS.includes('verify'));
});

test('SAFE_DOMAINS is a non-empty list of top legitimate sites', () => {
  assert.ok(Array.isArray(C.SAFE_DOMAINS));
  assert.ok(C.SAFE_DOMAINS.includes('google.com'));
  assert.ok(C.SAFE_DOMAINS.includes('paypal.com'));
});

test('SAFE_DOMAINS includes regional brand storefronts', () => {
  assert.ok(C.SAFE_DOMAINS.includes('amazon.ae'));
  assert.ok(C.SAFE_DOMAINS.includes('amazon.co.uk'));
  assert.ok(C.SAFE_DOMAINS.includes('microsoftonline.com'));
});

test('registrableDomain handles multi-label public suffixes', () => {
  assert.equal(C.registrableDomain('www.amazon.co.uk'), 'amazon.co.uk');
  assert.equal(C.registrableDomain('a.b.google.com.sg'), 'google.com.sg');
  assert.equal(C.registrableDomain('dbs.com.sg'), 'dbs.com.sg');
  assert.equal(C.registrableDomain('www.example.com'), 'example.com');
  assert.equal(C.registrableDomain('example.com'), 'example.com');
});

test('registrableDomain passes through single labels, IPs, and trailing dots', () => {
  assert.equal(C.registrableDomain('localhost'), 'localhost');
  assert.equal(C.registrableDomain('192.168.0.1'), '192.168.0.1');
  assert.equal(C.registrableDomain('example.com.'), 'example.com');
  assert.equal(C.registrableDomain(''), '');
});

test('registrableParts splits sld and suffix', () => {
  assert.deepEqual(C.registrableParts('www.amazon.co.uk'),
    { domain: 'amazon.co.uk', sld: 'amazon', suffix: 'co.uk' });
  assert.deepEqual(C.registrableParts('login.microsoftonline.com'),
    { domain: 'microsoftonline.com', sld: 'microsoftonline', suffix: 'com' });
});

test('isSafeHost matches exact and subdomain of safe domains', () => {
  assert.ok(C.isSafeHost('amazon.ae'));
  assert.ok(C.isSafeHost('www.amazon.ae'));
  assert.ok(C.isSafeHost('help.netflix.com'));
  assert.ok(!C.isSafeHost('evilamazon.ae'));
  assert.ok(!C.isSafeHost('amazon.ae.evil.tk'));
});

test('KNOWN_AUTH_PROVIDERS lists major SSO registrable domains', () => {
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('google.com'));
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('microsoftonline.com'));
  assert.ok(C.KNOWN_AUTH_PROVIDERS.includes('okta.com'));
});

test('KNOWN_BRAND_REGISTRABLES is the flattened BRAND_DOMAINS set', () => {
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('microsoftonline.com'));
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('amazon.ae'));
  assert.ok(C.KNOWN_BRAND_REGISTRABLES.includes('paypal.com'));
});

test('SUSPICIOUS_TLDS includes newer high-abuse TLDs', () => {
  for (const t of ['pw', 'cc', 'ws', 'icu', 'buzz']) {
    assert.ok(C.SUSPICIOUS_TLDS.includes(t), t);
  }
});
