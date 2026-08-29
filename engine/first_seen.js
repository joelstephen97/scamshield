// engine/first_seen.js — per-device "first-seen-locally" ring for the NRD
// signal (0.10.0, Task C3). Pure and chrome-free, matching
// background/stats.js's ring discipline: the service worker owns the
// storage.local key ('firstSeen'), this file owns the arithmetic, so the
// whole module is unit-testable under plain `node --test`.
//
// Data shape (JSON-serializable for storage.local): an array of
// [hostHash, firstSeenAtMs] pairs, ordered least- to most-recently-touched
// (an LRU list), capped at CAP entries. `hostHash` is caller-supplied (the
// service worker hex-encodes a slice of the same SHA-256 digest it already
// computed for the bloom-filter lookup) — this module never sees or stores
// a raw hostname, and is never loaded into a content-script world, so it
// adds no fingerprinting surface: it is SW-only state about domains the NRD
// bloom filter already flagged, not a general browsing history.
//
// Only ever touched for domains that already tested positive against the
// NRD bloom filter (see background/service_worker.js checkNrdHost()) — this
// is deliberately NOT a record of every site the user visits.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSFirstSeen = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const CAP = 2000;
  const SUPPRESS_AFTER_DAYS = 30;
  const SUPPRESS_AFTER_MS = SUPPRESS_AFTER_DAYS * 24 * 3600 * 1000;

  // Defensive read of whatever storage.local handed us: drops malformed
  // entries, coerces to [string, non-negative finite number] pairs. Always
  // returns a fresh array, so callers can never mutate the stored value in
  // place (mirrors stats.js's normalize()).
  function normalize(list) {
    const out = [];
    for (const e of (Array.isArray(list) ? list : [])) {
      if (!Array.isArray(e) || e.length !== 2) continue;
      const [hash, ts] = e;
      if (typeof hash !== 'string' || !hash) continue;
      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) continue;
      out.push([hash, ts]);
    }
    return out;
  }

  // Records a visit to `hostHash`. A genuinely new hash gets `now` as its
  // first-seen timestamp; an already-known hash keeps its ORIGINAL
  // first-seen timestamp (never overwritten, mirroring ensureInstalledAt()'s
  // "first-seen stamp" discipline) but moves to the most-recently-touched
  // end of the list. The list is capped at CAP entries, oldest/least-
  // recently-touched dropped first (mirrors stats.js's `.slice(-RING_DAYS)`
  // ring-trim discipline).
  // Returns { list, firstSeenAt, isNew }.
  function touch(list, hostHash, now) {
    const clean = normalize(list);
    const idx = clean.findIndex(([h]) => h === hostHash);
    let firstSeenAt;
    let rest;
    if (idx === -1) {
      firstSeenAt = now;
      rest = clean;
    } else {
      firstSeenAt = clean[idx][1];
      rest = clean.slice(0, idx).concat(clean.slice(idx + 1));
    }
    const next = rest.concat([[hostHash, firstSeenAt]]).slice(-CAP);
    return { list: next, firstSeenAt, isNew: idx === -1 };
  }

  // True iff hostHash was first seen at least SUPPRESS_AFTER_DAYS ago —
  // "it's been fine for a month", so the NRD warn-tier signal should be
  // suppressed for this domain even though it still tests positive against
  // the bloom filter (a stale/slow-to-refresh window, or a domain that
  // simply survived past the feed's 14-day horizon).
  function isEstablished(list, hostHash, now) {
    const clean = normalize(list);
    const entry = clean.find(([h]) => h === hostHash);
    if (!entry) return false;
    return (now - entry[1]) >= SUPPRESS_AFTER_MS;
  }

  return { CAP, SUPPRESS_AFTER_DAYS, SUPPRESS_AFTER_MS, normalize, touch, isEstablished };
});
