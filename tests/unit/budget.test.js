// tests/unit/budget.test.js — interruption budget table (0.15.0).
const test = require('node:test');
const assert = require('node:assert');
const B = require('../../engine/budget');
const NOW = 1_800_000_000_000;

test('decideBudget: fresh site is allowed and stamps lastWarnAt', () => {
  const r = B.decideBudget(undefined, NOW);
  assert.equal(r.allow, true);
  assert.equal(r.entry.lastWarnAt, NOW);
});
test('decideBudget: second warn inside 24h is denied, after 24h allowed', () => {
  const e = { dismissals: 0, lastWarnAt: NOW, quietUntil: 0 };
  assert.equal(B.decideBudget(e, NOW + B.DAY_MS - 1).allow, false);
  assert.equal(B.decideBudget(e, NOW + B.DAY_MS).allow, true);
});
test('decideBudget: quietUntil in the future denies even when lastWarnAt is old', () => {
  const e = { dismissals: 0, lastWarnAt: NOW - 10 * B.DAY_MS, quietUntil: NOW + 1000 };
  assert.equal(B.decideBudget(e, NOW).allow, false);
  assert.equal(B.decideBudget(e, NOW + 1000).allow, true);
});
test('applyDismissal: first counts, second goes quiet 30 days and resets', () => {
  const a = B.applyDismissal(undefined, NOW);
  assert.deepEqual([a.dismissals, a.quietUntil], [1, 0]);
  const b = B.applyDismissal(a, NOW + 5);
  assert.equal(b.dismissals, 0);
  assert.equal(b.quietUntil, NOW + 5 + 30 * B.DAY_MS);
});
test('decideBudget tolerates garbage entries', () => {
  assert.equal(B.decideBudget({ lastWarnAt: 'x', quietUntil: null }, NOW).allow, true);
});
test('capEntries drops the oldest beyond the cap', () => {
  const m = {};
  for (let i = 0; i < 505; i++) m['d' + i] = { dismissals: 0, lastWarnAt: i + 1, quietUntil: 0 };
  const out = B.capEntries(m, 500);
  assert.equal(Object.keys(out).length, 500);
  assert.ok(!('d0' in out) && 'd504' in out);
});
