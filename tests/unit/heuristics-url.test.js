// tests/unit/heuristics-url.test.js
const test = require('node:test');
const assert = require('node:assert');
const { scoreUrl } = require('../../engine/heuristics');

test('clean URL scores low with no reasons', () => {
  const r = scoreUrl('https://www.wikipedia.org/');
  assert.ok(r.score < 0.3);
  assert.deepEqual(r.reasons, []);
});

test('IP + @ + http scores high with reasons', () => {
  const r = scoreUrl('http://good.com@192.168.1.5/login');
  assert.ok(r.score >= 0.8);
  assert.ok(r.reasons.some((x) => /IP address/i.test(x)));
  assert.ok(r.reasons.some((x) => /@/.test(x)));
});

test('brand lookalike is reported', () => {
  const r = scoreUrl('https://paypa1-login.tk/');
  assert.ok(r.reasons.some((x) => /looks like|impersonat/i.test(x)));
  assert.ok(r.score >= 0.5);
});

test('score is clamped to [0,1]', () => {
  const r = scoreUrl('http://secure-verify-login-account-bank@1.2.3.4/win-prize.tk');
  assert.ok(r.score >= 0 && r.score <= 1);
});
