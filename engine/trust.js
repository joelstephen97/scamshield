// engine/trust.js — time-boxed per-site trust (pure).
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  function pauseUntil(choice, now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (choice === 'always') return null;
    // '1d' is a fixed 24h pause from the moment of the click, not "until local
    // midnight" — the category convention (Ghostery 10's 1h/1d/Always pause)
    // means exactly one day of quiet, however late in the day it's picked.
    if (choice === '1d') return t + 86400000;
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
