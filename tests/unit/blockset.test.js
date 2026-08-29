// tests/unit/blockset.test.js — engine/blockset.js: IndexedDB-backed
// typed-array matcher for the v0.9 threat feed (Task B2). Hand-built fixtures
// cover the pure logic; a smoke test against the real parry-feed v/current/
// files (sibling repo) exercises it at real scale, skipping gracefully when
// that repo is not checked out alongside this one.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../../engine/blockset');

// Builds a 5-byte-record ArrayBuffer from a list of 40-bit numbers, which
// MUST already be sorted ascending (mirrors the real feed's contract) unless
// a test is deliberately probing that invariant.
function buildBuffer(values) {
  const buf = new ArrayBuffer(values.length * B.RECORD_SIZE);
  const view = new DataView(buf);
  values.forEach((v, i) => {
    view.setUint32(i * B.RECORD_SIZE, Math.floor(v / 256), false);
    view.setUint8(i * B.RECORD_SIZE + 4, v % 256);
  });
  return buf;
}
function buildDelta(added, removed) {
  const buf = new ArrayBuffer(8 + (added.length + removed.length) * B.RECORD_SIZE);
  const view = new DataView(buf);
  view.setUint32(0, added.length, false);
  view.setUint32(4, removed.length, false);
  let off = 8;
  for (const v of added) { view.setUint32(off, Math.floor(v / 256), false); view.setUint8(off + 4, v % 256); off += 5; }
  for (const v of removed) { view.setUint32(off, Math.floor(v / 256), false); view.setUint8(off + 4, v % 256); off += 5; }
  return buf;
}

// --- hash40FromBytes ---------------------------------------------------

test('hash40FromBytes combines 5 bytes into the big-endian 40-bit value', () => {
  assert.equal(B.hash40FromBytes([0x00, 0x00, 0x7a, 0x48, 0xa6]), 0x00007a48a6);
  assert.equal(B.hash40FromBytes(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])), 0xffffffffff);
  assert.equal(B.hash40FromBytes([0, 0, 0, 0, 0]), 0);
  // Extra trailing bytes (a full 32-byte SHA-256 digest) are ignored — only
  // the first 5 matter, matching the SW's real call site.
  assert.equal(B.hash40FromBytes([0x00, 0x00, 0x7a, 0x48, 0xa6, 0xde, 0xad]), 0x00007a48a6);
  assert.throws(() => B.hash40FromBytes([1, 2, 3]), RangeError);
});

test('shardByte extracts the top byte of a 40-bit value (the exact-shard index)', () => {
  assert.equal(B.shardByte(0x00007a48a6), 0x00);
  assert.equal(B.shardByte(0xffffffffff), 0xff);
  assert.equal(B.shardByte(0x1200000000), 0x12);
  assert.equal(B.shardByte(0), 0);
  // Round-trips with hash40FromBytes: the shard byte must equal the first
  // digest byte handed in.
  assert.equal(B.shardByte(B.hash40FromBytes([0xab, 1, 2, 3, 4])), 0xab);
});

// --- open / has ----------------------------------------------------------

test('open() rejects non-ArrayBuffer input and misaligned lengths', () => {
  assert.throws(() => B.open('nope'), TypeError);
  assert.throws(() => B.open(new ArrayBuffer(7)), RangeError);
  const empty = B.open(new ArrayBuffer(0));
  assert.equal(B.count(empty), 0);
  assert.equal(B.has(empty, 123), false);
});

test('has() finds every value present and rejects near-miss values', () => {
  const vals = [10, 500, 8013990, 999999999, 0xffffffffff];
  const set = B.open(buildBuffer(vals));
  assert.equal(B.count(set), vals.length);
  for (const v of vals) assert.equal(B.has(set, v), true, `expected hit for ${v}`);
  assert.equal(B.has(set, 9), false);
  assert.equal(B.has(set, 11), false);
  assert.equal(B.has(set, 1000000000), false);
  assert.equal(B.has(set, 0), false);
});

test('has() works at the first and last index (binary-search edge cases)', () => {
  const vals = [1, 2, 3, 4, 5, 6, 7];
  const set = B.open(buildBuffer(vals));
  assert.equal(B.has(set, 1), true);
  assert.equal(B.has(set, 7), true);
  assert.equal(B.has(set, 4), true);
});

test('values() returns every record in order; isSorted() detects violations', () => {
  const vals = [1, 2, 3, 100, 101];
  const set = B.open(buildBuffer(vals));
  assert.deepEqual(B.values(set), vals);
  assert.equal(B.isSorted(set), true);

  const bad = B.open(buildBuffer([5, 3, 9])); // deliberately unsorted
  assert.equal(B.isSorted(bad), false);

  const dup = B.open(buildBuffer([1, 1, 2])); // duplicate — not strictly increasing
  assert.equal(B.isSorted(dup), false);
});

// --- binarySearchValue -----------------------------------------------------

test('binarySearchValue matches on a plain sorted-number array', () => {
  const arr = [2, 4, 6, 8, 10];
  assert.equal(B.binarySearchValue(arr, 2), true);
  assert.equal(B.binarySearchValue(arr, 10), true);
  assert.equal(B.binarySearchValue(arr, 6), true);
  assert.equal(B.binarySearchValue(arr, 7), false);
  assert.equal(B.binarySearchValue([], 1), false);
});

// --- parseDelta / applyDelta -----------------------------------------------

test('parseDelta reads added/removed arrays back out in order', () => {
  const delta = buildDelta([50, 60, 70], [20]);
  const { added, removed } = B.parseDelta(delta);
  assert.deepEqual(added, [50, 60, 70]);
  assert.deepEqual(removed, [20]);
});

test('parseDelta rejects a buffer whose length disagrees with its header', () => {
  const delta = buildDelta([50], [20]);
  const truncated = delta.slice(0, delta.byteLength - 1);
  assert.throws(() => B.parseDelta(truncated), RangeError);
  assert.throws(() => B.parseDelta(new ArrayBuffer(3)), RangeError);
});

test('applyDelta adds new records and drops removed ones, staying sorted', () => {
  const base = buildBuffer([10, 20, 30, 40, 50]);
  const delta = buildDelta([25, 60], [20, 40]);
  const next = B.applyDelta(base, delta);
  const set = B.open(next);
  assert.deepEqual(B.values(set), [10, 25, 30, 50, 60]);
  assert.equal(B.isSorted(set), true);
});

test('applyDelta with an empty delta is a no-op copy', () => {
  const base = buildBuffer([1, 2, 3]);
  const delta = buildDelta([], []);
  const next = B.applyDelta(base, delta);
  assert.deepEqual(B.values(B.open(next)), [1, 2, 3]);
  assert.notEqual(next, base, 'applyDelta must return a NEW ArrayBuffer, not mutate the base');
});

test('applyDelta tolerates an added value that collides with a kept base value (dedupes)', () => {
  const base = buildBuffer([1, 2, 3]);
  const delta = buildDelta([2, 4], []); // 2 already present
  const next = B.applyDelta(base, delta);
  assert.deepEqual(B.values(B.open(next)), [1, 2, 3, 4]);
});

test('applyDelta on an empty base just installs the added records', () => {
  const base = new ArrayBuffer(0);
  const delta = buildDelta([1, 2], []);
  const next = B.applyDelta(base, delta);
  assert.deepEqual(B.values(B.open(next)), [1, 2]);
});

test('chained applyDelta calls (simulating two OTA cycles) stay correct and sorted', () => {
  let cur = buildBuffer([10, 20, 30]);
  cur = B.applyDelta(cur, buildDelta([15], [10])); // -> 15,20,30
  assert.deepEqual(B.values(B.open(cur)), [15, 20, 30]);
  cur = B.applyDelta(cur, buildDelta([5, 25], [20])); // -> 5,15,25,30
  assert.deepEqual(B.values(B.open(cur)), [5, 15, 25, 30]);
  assert.equal(B.isSorted(B.open(cur)), true);
});

// --- findExact (verify-byte / exact-shard FP-downgrade logic) -------------

test('findExact returns the matching shard entry by domain', () => {
  const entries = [
    { d: 'evil-example.com', s: ['Phishing.Database'] },
    { d: 'other.tld', s: ['HaGeZi'] }
  ];
  assert.deepEqual(B.findExact(entries, 'evil-example.com'), { d: 'evil-example.com', s: ['Phishing.Database'] });
});

test('findExact returns null on a miss — the 40-bit false-positive downgrade path', () => {
  const entries = [{ d: 'evil-example.com', s: ['Phishing.Database'] }];
  // A 40-bit collision: the hash matched but this shard's domains don't
  // include the one the browser actually visited.
  assert.equal(B.findExact(entries, 'totally-unrelated.example'), null);
  assert.equal(B.findExact([], 'evil-example.com'), null);
  assert.equal(B.findExact(null, 'evil-example.com'), null);
  assert.equal(B.findExact(entries, ''), null);
});

// --- smoke test against the real parry-feed output (B1) -------------------

const FEED_DIR = path.resolve(__dirname, '../../../parry-feed/v/current');
const hasFeedFixtures = fs.existsSync(path.join(FEED_DIR, 'set40.bin')) && fs.existsSync(path.join(FEED_DIR, 'meta.json'));

test('real parry-feed set40.bin/warn40.bin: open, sorted, counts match meta.json', (t) => {
  if (!hasFeedFixtures) { t.skip('parry-feed repo not checked out alongside scamshield — skipping real-feed smoke test'); return; }
  const meta = JSON.parse(fs.readFileSync(path.join(FEED_DIR, 'meta.json'), 'utf8'));

  const blockBuf = fs.readFileSync(path.join(FEED_DIR, 'set40.bin'));
  const blockSet = B.open(blockBuf.buffer.slice(blockBuf.byteOffset, blockBuf.byteOffset + blockBuf.byteLength));
  assert.equal(B.count(blockSet), meta.counts.block, 'set40.bin record count matches meta.json counts.block');
  assert.equal(B.isSorted(blockSet), true, 'set40.bin must be sorted ascending with no duplicates');

  const warnBuf = fs.readFileSync(path.join(FEED_DIR, 'warn40.bin'));
  const warnSet = B.open(warnBuf.buffer.slice(warnBuf.byteOffset, warnBuf.byteOffset + warnBuf.byteLength));
  assert.equal(B.count(warnSet), meta.counts.warn, 'warn40.bin record count matches meta.json counts.warn');
  assert.equal(B.isSorted(warnSet), true, 'warn40.bin must be sorted ascending with no duplicates');

  // has() finds the first and last real record (sorted, so index 0 / count-1
  // are exact boundary probes) and correctly misses a value one below the
  // very first record.
  const vals = B.values(blockSet);
  assert.equal(B.has(blockSet, vals[0]), true);
  assert.equal(B.has(blockSet, vals[vals.length - 1]), true);
  if (vals[0] > 0) assert.equal(B.has(blockSet, vals[0] - 1), false);
});

test('real exact-<NN>.jsonl.gz shard: findExact locates a known domain from shard 00', (t) => {
  const shardPath = path.join(FEED_DIR, 'exact-00.jsonl.gz');
  if (!hasFeedFixtures || !fs.existsSync(shardPath)) { t.skip('parry-feed exact shards not present — skipping'); return; }
  const zlib = require('node:zlib');
  const raw = zlib.gunzipSync(fs.readFileSync(shardPath)).toString('utf8');
  const entries = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(entries.length > 0, 'shard 00 should not be empty');
  const first = entries[0];
  assert.deepEqual(B.findExact(entries, first.d), first);
  assert.equal(B.findExact(entries, 'definitely-not-in-this-shard.invalid'), null);
});
