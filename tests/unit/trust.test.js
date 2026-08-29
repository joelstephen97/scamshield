const test = require('node:test'); const assert = require('node:assert');
const T = require('../../engine/trust');
const NOW = Date.UTC(2026, 7, 22, 10, 0, 0);
test('pauseUntil choices', () => {
  assert.equal(T.pauseUntil('1h', NOW), NOW + 3600000);
  // '1d' is a flat 24h from now, not "until local midnight" — Ghostery-style
  // time-boxed pause, not the old "Until tomorrow" semantics.
  assert.equal(T.pauseUntil('1d', NOW), NOW + 86400000);
  assert.equal(T.pauseUntil('always', NOW), null);
  assert.equal(T.pauseUntil('bogus', NOW), NOW + 3600000);
});
test('isPaused respects expiry; prunePaused drops expired', () => {
  const ps = { 'a.example': NOW + 1000, 'b.example': NOW - 1 };
  assert.equal(T.isPaused(ps, 'a.example', NOW), true);
  assert.equal(T.isPaused(ps, 'b.example', NOW), false);
  assert.equal(T.isPaused(ps, 'c.example', NOW), false);
  assert.deepEqual(T.prunePaused(ps, NOW), { 'a.example': NOW + 1000 });
  assert.deepEqual(T.prunePaused(undefined, NOW), {});
});
