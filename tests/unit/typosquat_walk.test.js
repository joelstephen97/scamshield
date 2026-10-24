// tests/unit/typosquat_walk.test.js — the one-edit brand typosquat walk (final fix A, C1) through the real pipeline.
// With a visible password field + a generic "Sign in" title the vast majority must warn; with NO password field
// the lift must add nothing (every non-quiet one was already dangerous on the URL alone before the fix).
const test = require('node:test');
const assert = require('node:assert');
const { walk } = require('./helpers/typosquat_walk.js');

const w = walk();

test('typosquat walk: covers a real corpus', () => {
  assert.ok(w.tested > 10000, 'tested ' + w.tested);
  assert.ok(w.recognised > 9000, 'recognised ' + w.recognised);
});
test('typosquat walk: every variant the matcher recognises (strong grade) warns with a visible password', () => {
  assert.strictEqual(w.warnAfterRecognised, w.recognised);
});
test('typosquat walk: the overall warn rate is the vast majority, and far above the old gate', () => {
  assert.ok(w.warnAfter / w.tested >= 0.8, 'warn rate ' + (w.warnAfter / w.tested).toFixed(3));
  assert.ok(w.warnAfter > 10 * w.warnBefore, `before ${w.warnBefore} after ${w.warnAfter}`);
});
test('typosquat walk: with NO password field the lift adds no warning', () => {
  assert.deepStrictEqual(w.noPasswordWarnNotPreDangerous, []);
  assert.ok(w.quietNoPassword / w.tested >= 0.9, 'quiet w/o password ' + (w.quietNoPassword / w.tested).toFixed(3));
});
