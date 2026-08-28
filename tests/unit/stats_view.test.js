// tests/unit/stats_view.test.js — the Statistics tab's pure view arithmetic.
const test = require('node:test');
const assert = require('node:assert');
const V = require('../../ui/stats_view');
const S = require('../../background/stats');

const DAY = 86400000;
// A fixed "now" keeps every expectation deterministic: 2026-08-20T12:00:00Z.
const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);
const key = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);
const bucket = (daysAgo, checked, threats, privacy) => ({ d: key(daysAgo), checked, threats: threats || 0, privacy: privacy || 0 });

test('7-day series draws 7 daily bars ending today, zero-filling missing days', () => {
  const s = V.series([bucket(0, 5), bucket(3, 9, 1)], '7', NOW);
  assert.strictEqual(s.days, 7);
  assert.strictEqual(s.groupDays, 1);
  assert.strictEqual(s.bars.length, 7);
  assert.strictEqual(s.bars[6].to, key(0));
  assert.strictEqual(s.bars[0].from, key(6));
  assert.deepStrictEqual(s.bars.map((b) => b.checked), [0, 0, 0, 9, 0, 0, 5]);
  assert.deepStrictEqual(s.bars.map((b) => b.threats), [0, 0, 0, 1, 0, 0, 0]);
  for (const b of s.bars) assert.strictEqual(b.days, 1);
});

test('days outside the window are excluded, not folded into the edge bar', () => {
  const s = V.series([bucket(6, 4), bucket(7, 100), bucket(40, 100)], '7', NOW);
  assert.strictEqual(s.bars[0].checked, 4);
  assert.strictEqual(s.bars.reduce((a, b) => a + b.checked, 0), 4);
});

test('30-day series draws 30 daily bars', () => {
  const s = V.series([bucket(29, 3)], '30', NOW);
  assert.strictEqual(s.bars.length, 30);
  assert.strictEqual(s.groupDays, 1);
  assert.strictEqual(s.bars[0].checked, 3);
  assert.strictEqual(s.from, key(29));
  assert.strictEqual(s.to, key(0));
});

test('all-time spans install → today and stays daily while it is short', () => {
  const s = V.series([bucket(0, 2), bucket(4, 6)], 'all', NOW, NOW - 4 * DAY);
  assert.strictEqual(s.days, 5);
  assert.strictEqual(s.groupDays, 1);
  assert.strictEqual(s.bars.length, 5);
  assert.strictEqual(s.clamped, false);
  assert.strictEqual(s.bars[0].checked, 6);
  assert.strictEqual(s.bars[4].checked, 2);
});

test('a long all-time span groups into at most MAX_BARS buckets, oldest partial', () => {
  const s = V.series([bucket(0, 1), bucket(1, 1), bucket(59, 7)], 'all', NOW, NOW - 59 * DAY);
  assert.strictEqual(s.days, 60);
  assert.ok(s.bars.length <= V.MAX_BARS, `expected ≤${V.MAX_BARS} bars, got ${s.bars.length}`);
  assert.strictEqual(s.groupDays, Math.ceil(60 / V.MAX_BARS));
  // Every day in the window belongs to exactly one bucket.
  assert.strictEqual(s.bars.reduce((a, b) => a + b.days, 0), 60);
  assert.strictEqual(s.bars[0].days, 60 - (s.bars.length - 1) * s.groupDays);
  // Counts survive the grouping.
  assert.strictEqual(s.bars.reduce((a, b) => a + b.checked, 0), 9);
  assert.strictEqual(s.bars[0].checked, 7);
  assert.strictEqual(s.bars[s.bars.length - 1].checked, 2);
  // Buckets are contiguous and end today.
  assert.strictEqual(s.bars[s.bars.length - 1].to, key(0));
  assert.strictEqual(s.bars[0].from, key(59));
});

test('all-time is clamped to the ring length for an older install', () => {
  const s = V.series([], 'all', NOW, NOW - 400 * DAY);
  assert.strictEqual(s.days, V.ALL_MAX_DAYS);
  assert.strictEqual(s.clamped, true);
  assert.strictEqual(s.from, key(V.ALL_MAX_DAYS - 1));
});

test('a fresh install (today, or a clock skewed into the future) still draws one bar', () => {
  const today = V.series([], 'all', NOW, NOW);
  assert.strictEqual(today.days, 1);
  assert.strictEqual(today.bars.length, 1);
  assert.strictEqual(today.clamped, false);
  const future = V.series([], 'all', NOW, NOW + 5 * DAY);
  assert.strictEqual(future.days, 1);
  assert.strictEqual(future.bars.length, 1);
});

test('series tolerates junk: no ring, malformed buckets, negative counts', () => {
  for (const junk of [undefined, null, 'nope', [null, 42, { d: 5 }, { nope: 1 }]]) {
    const s = V.series(junk, '7', NOW);
    assert.strictEqual(s.bars.length, 7);
    assert.strictEqual(s.bars.reduce((a, b) => a + b.checked, 0), 0);
  }
  const s = V.series([{ d: key(0), checked: -3, threats: 'x', privacy: 2.9 }], '7', NOW);
  assert.strictEqual(s.bars[6].checked, 0);
  assert.strictEqual(s.bars[6].threats, 0);
  assert.strictEqual(s.bars[6].privacy, 2);
});

test('series and SSStats.summarize agree on the totals for a period', () => {
  const ring = [bucket(0, 5, 1, 2), bucket(2, 7, 0, 1), bucket(6, 11, 2, 0), bucket(9, 100, 9, 9)];
  const s = V.series(ring, '7', NOW);
  const sum = S.summarize(ring, 7, NOW);
  assert.strictEqual(s.bars.reduce((a, b) => a + b.checked, 0), sum.checked);
  assert.strictEqual(s.bars.reduce((a, b) => a + b.threats, 0), sum.threats);
  assert.strictEqual(s.bars.reduce((a, b) => a + b.privacy, 0), sum.privacy);
});

test('heights scale to the tallest bar and survive an all-zero series', () => {
  assert.deepStrictEqual(V.heights([{ checked: 10 }, { checked: 5 }, { checked: 0 }]), [100, 50, 0]);
  assert.deepStrictEqual(V.heights([{ checked: 0 }, { checked: 0 }]), [0, 0]);
  assert.deepStrictEqual(V.heights([]), []);
  assert.deepStrictEqual(V.heights(undefined), []);
});

test('catRows lists every category, biggest first, ties in taxonomy order', () => {
  const rows = V.catRows({ wallet: 2, phishing: 4, clipboard: 2, nonsense: 99 });
  assert.deepStrictEqual(rows.map((r) => r.key), ['phishing', 'wallet', 'clipboard', 'fakeShop', 'techSupport', 'clickfix', 'fakeUpdate', 'other']);
  assert.deepStrictEqual(rows.slice(0, 3).map((r) => r.count), [4, 2, 2]);
  assert.deepStrictEqual(rows.slice(0, 3).map((r) => r.pct), [100, 50, 50]);
  // Unknown keys from storage never invent a row.
  assert.strictEqual(rows.length, S.CATEGORIES.length);
});

test('catRows on a fresh install is all zeros with empty tracks', () => {
  for (const junk of [undefined, null, {}, 'nope']) {
    const rows = V.catRows(junk);
    assert.strictEqual(rows.length, S.CATEGORIES.length);
    assert.ok(rows.every((r) => r.count === 0 && r.pct === 0));
  }
});
