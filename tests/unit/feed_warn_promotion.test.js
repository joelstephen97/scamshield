// tests/unit/feed_warn_promotion.test.js — single-source feed hit + page evidence → dangerous (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const V = require('../../engine/verdict.js');
const base = () => ({ level: 'suspicious', score: 0.6, riskScore: 0, reasons: [{ code: 'feedWarn', kind: 'link', params: ['1'] }], reasonCodes: ['feedWarn'], flags: ['feed-warn'] });
test('feed warn + password field + brand evidence → dangerous', () => {
  const v = V.promoteFeedWarn(base(), { hasPasswordField: true }, { score: 0.55, reasons: [{ code: 'brandFuzzyMatch' }] }, { score: 0, flags: [] });
  assert.strictEqual(v.level, 'dangerous'); assert.ok(v.flags.includes('feed-warn-corroborated'));
});
test('feed warn + password field + NRD → dangerous; feed warn + password only → stays suspicious', () => {
  const nrd = base(); nrd.flags.push('new-domain');
  assert.strictEqual(V.promoteFeedWarn(nrd, { hasPasswordField: true }, { score: 0, reasons: [] }, { score: 0, flags: [] }).level, 'dangerous');
  assert.strictEqual(V.promoteFeedWarn(base(), { hasPasswordField: true }, { score: 0, reasons: [] }, { score: 0, flags: [] }).level, 'suspicious');
});
test('no feed warn → untouched; already dangerous → untouched', () => {
  const clean = { level: 'safe', score: 0, riskScore: 0, reasons: [], reasonCodes: [], flags: [] };
  assert.deepStrictEqual(V.promoteFeedWarn(clean, { hasPasswordField: true }, { score: 0.9, reasons: [] }, { score: 0, flags: [] }), clean);
});
