// ui/review.js — earned review-ask eligibility (0.7.0).
//
// Pure predicate: nothing here touches chrome.* or the DOM. Call sites (popup.js,
// options.js) compute `isChrome` from the packaged manifest — NOT `typeof
// browser === 'undefined'`, which modern Chrome's native `browser.*` alias
// (Chromium 148, 2026) makes unreliable — and pass in the stored reviewAsk
// state plus the counters it depends on. Kept separate from
// background/stats.js because this has nothing to do with usage stats — it is
// its own small piece of state, `reviewAsk` in chrome.storage.local (never
// settings, never synced): { state: 'pending'|'snoozed'|'rated'|'declined',
// snoozeUntil: ms epoch, asks: number of times "Maybe later" was chosen }.
//
// UMD like the engine/ui modules: loadable as a <script> from popup.html and
// options.html, and require()-able from Node tests.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSReview = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const DAY = 86400000;
  const INSTALL_AGE_DAYS = 7;     // minimum days since install before we ever ask
  const THREATS_THRESHOLD = 2;    // minimum all-time blocks before we ever ask (never on the 1st — could be a false positive)
  const SNOOZE_DAYS = 90;         // "Maybe later" snooze length
  const MAX_ASKS = 2;             // "asks" (Maybe-later count) at or above this stops re-asking forever
  // Chrome Web Store review tab. No Firefox equivalent exists yet (no AMO
  // listing), so Firefox never shows the ask — see eligible()'s isChrome gate.
  const CWS_REVIEW_URL = 'https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl/reviews';

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // eligible ⇔ ALL of:
  //  - Chrome build (isChrome passed in — Firefox never has a store listing to ask for)
  //  - threatsBlocked >= 2
  //  - now - installedAt >= 7 days
  //  - state === 'pending', OR (state === 'snoozed' AND now >= snoozeUntil AND asks < 2)
  // 'rated' and 'declined' are permanent — never eligible again.
  function eligible(input) {
    const o = input || {};
    if (!o.isChrome) return false;
    if (num(o.threatsBlocked) < THREATS_THRESHOLD) return false;
    const now = typeof o.now === 'number' && Number.isFinite(o.now) ? o.now : Date.now();
    if (now - num(o.installedAt) < INSTALL_AGE_DAYS * DAY) return false;
    if (o.state === 'pending') return true;
    if (o.state === 'snoozed') return now >= num(o.snoozeUntil) && num(o.asks) < MAX_ASKS;
    return false; // 'rated' | 'declined' | anything else
  }

  return { DAY, INSTALL_AGE_DAYS, THREATS_THRESHOLD, SNOOZE_DAYS, MAX_ASKS, CWS_REVIEW_URL, eligible };
});
