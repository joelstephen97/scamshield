// engine/blockset.js — v0.9.0 threat-feed matcher (Task B2).
//
// Chrome-free and crypto-free by design (matches engine/stats.js's UMD
// pattern): this module never touches crypto.subtle or any extension API, so
// it is fully Node-testable. The service worker computes SHA-256(hostname)
// itself (async, crypto.subtle) and hands the first 5 digest bytes here via
// hash40FromBytes() to get the same 40-bit integer the feed's binary records
// encode — this module only ever deals in that integer form.
//
// Record format (set40.bin / warn40.bin / delta-<prev>.bin), as emitted by
// parry-feed (see research-threat-feeds.md "Output contract"): each record is
// 5 bytes — big-endian u32 = high 32 bits of SHA-256(hostname), plus 1 verify
// byte (hash bits 32-39). Read together those 5 bytes ARE the top 40 bits of
// the digest, big-endian — so a "record value" is just that 40-bit integer,
// well inside Number.MAX_SAFE_INTEGER (2^40 < 2^53). Files are sorted
// ascending by this value, which is what makes has() a binary search.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Blockset = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const RECORD_SIZE = 5;
  const DELTA_HEADER_SIZE = 8; // { addedCount u32 BE, removedCount u32 BE }

  // Reads the 40-bit big-endian value at byte offset `off` in `view`.
  function recordValueAt(view, off) {
    return view.getUint32(off, false) * 256 + view.getUint8(off + 4);
  }
  // Inverse of recordValueAt — splits a 40-bit value back into its 4-byte
  // big-endian prefix and trailing verify byte.
  function writeRecordValue(view, off, value) {
    view.setUint32(off, Math.floor(value / 256), false);
    view.setUint8(off + 4, value % 256);
  }

  // The service worker's only entry point into this module's number space:
  // hand it the first 5 bytes of a SHA-256(hostname) digest (any indexable
  // byte source — Uint8Array, a plain array, or a DataView with byteOffset 0)
  // and get back the same 40-bit integer the feed's binary records use.
  function hash40FromBytes(bytes) {
    if (!bytes || bytes.length < RECORD_SIZE) throw new RangeError('hash40FromBytes needs at least 5 bytes');
    let v = 0;
    for (let i = 0; i < RECORD_SIZE; i++) v = v * 256 + (bytes[i] & 0xff);
    return v;
  }

  // The exact-shard filename the SW must fetch to verify a 40-bit hit: shard
  // index = the first byte of SHA-256(hostname), i.e. the top 8 bits of a
  // hash40 value (bits 32-39 of the 40). Pure arithmetic — the fetch+gunzip
  // that actually reads exact-<hex>.jsonl.gz is chrome/SW territory.
  function shardByte(hash40) { return Math.floor(hash40 / 0x100000000); }

  // Wraps a raw ArrayBuffer of sorted 5-byte records for repeated has()
  // lookups without re-deriving the view/count each call.
  function open(buf) {
    if (!(buf instanceof ArrayBuffer)) throw new TypeError('open() requires an ArrayBuffer');
    if (buf.byteLength % RECORD_SIZE !== 0) throw new RangeError('buffer length is not a multiple of ' + RECORD_SIZE);
    return { buf, view: new DataView(buf), count: buf.byteLength / RECORD_SIZE };
  }

  // Binary search over an open()'d set. O(log n), well under 1µs at 1M+ records.
  function has(set, hash40) {
    let lo = 0, hi = set.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = recordValueAt(set.view, mid * RECORD_SIZE);
      if (v === hash40) return true;
      if (v < hash40) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }

  // All record values in ascending order, as plain numbers — for tests
  // (sort-invariant checks) and for anything that wants to iterate rather
  // than probe. Not used on the hot verdict path.
  function values(set) {
    const out = new Array(set.count);
    for (let i = 0; i < set.count; i++) out[i] = recordValueAt(set.view, i * RECORD_SIZE);
    return out;
  }

  function count(set) { return set.count; }

  // True iff every value is strictly increasing (sorted, no duplicates) —
  // the invariant has()'s binary search depends on.
  function isSorted(set) {
    for (let i = 1; i < set.count; i++) {
      if (recordValueAt(set.view, (i - 1) * RECORD_SIZE) >= recordValueAt(set.view, i * RECORD_SIZE)) return false;
    }
    return true;
  }

  // Standard binary search over a plain sorted-number array — used internally
  // for the delta's removed-records list, and exposed since it is otherwise
  // pure logic worth testing directly.
  function binarySearchValue(sortedArr, target) {
    let lo = 0, hi = sortedArr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedArr[mid] === target) return true;
      if (sortedArr[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }

  // Parses a delta-<prev>.bin buffer into { added, removed } arrays of plain
  // 40-bit numbers (both sorted ascending, per the output contract).
  function parseDelta(deltaBuf) {
    if (!(deltaBuf instanceof ArrayBuffer)) throw new TypeError('parseDelta() requires an ArrayBuffer');
    if (deltaBuf.byteLength < DELTA_HEADER_SIZE) throw new RangeError('delta buffer shorter than its header');
    const dv = new DataView(deltaBuf);
    const addedCount = dv.getUint32(0, false);
    const removedCount = dv.getUint32(4, false);
    const addedStart = DELTA_HEADER_SIZE;
    const removedStart = addedStart + addedCount * RECORD_SIZE;
    const expectedLen = removedStart + removedCount * RECORD_SIZE;
    if (deltaBuf.byteLength !== expectedLen) {
      throw new RangeError(`delta buffer length ${deltaBuf.byteLength} does not match header (expected ${expectedLen})`);
    }
    const added = new Array(addedCount);
    for (let i = 0; i < addedCount; i++) added[i] = recordValueAt(dv, addedStart + i * RECORD_SIZE);
    const removed = new Array(removedCount);
    for (let i = 0; i < removedCount; i++) removed[i] = recordValueAt(dv, removedStart + i * RECORD_SIZE);
    return { added, removed };
  }

  // Applies a delta (header {addedCount, removedCount} then sorted added
  // records then sorted removed records) to a base set40.bin-shaped buffer,
  // returning a NEW ArrayBuffer: base minus removed, plus added, still sorted
  // ascending with no duplicates (a value present in both base and `added` —
  // should not happen upstream, but is tolerated — collapses to one entry).
  function applyDelta(baseBuf, deltaBuf) {
    if (!(baseBuf instanceof ArrayBuffer)) throw new TypeError('applyDelta() requires a base ArrayBuffer');
    const baseView = new DataView(baseBuf);
    const baseCount = baseBuf.byteLength / RECORD_SIZE;
    const { added, removed } = parseDelta(deltaBuf);

    const kept = [];
    for (let i = 0; i < baseCount; i++) {
      const v = recordValueAt(baseView, i * RECORD_SIZE);
      if (!binarySearchValue(removed, v)) kept.push(v);
    }

    // Merge two sorted arrays (`kept`, `added`) into one sorted, deduped array.
    const merged = [];
    let i = 0, j = 0;
    while (i < kept.length && j < added.length) {
      if (kept[i] === added[j]) { merged.push(kept[i]); i++; j++; }
      else if (kept[i] < added[j]) merged.push(kept[i++]);
      else merged.push(added[j++]);
    }
    while (i < kept.length) merged.push(kept[i++]);
    while (j < added.length) merged.push(added[j++]);

    const out = new ArrayBuffer(merged.length * RECORD_SIZE);
    const outView = new DataView(out);
    for (let k = 0; k < merged.length; k++) writeRecordValue(outView, k * RECORD_SIZE, merged[k]);
    return out;
  }

  // Pure verify-tier lookup: given already-parsed exact-shard entries
  // ({d: domain, s: [sources]}) and the hostname a 40-bit hit came from,
  // returns the matching entry or null. A null result is the "40-bit false
  // positive" case the SW downgrades to no-hit and caches as a negative — the
  // fetch+gunzip that produces `entries` is inherently chrome/SW territory,
  // but this decision itself stays pure and Node-testable.
  function findExact(entries, hostname) {
    if (!Array.isArray(entries) || !hostname) return null;
    for (const e of entries) {
      if (e && e.d === hostname) return e;
    }
    return null;
  }

  return {
    RECORD_SIZE, DELTA_HEADER_SIZE,
    hash40FromBytes, shardByte,
    open, has, values, count, isSorted,
    binarySearchValue, parseDelta, applyDelta,
    findExact
  };
});
