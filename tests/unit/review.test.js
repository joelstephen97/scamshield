// tests/unit/review.test.js — earned review-ask eligibility (0.7.0)
const test = require('node:test');
const assert = require('node:assert');
const R = require('../../ui/review');

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0); // 2026-08-27T12:00:00Z

// A baseline that is eligible on every axis: Chrome, 2+ blocks, 8-day-old
// install, never asked before.
function base(overrides) {
  return Object.assign({
    isChrome: true,
    threatsBlocked: 2,
    installedAt: NOW - 8 * DAY,
    now: NOW,
    state: 'pending',
    snoozeUntil: 0,
    asks: 0
  }, overrides || {});
}

test('eligible when every condition holds (pending, Chrome, 2 blocks, 8-day install)', () => {
  assert.equal(R.eligible(base()), true);
});

test('not eligible on Firefox — no AMO listing to ask for', () => {
  assert.equal(R.eligible(base({ isChrome: false })), false);
});

test('not eligible below the 2-blocks threshold', () => {
  assert.equal(R.eligible(base({ threatsBlocked: 1 })), false);
  assert.equal(R.eligible(base({ threatsBlocked: 0 })), false);
});

test('eligible right at the 2-blocks threshold', () => {
  assert.equal(R.eligible(base({ threatsBlocked: 2 })), true);
});

test('not eligible before the install is 7 days old', () => {
  assert.equal(R.eligible(base({ installedAt: NOW - 6 * DAY })), false);
  assert.equal(R.eligible(base({ installedAt: NOW - 1000 })), false);
});

test('eligible right at the 7-day install-age boundary', () => {
  assert.equal(R.eligible(base({ installedAt: NOW - 7 * DAY })), true);
});

test('not eligible when state is anything other than pending/snoozed', () => {
  assert.equal(R.eligible(base({ state: 'rated' })), false);
  assert.equal(R.eligible(base({ state: 'declined' })), false);
  assert.equal(R.eligible(base({ state: 'bogus' })), false);
});

test('rated is permanent — still not eligible even if every other condition is generous', () => {
  assert.equal(R.eligible(base({ state: 'rated', threatsBlocked: 999, installedAt: 0 })), false);
});

test('declined is permanent — still not eligible even if every other condition is generous', () => {
  assert.equal(R.eligible(base({ state: 'declined', threatsBlocked: 999, installedAt: 0 })), false);
});

test('snoozed: not eligible until snoozeUntil has passed', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW + DAY, asks: 1 });
  assert.equal(R.eligible(s), false);
});

test('snoozed: eligible again once snoozeUntil has passed (re-ask), asks below cap', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 1 });
  assert.equal(R.eligible(s), true);
});

test('snoozed: eligible exactly at snoozeUntil (now >= snoozeUntil)', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW, asks: 1 });
  assert.equal(R.eligible(s), true);
});

test('snoozed twice (asks reaches the cap) → never eligible again, even after the snooze window passes', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 2 });
  assert.equal(R.eligible(s), false);
});

test('snoozed with asks above the cap is also never eligible', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 3 });
  assert.equal(R.eligible(s), false);
});

test('handles missing/garbage input without throwing', () => {
  assert.equal(R.eligible(undefined), false);
  assert.equal(R.eligible({}), false);
  assert.equal(R.eligible({ isChrome: true, threatsBlocked: 'x', installedAt: null, state: 'pending' }), false);
});

test('exposes the Chrome Web Store review URL for the real extension listing', () => {
  assert.equal(R.CWS_REVIEW_URL, 'https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl/reviews');
});

test('MAX_ASKS is 2 (snoozed twice caps out) and constants match the spec', () => {
  assert.equal(R.THREATS_THRESHOLD, 2);
  assert.equal(R.INSTALL_AGE_DAYS, 7);
  assert.equal(R.SNOOZE_DAYS, 90);
  assert.equal(R.MAX_ASKS, 2);
});
