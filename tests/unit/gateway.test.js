// tests/unit/gateway.test.js — unlisted gateway → foreign landing (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const S = require('../../engine/site_signals.js');
test('gatewaySignal fires on cross-registrable redirect from a short random path', () => {
  const r = S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://mgpxq.com/jvNbNyJf', landingHost: 'kit.example' });
  assert.deepStrictEqual(r, { score: 0.25, reasons: [{ code: 'gatewayRedirect', kind: 'link', params: ['mgpxq.com'] }] });
});
test('gatewaySignal is silent for same-domain, no-redirect, descriptive paths, and safe origins', () => {
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://kit.example/x1y2z3', landingHost: 'www.kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 0, originalUrl: 'https://mgpxq.com/jvNbNyJf', landingHost: 'kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://news.example/2026/09/article-title', landingHost: 'kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://t.co/abc123', landingHost: 'kit.example' }).score, 0.25);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://www.google.com/url?q=x', landingHost: 'kit.example' }).score, 0);
});
