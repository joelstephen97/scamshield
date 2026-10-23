// engine/budget.js — per-site interruption budget (0.15.0). Pure.
// Users uninstalled over constant banners, so a site may show at most one
// warn banner per 24 h, and goes quiet for 30 days after two dismissals.
// The SW owns storage (local, unsynced `quietSites`); this module only decides.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSBudget = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const DAY_MS = 24 * 3600 * 1000;
  const QUIET_MS = 30 * DAY_MS;
  const DISMISS_LIMIT = 2;
  const MAX_ENTRIES = 500;

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const norm = (e) => ({ dismissals: num(e && e.dismissals), lastWarnAt: num(e && e.lastWarnAt), quietUntil: num(e && e.quietUntil) });

  // { allow, entry } — entry is the record to persist when allowed.
  function decideBudget(entry, now) {
    const e = norm(entry);
    if (e.quietUntil > now) return { allow: false, entry: e };
    if (e.lastWarnAt && now - e.lastWarnAt < DAY_MS) return { allow: false, entry: e };
    return { allow: true, entry: Object.assign({}, e, { lastWarnAt: now }) };
  }

  function applyDismissal(entry, now) {
    const e = norm(entry);
    e.dismissals += 1;
    if (e.dismissals >= DISMISS_LIMIT) { e.quietUntil = now + QUIET_MS; e.dismissals = 0; }
    return e;
  }

  // Keep at most MAX_ENTRIES, dropping the oldest by last activity.
  function capEntries(map, max) {
    const cap = max || MAX_ENTRIES;
    const keys = Object.keys(map || {});
    if (keys.length <= cap) return map || {};
    const act = (k) => Math.max(num(map[k].lastWarnAt), num(map[k].quietUntil) - QUIET_MS);
    keys.sort((a, b) => act(b) - act(a));
    const out = {};
    for (const k of keys.slice(0, cap)) out[k] = map[k];
    return out;
  }

  return { decideBudget, applyDismissal, capEntries, DAY_MS, QUIET_MS, DISMISS_LIMIT, MAX_ENTRIES };
});
