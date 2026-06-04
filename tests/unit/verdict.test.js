// tests/unit/verdict.test.js
const test = require('node:test');
const assert = require('node:assert');
const { fuse } = require('../../engine/verdict');

test('low everything -> safe', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0.1, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'safe');
});

test('mid rules -> suspicious', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: ['x'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'suspicious');
});

test('foreign credential form hard-overrides to dangerous', () => {
  const r = fuse({ modelProb: 0.0, urlRules: { score: 0.1, reasons: [] },
    domRules: { score: 0.9, reasons: ['form'], flags: ['credential-form-foreign-domain'] } });
  assert.equal(r.level, 'dangerous');
});

test('model raises borderline rules', () => {
  const r = fuse({ modelProb: 0.95, urlRules: { score: 0.4, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.ok(r.score > 0.4);
});

test('null model falls back to rules only', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.85, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'dangerous');
  assert.equal(r.modelUsed, false);
});

test('reasons are merged and de-duplicated', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: ['same'] }, domRules: { score: 0.6, reasons: ['same', 'other'], flags: [] } });
  assert.deepEqual(r.reasons.sort(), ['other', 'same']);
});
