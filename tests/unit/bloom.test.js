// tests/unit/bloom.test.js — engine/bloom.js: nrd.bloom reader (Task C3).
//
// A tiny bloom file is built here with the SAME algorithm as parry-feed's
// lib/bloom.js writer (per that module's cross-referenced header comment),
// inlined with plain Node crypto since this repo cannot require() the feed
// repo's module — the two implementations are pinned to the same spec by
// this test and by tests/unit/reasons.test.js-style code review, not by
// shared code.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const Bloom = require('../../engine/bloom');

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest(); }

function optimalParams(n, p) {
  const m = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const mBits = Math.max(8, Math.ceil(m / 8) * 8);
  let k = Math.max(1, Math.round((mBits / n) * Math.LN2));
  if (k > 7) k = 7;
  return { mBits, k };
}
function indicesFor(digest, k, mBits) {
  const h1 = digest.readUInt32BE(0);
  let h2 = digest.readUInt32BE(4);
  if (h2 === 0) h2 = 1;
  const out = [];
  for (let i = 0; i < k; i++) out.push((h1 + i * h2) % mBits);
  return out;
}
function buildFixtureBloom(hosts, p) {
  const n = hosts.length;
  const { mBits, k } = optimalParams(n, p);
  const bits = Buffer.alloc(Math.ceil(mBits / 8));
  for (const h of hosts) {
    for (const idx of indicesFor(sha256(h), k, mBits)) bits[idx >> 3] |= 1 << (7 - (idx & 7));
  }
  const header = Buffer.alloc(16);
  header.write('NRDB', 0, 4, 'ascii');
  header.writeUInt8(1, 4);
  header.writeUInt8(k, 5);
  header.writeUInt16BE(0, 6);
  header.writeUInt32BE(n, 8);
  header.writeUInt32BE(mBits, 12);
  return Buffer.concat([header, bits]);
}

test('parseHeader reads the 16-byte header and hands back the bit array', () => {
  const buf = buildFixtureBloom(['known-in-a.example', 'known-in-b.example'], 0.01);
  const parsed = Bloom.parseHeader(new Uint8Array(buf));
  assert.strictEqual(parsed.version, 1);
  assert.ok(parsed.k >= 1 && parsed.k <= 7);
  assert.strictEqual(parsed.n, 2);
  assert.ok(parsed.mBits > 0 && parsed.mBits % 8 === 0);
  assert.strictEqual(parsed.bits.length, parsed.mBits / 8);
});

test('parseHeader rejects a bad magic and a length mismatched with the header', () => {
  const buf = buildFixtureBloom(['x.example'], 0.01);
  const badMagic = Buffer.from(buf); badMagic.write('XXXX', 0, 4, 'ascii');
  assert.throws(() => Bloom.parseHeader(badMagic), /bad magic/);
  const truncated = buf.subarray(0, buf.length - 1);
  assert.throws(() => Bloom.parseHeader(truncated), /does not match/);
  const tooShort = Buffer.alloc(4);
  assert.throws(() => Bloom.parseHeader(tooShort), /shorter than/);
});

test('test() reports known-in hosts as members and a clean host as absent', () => {
  const hosts = ['nrd-known-1.example', 'nrd-known-2.example', 'nrd-known-3.example'];
  const buf = buildFixtureBloom(hosts, 0.005);
  const parsed = Bloom.parseHeader(new Uint8Array(buf));
  for (const h of hosts) {
    assert.strictEqual(Bloom.test(parsed, sha256(h)), true, `expected ${h} to test positive`);
  }
  assert.strictEqual(Bloom.test(parsed, sha256('definitely-clean.example')), false);
});

test('indicesFor implements Kirsch-Mitzenmacher double hashing with the h2=0 guard', () => {
  const digest = sha256('spec-pin.example');
  const h1 = digest.readUInt32BE(0);
  let h2 = digest.readUInt32BE(4);
  if (h2 === 0) h2 = 1;
  const expected = [0, 1, 2, 3, 4].map((i) => (h1 + i * h2) % 1024);
  assert.deepStrictEqual(Bloom.indicesFor(digest, 5, 1024), expected);

  const degenerate = Buffer.alloc(32);
  degenerate.writeUInt32BE(7, 0);
  assert.deepStrictEqual(Bloom.indicesFor(degenerate, 3, 1024), [7, 8, 9]); // h2 forced to 1
});

test('indicesFor throws on too few bytes; test() fails closed on a malformed parsed object', () => {
  assert.throws(() => Bloom.indicesFor([1, 2, 3], 3, 100), RangeError);
  assert.strictEqual(Bloom.test(null, sha256('x')), false);
  assert.strictEqual(Bloom.test({ bits: null, mBits: 0, k: 0 }, sha256('x')), false);
  assert.strictEqual(Bloom.test({ bits: Buffer.alloc(1), mBits: 8, k: 3 }, [1, 2]), false); // too-short hashBytes
});
