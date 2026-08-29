// tests/unit/first_seen.test.js — engine/first_seen.js: per-device
// first-seen-locally ring for the NRD signal (Task C3).
const test = require('node:test');
const assert = require('node:assert');
const FS = require('../../engine/first_seen');

const DAY = 24 * 3600 * 1000;

test('touch() on a brand-new hash records now as firstSeenAt and marks isNew', () => {
  const now = 1_000_000;
  const { list, firstSeenAt, isNew } = FS.touch([], 'hash-a', now);
  assert.strictEqual(isNew, true);
  assert.strictEqual(firstSeenAt, now);
  assert.deepStrictEqual(list, [['hash-a', now]]);
});

test('touch() on an existing hash preserves the ORIGINAL first-seen timestamp and moves it to the end', () => {
  const t0 = 1_000_000;
  const first = FS.touch([], 'hash-a', t0);
  const second = FS.touch(first.list.concat([['hash-b', t0 + 1]]), 'hash-a', t0 + 5000);
  assert.strictEqual(second.isNew, false);
  assert.strictEqual(second.firstSeenAt, t0, 'must not overwrite the original first-seen timestamp');
  assert.deepStrictEqual(second.list, [['hash-b', t0 + 1], ['hash-a', t0]], 'touched hash moves to the most-recent end');
});

test('the ring is capped at CAP entries, dropping the oldest/least-recently-touched first', () => {
  let list = [];
  for (let i = 0; i < FS.CAP + 10; i++) {
    list = FS.touch(list, 'hash-' + i, i).list;
  }
  assert.strictEqual(list.length, FS.CAP);
  // The first 10 inserted (least-recently-touched) were evicted.
  assert.strictEqual(list.some(([h]) => h === 'hash-0'), false);
  assert.strictEqual(list.some(([h]) => h === 'hash-9'), false);
  assert.strictEqual(list.some(([h]) => h === 'hash-10'), true);
  assert.strictEqual(list[list.length - 1][0], 'hash-' + (FS.CAP + 9), 'most-recently-touched is last');
});

test('isEstablished is false for a hash seen less than 30 days ago, true once 30 days have passed', () => {
  const now = 50 * DAY;
  const { list } = FS.touch([], 'hash-a', now - 29 * DAY);
  assert.strictEqual(FS.isEstablished(list, 'hash-a', now), false);
  const older = FS.touch([], 'hash-b', now - 30 * DAY).list;
  assert.strictEqual(FS.isEstablished(older, 'hash-b', now), true);
  assert.strictEqual(FS.isEstablished(older, 'hash-never-seen', now), false);
});

test('normalize() drops malformed entries and coerces to fresh arrays', () => {
  const dirty = [
    ['ok-hash', 123],
    null,
    ['bad-ts', 'not-a-number'],
    ['bad-ts2', -5],
    'not-an-array',
    [1, 2, 3],
    [123, 456], // hash must be a string
    ['', 456],  // hash must be non-empty
  ];
  assert.deepStrictEqual(FS.normalize(dirty), [['ok-hash', 123]]);
  assert.deepStrictEqual(FS.normalize(null), []);
  assert.deepStrictEqual(FS.normalize(undefined), []);
  assert.deepStrictEqual(FS.normalize('garbage'), []);

  // Returns a fresh array — mutating the result must not affect a re-read.
  const clean = FS.normalize(dirty);
  clean.push(['mutated', 1]);
  assert.deepStrictEqual(FS.normalize(dirty), [['ok-hash', 123]]);
});

test('touch() never mutates its input list', () => {
  const input = [['hash-a', 1]];
  const frozen = JSON.parse(JSON.stringify(input));
  FS.touch(input, 'hash-b', 2);
  assert.deepStrictEqual(input, frozen);
});
