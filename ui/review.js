// ui/review.js — earned review-ask eligibility (0.7.0).
//
// Pure predicate: nothing here touches chrome.* or the DOM. Call sites (popup.js,
// options.js) derive the store URL from the packaged manifest — NOT `typeof
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
  const INSTALL_AGE_DAYS = 14;    // minimum days since install before we ever ask (0.15.0: was 7)
  const THREATS_THRESHOLD = 1;    // at least one Stop-tier event (0.15.0: was 2; the false-alarm rule below now guards a bad first stop)
  const FALSE_ALARM_DAYS = 14;    // (0.15.0) any "This site is fine" tap in this window means we were noisy: don't ask
  const SURFACE_QUIET_MS = 10 * 60 * 1000; // (0.15.0) never within 10 minutes of any warn or stop surface
  // Surfaces that interrupt (warn or stop). Passive marks (SERP dot, greyed
  // blocks, hidden ads, notify toast) don't count as a warning for this rule.
  const WARN_STOP_KINDS = ['banner', 'interstitial', 'toast-clipboard', 'toast-leak', 'techscam', 'wallet',
    'form-guard', 'link-block', 'link-warn', 'link-confirm', 'popup-block', 'exfil-blocked'];
  const SNOOZE_DAYS = 90;         // "Maybe later" snooze length
  const MAX_ASKS = 2;             // "asks" (Maybe-later count) at or above this stops re-asking forever
  // Chrome Web Store review tab, and (0.14.1) the AMO reviews page now that the
  // Firefox listing exists — reviewUrl() picks one from the packaged manifest.
  const CWS_REVIEW_URL = 'https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl/reviews';
  const AMO_REVIEW_URL = 'https://addons.mozilla.org/firefox/addon/scam-phishing-blocker-scamshie/reviews/';

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // eligible ⇔ ALL of:
  //  (0.14.1: no browser gate — Firefox has an AMO listing, so it is asked under the same rules)
  //  - threatsBlocked >= 1 (a Stop-tier event)
  //  - now - installedAt >= 14 days
  //  - no "This site is fine" tap (lastFalseAlarmAt) in the last 14 days
  //  - no warn/stop surface (lastSurfaceAt) in the last 10 minutes
  //  - state === 'pending', OR (state === 'snoozed' AND now >= snoozeUntil AND asks < 2)
  // 'rated' and 'declined' are permanent — never eligible again.
  function eligible(input) {
    const o = input || {};
    if (num(o.threatsBlocked) < THREATS_THRESHOLD) return false;
    const now = typeof o.now === 'number' && Number.isFinite(o.now) ? o.now : Date.now();
    if (now - num(o.installedAt) < INSTALL_AGE_DAYS * DAY) return false;
    if (num(o.lastFalseAlarmAt) > 0 && now - num(o.lastFalseAlarmAt) < FALSE_ALARM_DAYS * DAY) return false;
    if (num(o.lastSurfaceAt) > 0 && now - num(o.lastSurfaceAt) < SURFACE_QUIET_MS) return false;
    if (o.state === 'pending') return true;
    if (o.state === 'snoozed') return now >= num(o.snoozeUntil) && num(o.asks) < MAX_ASKS;
    return false; // 'rated' | 'declined' | anything else
  }

  // Pure Chrome/Firefox signal from the *packaged* manifest object (the return
  // value of chrome.runtime.getManifest()) — deliberately NOT a runtime-globals
  // check like `typeof browser === 'undefined'`. Verified against real Chromium
  // 148 (2026): Chrome now ships its own native `browser.*` promise-API alias
  // for cross-browser compatibility, so `browser` is defined on Chrome too,
  // which would make that check false everywhere. Only the Firefox build's
  // manifest (manifest.firefox.json, copied verbatim into the packaged
  // manifest.json by scripts/build.js) carries `browser_specific_settings` —
  // Chrome's manifest.json never has it, regardless of injected globals.
  function isChromeFromManifest(manifest) {
    return !(manifest && manifest.browser_specific_settings);
  }

  // Store review URL for this build (0.14.1): AMO on Firefox, CWS on Chrome.
  function reviewUrl(manifest) {
    return isChromeFromManifest(manifest) ? CWS_REVIEW_URL : AMO_REVIEW_URL;
  }

  // Newest ts among warn/stop rows of the surface log (rows are {ts, host, kind}); 0 when none.
  function lastWarnStopAt(rows) {
    let best = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r && WARN_STOP_KINDS.indexOf(r.kind) !== -1 && num(r.ts) > best) best = num(r.ts);
    }
    return best;
  }

  // Render-gate: even an eligible profile never gets the ask beneath an
  // active warning ("please review us" under a dangerous/suspicious verdict
  // is the exact pattern the design explicitly rejects) — the eligible state
  // just waits for a popup open on a clean/unknown page instead. `level` is
  // the popup's current verdict level ('safe' | 'suspicious' | 'dangerous' |
  // 'unknown' | null/undefined for "not yet known").
  function shouldShowCard(isEligible, level) {
    return !!isEligible && level !== 'dangerous' && level !== 'suspicious';
  }

  return { DAY, INSTALL_AGE_DAYS, THREATS_THRESHOLD, SNOOZE_DAYS, MAX_ASKS, FALSE_ALARM_DAYS, SURFACE_QUIET_MS, WARN_STOP_KINDS, lastWarnStopAt, CWS_REVIEW_URL, AMO_REVIEW_URL, eligible, isChromeFromManifest, reviewUrl, shouldShowCard };
});
