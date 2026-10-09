// background/feedsync.js — per-tier feed download + incremental persistence
//
// 0.14.1: runFeedUpdate used to fetch the block tier, warn tier, risk.json and
// nrd.bloom and only then do ONE Blockstore save, so a failure (or a hung CDN)
// in a late tier threw away an already-verified block tier. Here each tier is
// fetched, verified and saved on its own: the block tier first (the one that
// matters for protection), then warn / risk / nrd independently. A failed tier
// leaves that tier's last-good data in place and is named in `partial`.
//
// Nothing here touches chrome.* or the network directly — fetch, hashing,
// delta application and the store are injected — so it is unit-testable under
// plain `node --test`. UMD like the engine modules.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSFeedSync = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const WARN_REFRESH_MIN_MS = 7 * 24 * 3600 * 1000; // warn/risk/nrd: full pull at most every 7 days
  const FULL_TIMEOUT_MS = 30000;  // set40 / warn40 / nrd / risk: multi-MB files, per base
  const DELTA_TIMEOUT_MS = 15000; // delta-<ver>.bin: small, per base

  function withTimeout(opts, timeoutMs) {
    if (timeoutMs && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(timeoutMs);
    return opts;
  }

  // Tries each base in order (cdn first, then the raw fallback), returning the
  // first successful fetch's bytes. `bases` entries may be falsy/missing.
  // The per-base timeout stops a stalled CDN connection hanging the caller
  // (the per-page verdict path fetches exact shards through here too).
  async function fetchBufFromBases(bases, filename, timeoutMs, fetchFn) {
    const f = fetchFn || fetch;
    for (const base of bases) {
      if (!base) continue;
      try {
        const res = await f(base + filename, withTimeout({ cache: 'no-cache' }, timeoutMs));
        if (!res.ok) continue;
        return await res.arrayBuffer();
      } catch (_) { /* try the next base */ }
    }
    return null;
  }

  // Same, for a small JSON file; keeps the raw text so the caller can hash it.
  async function fetchJsonFromBases(bases, filename, timeoutMs, fetchFn) {
    const f = fetchFn || fetch;
    for (const base of bases) {
      if (!base) continue;
      try {
        const res = await f(base + filename, withTimeout({ cache: 'no-cache' }, timeoutMs));
        if (!res.ok) continue;
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (_) { continue; }
        return { data, text };
      } catch (_) { /* try the next base */ }
    }
    return null;
  }

  /**
   * syncFeed({ meta, rec, deps }) -> {
   *   rec, version, blockChanged, warnChanged, riskChanged, nrdChanged, partial: [...]
   * }
   *   meta — parsed meta.json (version, prev, urls, sha256, nrd)
   *   rec  — last-good Blockstore record (or the empty shape)
   *   deps — { fetchBuf(filename, timeoutMs), fetchJson(filename, timeoutMs),
   *            sha256Hex(buf), applyDelta(oldBuf, deltaBuf), save(record), now() }
   * `rec` in the result is the final record; `save` has already been called
   * after every tier that changed. `partial` lists tiers that were due but
   * could not be fetched/verified/saved ('block' | 'warn' | 'risk' | 'nrd').
   */
  async function syncFeed({ meta, rec, deps }) {
    const { fetchBuf, fetchJson, sha256Hex, applyDelta, save } = deps;
    const now = deps.now || Date.now;
    let cur = Object.assign({}, rec);
    const partial = [];
    const out = { blockChanged: false, warnChanged: false, riskChanged: false, nrdChanged: false };

    // Merge `patch` into the working record and persist it right away. The
    // working copy only advances after the save succeeded.
    async function commit(patch) {
      const next = Object.assign({}, cur, patch, { urls: meta.urls });
      await save(next);
      cur = next;
    }

    // ---- block tier (delta chain when meta.prev matches, else full pull) ----
    if (meta.version !== rec.version) {
      try {
        let blockBuf = null;
        if (rec.blockBuf && meta.prev && meta.prev === rec.version) {
          const deltaBuf = await fetchBuf(`delta-${rec.version}.bin`, DELTA_TIMEOUT_MS);
          if (deltaBuf && meta.sha256 && meta.sha256.deltaFromPrev && (await sha256Hex(deltaBuf)) === meta.sha256.deltaFromPrev) {
            try { blockBuf = applyDelta(rec.blockBuf, deltaBuf); } catch (_) { /* corrupt delta — fall through to a full pull */ }
          }
        }
        if (!blockBuf) {
          // No usable delta chain (first install, schema change, a version gap,
          // or the delta above failed to verify) — full pull, sha256-verified.
          const fullBuf = await fetchBuf('set40.bin', FULL_TIMEOUT_MS);
          if (fullBuf && meta.sha256 && meta.sha256.set40 && (await sha256Hex(fullBuf)) === meta.sha256.set40) blockBuf = fullBuf;
        }
        // The version only advances together with the block tier it describes.
        if (blockBuf) { await commit({ version: meta.version, blockBuf }); out.blockChanged = true; }
        else partial.push('block');
      } catch (_) { partial.push('block'); }
    }

    // ---- warn tier (full pull, no delta chain; sha256 only when meta has one) ----
    if (!cur.warnBuf || now() - (cur.warnUpdatedAt || 0) >= WARN_REFRESH_MIN_MS) {
      try {
        const buf = await fetchBuf('warn40.bin', FULL_TIMEOUT_MS);
        // An older meta.json without a warn hash (pre-fix feeds) installs unverified.
        if (buf && (!(meta.sha256 && meta.sha256.warn40) || (await sha256Hex(buf)) === meta.sha256.warn40)) {
          await commit({ warnBuf: buf, warnUpdatedAt: now() }); out.warnChanged = true;
        } else partial.push('warn');
      } catch (_) { partial.push('warn'); }
    }

    // ---- risk.json (abused-TLD weights + dyndns/hoster arrays) ----
    if (!cur.riskTables || now() - (cur.riskUpdatedAt || 0) >= WARN_REFRESH_MIN_MS) {
      try {
        const fetched = await fetchJson('risk.json', FULL_TIMEOUT_MS);
        if (fetched && fetched.data && typeof fetched.data === 'object' &&
            (!(meta.sha256 && meta.sha256.risk) || (await sha256Hex(new TextEncoder().encode(fetched.text))) === meta.sha256.risk)) {
          await commit({ riskTables: fetched.data, riskUpdatedAt: now() }); out.riskChanged = true;
        } else partial.push('risk');
      } catch (_) { partial.push('risk'); }
    }

    // ---- nrd.bloom (newly-registered-domains Bloom filter; no delta chain) ----
    if (!cur.nrdBuf || now() - (cur.nrdUpdatedAt || 0) >= WARN_REFRESH_MIN_MS) {
      try {
        const buf = await fetchBuf('nrd.bloom', FULL_TIMEOUT_MS);
        if (buf && (!(meta.nrd && meta.nrd.sha256) || (await sha256Hex(buf)) === meta.nrd.sha256)) {
          await commit({ nrdBuf: buf, nrdUpdatedAt: now() }); out.nrdChanged = true;
        } else partial.push('nrd');
      } catch (_) { partial.push('nrd'); }
    }

    return Object.assign(out, { rec: cur, version: cur.version || '', partial });
  }

  return { WARN_REFRESH_MIN_MS, FULL_TIMEOUT_MS, DELTA_TIMEOUT_MS, fetchBufFromBases, fetchJsonFromBases, syncFeed };
});
