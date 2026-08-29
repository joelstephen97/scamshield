// engine/trust.js — time-boxed per-site trust (pure).
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  function pauseUntil(choice, now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (choice === 'always') return null;
    if (choice === 'today') { const d = new Date(t); d.setHours(24, 0, 0, 0); return d.getTime(); }
    return t + 3600000; // '1h' and anything unknown
  }
  function isPaused(pausedSites, domain, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const until = pausedSites && pausedSites[domain];
    return typeof until === 'number' && until > t;
  }
  function prunePaused(pausedSites, now) {
    const t = typeof now === 'number' ? now : Date.now(); const out = {};
    for (const k in (pausedSites || {})) if (typeof pausedSites[k] === 'number' && pausedSites[k] > t) out[k] = pausedSites[k];
    return out;
  }
  return { pauseUntil, isPaused, prunePaused };
});
