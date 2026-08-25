// tests/unit/engagement.test.js — 0.6.0 site-engagement gating
const test = require('node:test');
const assert = require('node:assert');
const { engagement } = require('../../engine/engagement');

const DAY = 24 * 3600 * 1000;

test('three separate visits make a domain engaged', () => {
  let m = {};
  let now = 1000000000000;
  m = engagement.recordVisit(m, 'shop.example', now);
  m = engagement.recordVisit(m, 'shop.example', now + DAY);
  assert.equal(engagement.isEngaged(m, 'shop.example', now + DAY), false);
  m = engagement.recordVisit(m, 'shop.example', now + 2 * DAY);
  assert.equal(engagement.isEngaged(m, 'shop.example', now + 2 * DAY), true);
});

test('rapid same-session visits count once', () => {
  let m = {};
  const now = 1000000000000;
  for (let i = 0; i < 10; i++) m = engagement.recordVisit(m, 'spa.example', now + i * 1000);
  assert.equal(m['spa.example'].n, 1);
  assert.equal(engagement.isEngaged(m, 'spa.example', now + 10000), false);
});

test('engagement expires when the last visit is too old', () => {
  let m = {};
  const now = 1000000000000;
  for (let i = 0; i < 3; i++) m = engagement.recordVisit(m, 'old.example', now + i * DAY);
  assert.equal(engagement.isEngaged(m, 'old.example', now + 2 * DAY), true);
  assert.equal(engagement.isEngaged(m, 'old.example', now + 40 * DAY), false);
});

test('map is capped with LRU eviction and stale pruning', () => {
  let m = {};
  const now = 1000000000000;
  for (let i = 0; i < engagement.CAP + 50; i++) m = engagement.recordVisit(m, 'd' + i + '.example', now + i);
  assert.ok(Object.keys(m).length <= engagement.CAP);
  assert.equal(m['d0.example'], undefined);           // oldest evicted
  assert.ok(m['d' + (engagement.CAP + 49) + '.example']); // newest kept
  // stale pruning: a fresh visit 61 days later clears everything old
  m = engagement.recordVisit(m, 'fresh.example', now + 61 * DAY);
  assert.deepEqual(Object.keys(m), ['fresh.example']);
});

test('unknown domain and empty inputs are never engaged', () => {
  assert.equal(engagement.isEngaged({}, 'nope.example', Date.now()), false);
  assert.equal(engagement.isEngaged(null, 'nope.example', Date.now()), false);
  assert.deepEqual(engagement.recordVisit({}, '', 123), {});
});
