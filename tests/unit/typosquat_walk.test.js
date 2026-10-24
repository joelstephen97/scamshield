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
test('typosquat walk: with a visible password and a brand in the title the vast majority warn', () => {
  assert.ok(w.warnBrandTitle / w.tested >= 0.8, 'brand-title warn rate ' + (w.warnBrandTitle / w.tested).toFixed(3));
  assert.ok(w.warnBrandTitleRecognised / w.recognised >= 0.85, 'recognised ' + w.warnBrandTitleRecognised + '/' + w.recognised);
});
test('typosquat walk: with a phishing-style title ("Verify your account") every recognised variant warns', () => {
  assert.ok(w.warnVerifyTitle / w.recognised >= 0.95, 'verify-title ' + w.warnVerifyTitle + '/' + w.recognised);
});
test('typosquat walk: with only a generic "Sign in" title the lift is deliberately quiet (N1)', () => {
  assert.ok(w.warnAfter / w.tested < 0.25, 'generic-title warn rate ' + (w.warnAfter / w.tested).toFixed(3));
});
test('typosquat walk: with NO password field the lift adds no warning', () => {
  assert.deepStrictEqual(w.noPasswordWarnNotPreDangerous, []);
  assert.ok(w.quietNoPassword / w.tested >= 0.9, 'quiet w/o password ' + (w.quietNoPassword / w.tested).toFixed(3));
});
