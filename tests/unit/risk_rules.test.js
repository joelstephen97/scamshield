// tests/unit/risk_rules.test.js — risk.json warn-tier evidence (0.9.0, Task B3).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Risk = require('../../engine/risk_rules');

// ---- abusedTldWeight ---------------------------------------------------------

test('abusedTldWeight hits a TLD present in the weight table', () => {
  const tlds = { '.top': 8, '.xyz': 5 };
  assert.deepEqual(Risk.abusedTldWeight('scam.top', tlds), { tld: '.top', weight: 8 });
});

test('abusedTldWeight respects multi-label ccTLD suffixes', () => {
  const tlds = { '.uk': 3 };
  // registrable suffix of "example.co.uk" is "co.uk"; the abused-TLD table is
  // keyed by the bare TLD ("uk"), so this must still resolve to ".uk".
  assert.deepEqual(Risk.abusedTldWeight('example.co.uk', tlds), { tld: '.uk', weight: 3 });
});

test('abusedTldWeight misses a TLD not in the table', () => {
  assert.equal(Risk.abusedTldWeight('example.com', { '.top': 8 }), null);
});

test('abusedTldWeight is null with no table, an empty table, or a malformed host', () => {
  assert.equal(Risk.abusedTldWeight('scam.top', null), null);
  assert.equal(Risk.abusedTldWeight('scam.top', {}), null);
  assert.equal(Risk.abusedTldWeight('', { '.top': 8 }), null);
  assert.equal(Risk.abusedTldWeight('192.168.1.1', { '.top': 8 }), null); // IP host has no suffix
});

// ---- hash32FromBytes ----------------------------------------------------------

test('hash32FromBytes reads the first 4 bytes as a big-endian unsigned integer', () => {
  assert.equal(Risk.hash32FromBytes([0x00, 0x00, 0x00, 0x01]), 1);
  assert.equal(Risk.hash32FromBytes([0xff, 0xff, 0xff, 0xff]), 0xffffffff);
  assert.equal(Risk.hash32FromBytes(new Uint8Array([0x01, 0x02, 0x03, 0x04])), 0x01020304);
});

test('hash32FromBytes ignores any bytes past the first 4', () => {
  assert.equal(Risk.hash32FromBytes([0x00, 0x00, 0x00, 0x01, 0xff, 0xff]), 1);
});

test('hash32FromBytes throws on too few bytes', () => {
  assert.throws(() => Risk.hash32FromBytes([0x01, 0x02]), RangeError);
});

// ---- matchHostingRisk -----------------------------------------------------------

test('matchHostingRisk reports dyndns membership', () => {
  const dyndns = new Set([42, 99]);
  assert.equal(Risk.matchHostingRisk(42, dyndns, null), 'dyndns');
});

test('matchHostingRisk reports hoster membership when not in dyndns', () => {
  const dyndns = new Set([42]);
  const hosters = new Set([7]);
  assert.equal(Risk.matchHostingRisk(7, dyndns, hosters), 'hoster');
});

test('matchHostingRisk prefers dyndns over hoster when a value is (implausibly) in both', () => {
  const both = new Set([5]);
  assert.equal(Risk.matchHostingRisk(5, both, both), 'dyndns');
});

test('matchHostingRisk is null on a miss or missing/invalid input', () => {
  assert.equal(Risk.matchHostingRisk(1, new Set([2]), new Set([3])), null);
  assert.equal(Risk.matchHostingRisk(1, null, null), null);
  assert.equal(Risk.matchHostingRisk('not-a-number', new Set([1]), null), null);
  assert.equal(Risk.matchHostingRisk(NaN, new Set([NaN]), null), null);
});

test('matchHostingRisk fails safe (never throws) on a non-Set-like argument', () => {
  // Set<number> is the documented contract, but a malformed caller input
  // (a plain array, a bare object, a string) must degrade to "no match"
  // rather than throw — same fail-open discipline as engine/blockset.js.
  // Found during a verification sweep: the original version called
  // `.has()` unconditionally and threw on a plain array.
  assert.doesNotThrow(() => Risk.matchHostingRisk(1, [1, 2, 3], null));
  assert.equal(Risk.matchHostingRisk(1, [1, 2, 3], null), null);
  assert.equal(Risk.matchHostingRisk(1, {}, null), null);
  assert.equal(Risk.matchHostingRisk(1, 'not-a-set', null), null);
});
