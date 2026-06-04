// tests/unit/features.test.js
const test = require('node:test');
const assert = require('node:assert');
const { extractUrlFeatures, parseHost } = require('../../engine/features');
const { FEATURE_NAMES } = require('../../engine/constants');

test('returns a vector matching FEATURE_NAMES length', () => {
  const v = extractUrlFeatures('https://example.com/');
  assert.equal(v.length, FEATURE_NAMES.length);
});

test('flags raw IP host', () => {
  const v = extractUrlFeatures('http://192.168.0.1/login');
  const idx = FEATURE_NAMES.indexOf('has_ip_host');
  assert.equal(v[idx], 1);
});

test('flags @ symbol and non-https', () => {
  const v = extractUrlFeatures('http://good.com@evil.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('has_at_symbol')], 1);
  assert.equal(v[FEATURE_NAMES.indexOf('is_https')], 0);
});

test('flags punycode host', () => {
  const v = extractUrlFeatures('https://xn--pple-43d.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('has_punycode')], 1);
});

test('counts subdomains', () => {
  const v = extractUrlFeatures('https://a.b.c.example.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('num_subdomains')], 3);
});

test('detects brand lookalike (paypa1)', () => {
  const v = extractUrlFeatures('https://paypa1-secure.com/login');
  assert.equal(v[FEATURE_NAMES.indexOf('brand_lookalike')], 1);
});

test('clean popular domain is not a lookalike', () => {
  const v = extractUrlFeatures('https://www.paypal.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('brand_lookalike')], 0);
});

test('parseHost handles malformed input without throwing', () => {
  assert.doesNotThrow(() => extractUrlFeatures('not a url'));
});
