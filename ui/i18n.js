// Tiny i18n applier for the extension pages (popup, options, onboarding).
// chrome.i18n.getMessage falls back to the default locale (en) per-key, so a
// partial translation still renders — missing keys show English, never blank.
(function (root) {
  'use strict';
  const api = root.browser || root.chrome;
  // Returns '' (never the raw key) when the message truly can't be resolved,
  // so callers relying on a JS-literal fallback (T(key, subs, fallback) in
  // popup.js/options.js) actually get to use it instead of key-echo, and so
  // apply() below just leaves the HTML's own English text in place.
  function t(key, subs) {
    try { const m = api.i18n.getMessage(key, subs); return m || ''; } catch (_) { return ''; }
  }
  function apply(scope) {
    const el = scope || document;
    el.querySelectorAll('[data-i18n]').forEach((n) => { const v = t(n.getAttribute('data-i18n')); if (v) n.textContent = v; });
    el.querySelectorAll('[data-i18n-ph]').forEach((n) => { const v = t(n.getAttribute('data-i18n-ph')); if (v) n.setAttribute('placeholder', v); });
    el.querySelectorAll('[data-i18n-title]').forEach((n) => { const v = t(n.getAttribute('data-i18n-title')); if (v) n.setAttribute('title', v); });
    el.querySelectorAll('[data-i18n-aria]').forEach((n) => { const v = t(n.getAttribute('data-i18n-aria')); if (v) n.setAttribute('aria-label', v); });
    // Document title + RTL direction for the whole page.
    const titleKey = document.documentElement.getAttribute('data-i18n-doctitle');
    if (titleKey) { const v = t(titleKey); if (v) document.title = v; }
    try {
      const rtl = root.SSReasons ? root.SSReasons.isRTL() : false;
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    } catch (_) {}
  }
  root.SSi18n = { t, apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());
  else apply();
})(typeof globalThis !== 'undefined' ? globalThis : self);
