(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Site-engagement gating (0.6.0) — the same false-positive suppressor Chrome
  // documents for its lookalike warnings: only warn about probabilistic
  // signals on sites the user does NOT visit frequently. Fully local: a small
  // per-registrable-domain visit counter, capped, pruned, never transmitted.
  //
  // Only clean (safe-verdict, top-frame) visits are recorded, so repeatedly
  // landing on a flagged page can never build enough engagement to mute its
  // own warnings. Decisive flags are never gated on engagement at all — the
  // suppression applies only to flag-less "suspicious" verdicts.
  const CAP = 500;                                // max domains tracked (LRU by last visit)
  const STALE_MS = 60 * 24 * 3600 * 1000;         // forget domains not seen in 60 days
  const SESSION_GAP_MS = 30 * 60 * 1000;          // visits within 30 min count once
  const MIN_VISITS = 3;                           // "frequent" = 3+ separate visits...
  const RECENT_MS = 30 * 24 * 3600 * 1000;        // ...with the last one inside 30 days

  // map shape: { [registrableDomain]: { n: visitCount, ts: lastVisitMs } }
  function recordVisit(map, domain, now) {
    if (!domain) return map || {};
    const m = Object.assign({}, map);
    const cur = m[domain];
    if (cur && now - cur.ts < SESSION_GAP_MS) {
      m[domain] = { n: cur.n, ts: now };          // same session: refresh, don't inflate
    } else {
      m[domain] = { n: Math.min(((cur && cur.n) || 0) + 1, 999), ts: now };
    }
    for (const k of Object.keys(m)) if (now - m[k].ts > STALE_MS) delete m[k];
    const keys = Object.keys(m);
    if (keys.length > CAP) {
      keys.sort((a, b) => m[a].ts - m[b].ts);
      for (const k of keys.slice(0, keys.length - CAP)) delete m[k];
    }
    return m;
  }

  function isEngaged(map, domain, now) {
    const e = map && map[domain];
    return !!(e && e.n >= MIN_VISITS && now - e.ts <= RECENT_MS);
  }

  return { engagement: { recordVisit, isEngaged, CAP, MIN_VISITS, SESSION_GAP_MS } };
});
