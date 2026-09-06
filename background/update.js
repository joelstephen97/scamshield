// background/update.js — when is it safe to apply a pending store update? (pure)
//
// Chrome and Firefox download a new store version in the background and then
// wait for the extension to be "idle" before swapping it in — in practice the
// next browser restart, which for many users is days away. runtime.reload()
// applies a downloaded update immediately, but it also tears down every open
// extension page (popup, settings, the block page) and orphans any in-flight
// storage write. This module decides whether reloading right now is
// acceptable; the service worker owns the timers and the actual reload.
//
// Nothing here touches chrome.* — state comes in, a decision goes out — so it
// is unit-testable under plain `node --test`. UMD like the engine modules.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSUpdate = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // After this long the reload happens even if a page is open or work is in
  // flight. A popup left open forever would otherwise pin a stale, possibly
  // less protective, version; the browser itself would do the same swap on
  // its next idle window anyway.
  const MAX_DEFER_MS = 30 * 60 * 1000;
  // How often the service worker re-checks while deferring (alarm period).
  // Chrome's MV3 floor for repeating alarms is 30 s; one minute is plenty.
  const RECHECK_MINUTES = 1;

  // runtime.getContexts() reports the service worker itself; only pages the
  // user can be looking at count as "busy". Firefox's extension.getViews()
  // fallback returns Window objects (no contextType) — any of those is a page.
  function openPageCount(contexts) {
    if (!Array.isArray(contexts)) return 0;
    let n = 0;
    for (const c of contexts) {
      if (!c) continue;
      if (typeof c.contextType === 'string') { if (c.contextType !== 'BACKGROUND') n++; }
      else n++;
    }
    return n;
  }

  /**
   * decide({ contexts, busy, pendingSince, now }) -> { apply, reason }
   *   contexts     — runtime.getContexts() / extension.getViews() result (or [])
   *   busy         — number of in-flight feed/OTA/report jobs in the SW
   *   pendingSince — ms epoch when onUpdateAvailable first fired
   *   now          — ms epoch
   */
  function decide(state) {
    const s = state || {};
    const now = typeof s.now === 'number' ? s.now : Date.now();
    const since = typeof s.pendingSince === 'number' ? s.pendingSince : now;
    if (now - since >= MAX_DEFER_MS) return { apply: true, reason: 'max-defer' };
    const pages = openPageCount(s.contexts);
    if (pages > 0) return { apply: false, reason: 'pages-open' };
    if ((s.busy | 0) > 0) return { apply: false, reason: 'busy' };
    return { apply: true, reason: 'idle' };
  }

  return { MAX_DEFER_MS, RECHECK_MINUTES, openPageCount, decide };
});
