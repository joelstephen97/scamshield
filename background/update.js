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

  // versionLessThan(a, b) — strict numeric dotted-version compare (0.14.1).
  // Used to gate install migrations on the PREVIOUS version. Anything that is
  // not a dotted-number string (missing, garbage) is "not less than", so a
  // migration never fires on a version we cannot read.
  function parseVersion(v) {
    if (typeof v !== 'string' || !/^\d+(\.\d+){0,3}$/.test(v)) return null;
    return v.split('.').map(Number);
  }
  function versionLessThan(a, b) {
    const x = parseVersion(a), y = parseVersion(b);
    if (!x || !y) return false;
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d !== 0) return d < 0;
    }
    return false;
  }

  // ---- Alarm hygiene + feed top-up (0.14.1) ----
  // alarms.create() with an existing name cancels and REPLACES it, restarting
  // its timer. Calling it on every SW start meant an active user's 12 h `ota`
  // alarm kept being pushed back and might never fire. ensureAlarm only
  // creates when the alarm is missing or its period changed.
  // get() is promise-based on Chrome MV3 and Firefox; the callback form is
  // handled too so a callback-only shim cannot hang or double-create.
  function getAlarm(alarms, name) {
    return new Promise((resolve) => {
      try {
        const r = alarms.get(name, resolve);
        if (r && typeof r.then === 'function') r.then(resolve, () => resolve(undefined));
      } catch (_) { resolve(undefined); }
    });
  }
  async function ensureAlarm(alarms, name, periodInMinutes) {
    const existing = await getAlarm(alarms, name);
    if (existing && existing.periodInMinutes === periodInMinutes) return 'kept';
    alarms.create(name, { periodInMinutes });
    return 'created';
  }

  // Boot-time feed top-up: SW eviction can outlast the 12 h alarm, so on boot
  // the feed refreshes if the last ATTEMPT (not success; an offline device
  // would otherwise retry on every wake) is older than this. Mirrors hot's
  // hotAttemptAt rule.
  const FEED_TOPUP_MS = 12 * 60 * 60 * 1000;
  function shouldTopUpFeed(lastAttemptAt, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const a = typeof lastAttemptAt === 'number' ? lastAttemptAt : 0;
    return t - a > FEED_TOPUP_MS;
  }

  return { MAX_DEFER_MS, RECHECK_MINUTES, FEED_TOPUP_MS, openPageCount, decide, versionLessThan, ensureAlarm, shouldTopUpFeed };
});
