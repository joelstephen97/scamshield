// background/stats.js — local-only usage statistics (pure).
//
// The service worker owns the storage; this file owns the arithmetic. Nothing
// here touches chrome.* — state comes in as arguments and goes out as return
// values, so the whole module is unit-testable under plain `node --test`.
//
// Everything it computes stays on the device: the SW keeps these counters in
// chrome.storage.local OUTSIDE the settings object and outside SYNCED_KEYS, so
// they never sync, never enter a report payload, and never leave the machine.
//
// UMD like the engine modules — loadable as a Firefox background script,
// imported by the Chrome ES-module SW, and require()-able from Node tests.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSStats = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Rolling window of daily buckets. 90 days is enough for the Statistics tab's
  // 7/30-day views plus headroom, and small enough that the whole ring is a few
  // KB of storage.local.
  const RING_DAYS = 90;
  const FIELDS = ['checked', 'threats', 'privacy'];
  const CATEGORIES = ['phishing', 'fakeShop', 'wallet', 'techSupport', 'clipboard', 'clickfix', 'fakeUpdate', 'other'];

  // Day boundaries are UTC so a bucket key never depends on the machine's
  // timezone (or shifts under DST): purely arithmetic, and stable if the user
  // travels. The UI labels them with the local date, which is close enough for
  // a "last 7 days" bar chart.
  function dayKey(now) {
    const t = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    return new Date(t).toISOString().slice(0, 10);
  }

  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function count(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  // Defensive read of whatever storage.local handed us: drops malformed
  // entries, coerces counters to non-negative integers, merges duplicate days,
  // and sorts oldest→newest. Always returns a fresh array of fresh buckets, so
  // callers can never mutate the stored value in place.
  function normalize(statsDaily) {
    const seen = new Map();
    for (const b of (Array.isArray(statsDaily) ? statsDaily : [])) {
      if (!b || typeof b.d !== 'string' || !DAY_RE.test(b.d)) continue;
      let rec = seen.get(b.d);
      if (!rec) { rec = { d: b.d, checked: 0, threats: 0, privacy: 0 }; seen.set(b.d, rec); }
      for (const f of FIELDS) rec[f] += count(b[f]);
    }
    return [...seen.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  // Adds 1 to `field` in today's bucket, creating it when absent, and trims the
  // ring to the newest RING_DAYS days. Days with no activity are simply absent
  // from storage — the UI zero-fills the gaps when it draws a chart.
  function bump(statsDaily, field, now) {
    const ring = normalize(statsDaily);
    if (!FIELDS.includes(field)) return ring.slice(-RING_DAYS);
    const key = dayKey(now);
    let bucket = ring.find((b) => b.d === key);
    if (!bucket) {
      bucket = { d: key, checked: 0, threats: 0, privacy: 0 };
      ring.push(bucket);
      ring.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)); // guards a backwards clock
    }
    bucket[field] += 1;
    return ring.slice(-RING_DAYS);
  }

  // Threat taxonomy for the "what did it block" breakdown.
  //
  // Two inputs exist at the SW's threat seam, so categoryOf accepts either (or
  // both, as { kind, verdict }):
  //   - `kind`: the label the content script sends with bumpThreats, which is
  //     also the history-event kind — 'wallet' | 'clipboard' | 'techscam', or
  //     absent for a whole-page verdict (recorded as 'page').
  //   - the page verdict's decisive `flags` (engine/heuristics.js and friends),
  //     which is the only thing that distinguishes one kind of dangerous page
  //     from another.
  // A detector kind is the coarse label ("the clipboard guard fired"); a
  // decisive flag on the same event is the precise one. So a kind wins, EXCEPT
  // where a flag refines it (see REFINES): the ClickFix escalation neutralises
  // a dangerous clipboard payload and still reports kind 'clipboard', while its
  // verdict carries the 'clickfix' flag — that block belongs under clickfix.
  // Unrelated flags never override the detector that actually blocked: the page
  // verdict that happens to be on the tab when a wallet request is declined
  // must not file that block as phishing.
  // With no usable kind: a decisive flag decides; a shop_* reason code marks a
  // fake storefront; any other dangerous page falls back to 'phishing';
  // anything unrecognisable is 'other'.
  const BY_KIND = {
    wallet: 'wallet',
    clipboard: 'clipboard',
    techscam: 'techSupport',
    // No sender emits these two today (ClickFix escalates through the clipboard
    // guard, fake updates through the page verdict); kept so a future detector
    // — or a history event carrying one of these kinds — files itself correctly.
    clickfix: 'clickfix',
    fakeupdate: 'fakeUpdate',
    fakeUpdate: 'fakeUpdate'
  };
  const BY_FLAG = {
    'seed-phrase-harvest': 'wallet',
    'clickfix': 'clickfix',
    'fake-browser-update': 'fakeUpdate',
    'delivery-fee-scam': 'fakeShop',
    'fake-alert-phone': 'techSupport',
    'credential-form-foreign-domain': 'phishing',
    'brand-impersonation-content': 'phishing',
    'brand-impersonation-visual': 'phishing'
  };
  // kind → categories a decisive flag may upgrade that kind to.
  const REFINES = { clipboard: ['clickfix'] };
  function categoryOf(event) {
    if (!event) return 'other';
    if (typeof event === 'string') return categoryOf({ kind: event });
    const kind = typeof event.kind === 'string' ? event.kind : '';
    const verdict = (event.verdict && typeof event.verdict === 'object') ? event.verdict : event;
    const flags = Array.isArray(verdict.flags) ? verdict.flags : [];
    let flagCat = '';
    for (const f of flags) { if (BY_FLAG[f]) { flagCat = BY_FLAG[f]; break; } }
    if (BY_KIND[kind]) {
      if (flagCat && (REFINES[kind] || []).includes(flagCat)) return flagCat;
      return BY_KIND[kind];
    }
    if (flagCat) return flagCat;
    const codes = Array.isArray(verdict.reasonCodes) ? verdict.reasonCodes : [];
    if (codes.some((c) => typeof c === 'string' && c.indexOf('shop_') === 0)) return 'fakeShop';
    if (kind === 'page' || verdict.level === 'dangerous' || verdict.level === 'suspicious') return 'phishing';
    return 'other';
  }

  // Totals over the last `period` days, inclusive of today. Absent days count
  // as zero, so gaps in the ring need no special handling.
  function summarize(statsDaily, period, now) {
    const days = count(period) || 7;
    const t = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    const from = dayKey(t - (days - 1) * 86400000);
    const to = dayKey(t);
    const out = { checked: 0, threats: 0, privacy: 0 };
    for (const b of normalize(statsDaily)) {
      if (b.d < from || b.d > to) continue;
      for (const f of FIELDS) out[f] += b[f];
    }
    return out;
  }

  return { RING_DAYS, FIELDS, CATEGORIES, dayKey, normalize, bump, categoryOf, summarize };
});
