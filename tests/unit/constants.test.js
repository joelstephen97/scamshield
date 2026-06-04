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
