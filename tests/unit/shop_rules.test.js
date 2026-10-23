// tests/unit/shop_rules.test.js — 0.6.0 fake-shop scorer
const test = require('node:test');
const assert = require('node:assert');
const { scoreShop } = require('../../engine/shop_rules');

test('non-storefront pages are never scored', () => {
  const r = scoreShop({ isStorefront: false, offPlatformPay: true, countdownReset: true });
  assert.equal(r.level, 'none');
  assert.deepEqual(r.flags, []);
});

test('a single soft flag is only a note', () => {
  const r = scoreShop({ isStorefront: true, fakeScarcity: 2 });
  assert.equal(r.level, 'note');
  assert.equal(r.flags.length, 1);
});

test('a strong flag alone reaches suspicious', () => {
  const r = scoreShop({ isStorefront: true, offPlatformPay: true });
  assert.equal(r.level, 'suspicious');
  assert.ok(r.flags.some((f) => f.code === 'offPlatformPay'));
});

test('two soft flags plus one reach suspicious', () => {
  const r = scoreShop({ isStorefront: true, fakeScarcity: 1, badgeHotlink: true, missingContact: true });
  assert.equal(r.level, 'suspicious');
  assert.equal(r.flags.length, 3);
});

test('a fake resetting countdown is a strong flag', () => {
  const r = scoreShop({ isStorefront: true, countdownReset: true });
  assert.equal(r.level, 'note'); // weight 2 → note; needs one more to be suspicious
  const r2 = scoreShop({ isStorefront: true, countdownReset: true, missingContact: true });
  assert.equal(r2.level, 'suspicious');
});

// Flags are code-only: the English text lives in ui/reasons.js + _locales, so
// the engine never carries a user-visible sentence.
test('flags carry a code and nothing else — no English in the engine', () => {
  const r = scoreShop({ isStorefront: true, offPlatformPay: true, fakeScarcity: 1, badgeHotlink: true, missingContact: true, countdownReset: true });
  assert.deepEqual(r.flags.map((f) => f.code).sort(),
    ['badgeHotlink', 'countdownReset', 'fakeScarcity', 'missingContact', 'offPlatformPay']);
  for (const f of r.flags) assert.deepEqual(Object.keys(f), ['code']);
});

// (0.15.0) opening hours, clock times and video durations are not countdown timers.
test('countdownSecondsFromText: real countdowns count, clock times / hours / ranges do not', () => {
  const { countdownSecondsFromText: c } = require('../../engine/shop_rules');
  assert.equal(c('Sale ends in 09:59'), 599);
  assert.equal(c('Ends in 01:02:03'), 3723);
  assert.equal(c('Open 9:00–18:00'), 0);
  assert.equal(c('Opens 09:00'), 0);
  assert.equal(c('Opening hours: 10:00'), 0);
  assert.equal(c('Closes at 18:00'), 0);
  assert.equal(c('Mon-Fri 9:00 - 17:30'), 0);
  assert.equal(c('Delivery by 5:30 pm'), 0);
  assert.equal(c('Delivery by 5:30pm'), 0);
  assert.equal(c('Hours 08:00 to 20:00'), 0);
  assert.equal(c('no clock here'), 0);
  assert.equal(c(''), 0);
  assert.equal(c(null), 0);
  assert.equal(c('Opens 09:00 — sale ends 00:45'), 45);
});
