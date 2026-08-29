// engine/bloom.js — nrd.bloom reader (0.10.0, Task C3, "New site" signal).
//
// Chrome-free and crypto-free by design, matching engine/blockset.js and
// engine/risk_rules.js: this module never touches crypto.subtle, so it is
// fully Node-testable. The service worker computes SHA-256(hostname) itself
// (crypto.subtle is inherently async) and hands the digest bytes here —
// this module only ever deals in already-hashed bytes and parsed buffers.
//
// FILE FORMAT (nrd.bloom), matching parry-feed's lib/bloom.js exactly:
// 16-byte header + bit array, all big-endian.
//   offset 0  (4 bytes): magic ASCII 'NRDB'
//   offset 4  (1 byte ): version (currently 1)
//   offset 5  (1 byte ): k (number of hash functions)
//   offset 6  (2 bytes): reserved, always 0
//   offset 8  (4 bytes): n, big-endian u32 (number of hostnames inserted)
//   offset 12 (4 bytes): mBits, big-endian u32 (bit-array size, in bits)
//   offset 16..        : bit array, ceil(mBits/8) bytes. Bit i lives at byte
//                         (i >> 3), position (7 - (i & 7)) from the MSB.
//
// INDEX DERIVATION — THE SAME ALGORITHM RUNS ON BOTH SIDES. This exact
// recipe is mirrored byte-for-byte in the feed repo's lib/bloom.js (see that
// file's matching header comment); changing either side without the other
// breaks every install silently (only false negatives — a real NRD hit that
// stops matching — never false positives, which makes the bug very easy to
// miss in testing). Given `hashBytes` = the first 8+ bytes of
// SHA-256(lowercased full hostname or registrable domain), UTF-8 encoded:
//   1. h1 = big-endian uint32 of hashBytes[0..3]
//      h2 = big-endian uint32 of hashBytes[4..7]
//      if (h2 === 0) h2 = 1   -- degenerate-digest guard (SHA-256 never
//                                produces an all-zero 4-byte window in
//                                practice, but this keeps the scheme from
//                                ever collapsing to a single repeated index)
//   2. For i = 0..k-1: index_i = (h1 + i * h2) % mBits
//      (Kirsch–Mitzenmacher double hashing: k roughly-independent indices
//      from one digest, no per-index re-hash needed.)
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Bloom = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const MAGIC = 'NRDB';
  const HEADER_LEN = 16;

  // Parses an ArrayBuffer/Uint8Array nrd.bloom file into
  // { version, k, n, mBits, bits }. Throws on a malformed buffer — callers
  // (background/service_worker.js) wrap this in try/catch and treat a
  // parse failure as "NRD feature unavailable this cycle", never a hard
  // error surfaced to the page.
  function parseHeader(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length < HEADER_LEN) throw new RangeError('nrd.bloom buffer shorter than the 16-byte header');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (magic !== MAGIC) throw new RangeError(`bad magic: expected ${MAGIC}, got ${magic}`);
    const version = dv.getUint8(4);
    const k = dv.getUint8(5);
    const n = dv.getUint32(8, false);
    const mBits = dv.getUint32(12, false);
    const expectedLen = HEADER_LEN + Math.ceil(mBits / 8);
    if (u8.length !== expectedLen) {
      throw new RangeError(`nrd.bloom length ${u8.length} does not match header (expected ${expectedLen})`);
    }
    return { version, k, n, mBits, bits: u8.subarray(HEADER_LEN) };
  }

  // The k index derivation shared with parry-feed's lib/bloom.js (see this
  // file's header comment for the exact spec). `hashBytes` is any indexable
  // byte source (Uint8Array, plain array) with at least 8 bytes.
  function indicesFor(hashBytes, k, mBits) {
    if (!hashBytes || hashBytes.length < 8) throw new RangeError('indicesFor needs at least 8 digest bytes');
    let h1 = 0;
    for (let i = 0; i < 4; i++) h1 = h1 * 256 + (hashBytes[i] & 0xff);
    let h2 = 0;
    for (let i = 4; i < 8; i++) h2 = h2 * 256 + (hashBytes[i] & 0xff);
    if (h2 === 0) h2 = 1;
    const out = new Array(k);
    for (let i = 0; i < k; i++) out[i] = (h1 + i * h2) % mBits;
    return out;
  }

  function testBit(bits, idx) {
    return (bits[idx >> 3] & (1 << (7 - (idx & 7)))) !== 0;
  }

  // True iff `hashBytes` (>=8 bytes of SHA-256(hostname)) is a member of the
  // parsed bloom filter. Never throws on a malformed parsed object — a
  // membership test against an unavailable/corrupt filter degrades to "no
  // hit" rather than breaking the rest of the verdict pipeline.
  function test(parsed, hashBytes) {
    if (!parsed || !parsed.bits || !parsed.mBits || !parsed.k) return false;
    let idxs;
    try { idxs = indicesFor(hashBytes, parsed.k, parsed.mBits); } catch (_) { return false; }
    for (const idx of idxs) {
      if (!testBit(parsed.bits, idx)) return false;
    }
    return true;
  }

  return { MAGIC, HEADER_LEN, parseHeader, indicesFor, testBit, test };
});
