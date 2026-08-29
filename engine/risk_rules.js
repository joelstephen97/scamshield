// engine/risk_rules.js — risk.json warn-tier evidence (0.9.0, Task B3).
// See research-threat-feeds.md "Output contract" for risk.json's shape:
// { tlds: {".top": weight, ...}, dyndns: [hashed u32, ...], hosters: [...] }.
//
// Two independent inputs, split by whether they need crypto:
//   - abusedTldWeight(): pure string/object lookup, no hashing — safe to run
//     synchronously inside engine/heuristics.js's scoreUrl().
//   - matchHostingRisk(): dyndns/hoster membership is checked against a
//     PRECOMPUTED 32-bit hash the caller supplies, mirroring
//     engine/blockset.js's crypto-free design (that module takes a
//     precomputed 40-bit hash for the same reason: crypto.subtle is async,
//     and staying hash-input-only keeps this file fully Node-testable). The
//     service worker computes the SHA-256 itself (background/service_worker.js
//     checkRiskHosting()) and hands the first 4 digest bytes to
//     hash32FromBytes() here.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';

  const { registrableParts } = C;

  // Abused-TLD weight table lookup. `tlds` is risk.json's `tlds` map keyed by
  // ".<tld>" (leading dot). Returns { tld, weight } or null.
  function abusedTldWeight(host, tlds) {
    if (!tlds || typeof tlds !== 'object') return null;
    const parts = registrableParts(String(host || '').toLowerCase());
    if (!parts.suffix) return null;
    const tld = '.' + parts.suffix.split('.').pop();
    const w = tlds[tld];
    return typeof w === 'number' ? { tld, weight: w } : null;
  }

  // Top 32 bits of a SHA-256 digest, big-endian, as an unsigned integer —
  // the same encoding risk.json's dyndns/hosters arrays use. `bytes` is any
  // indexable byte source (Uint8Array, plain array, DataView at offset 0).
  function hash32FromBytes(bytes) {
    if (!bytes || bytes.length < 4) throw new RangeError('hash32FromBytes needs at least 4 bytes');
    let v = 0;
    for (let i = 0; i < 4; i++) v = v * 256 + (bytes[i] & 0xff);
    return v >>> 0;
  }

  // dyndns/hoster membership against precomputed hash32 sets (Set<number> or
  // any object with a .has()). Fails safe (null, never throws) on a
  // malformed/non-Set-like argument — same "contribute nothing" discipline
  // engine/blockset.js's evalTree uses for a malformed tree.
  function matchHostingRisk(hash32, dyndnsSet, hostersSet) {
    if (typeof hash32 !== 'number' || Number.isNaN(hash32)) return null;
    if (dyndnsSet && typeof dyndnsSet.has === 'function' && dyndnsSet.has(hash32)) return 'dyndns';
    if (hostersSet && typeof hostersSet.has === 'function' && hostersSet.has(hash32)) return 'hoster';
    return null;
  }

  return { abusedTldWeight, hash32FromBytes, matchHostingRisk };
});
