// Tiny i18n applier for the extension pages (popup, options, onboarding).
// chrome.i18n.getMessage falls back to the default locale (en) per-key, so a
// partial translation still renders — missing keys show English, never blank.
(function (root) {
  'use strict';
  const api = root.browser || root.chrome;
  function t(key, subs) {
    try { const m = api.i18n.getMessage(key, subs); return m || key; } catch (_) { return key; }
  }
  function apply(scope) {
    const el = scope || document;
    el.querySelectorAll('[data-i18n]').forEach((n) => { const v = t(n.getAttribute('data-i18n')); if (v) n.textContent = v; });
    el.querySelectorAll('[data-i18n-ph]').forEach((n) => { const v = t(n.getAttribute('data-i18n-ph')); if (v) n.setAttribute('placeholder', v); });
    el.querySelectorAll('[data-i18n-title]').forEach((n) => { const v = t(n.getAttribute('data-i18n-title')); if (v) n.setAttribute('title', v); });
    // Document title + RTL direction for the whole page.
    const titleKey = document.documentElement.getAttribute('data-i18n-doctitle');
    if (titleKey) { const v = t(titleKey); if (v) document.title = v; }
    try {
      const rtl = /^(ar|he|fa|ur)\b/i.test(api.i18n.getUILanguage ? api.i18n.getUILanguage() : '');
      if (rtl) document.documentElement.setAttribute('dir', 'rtl');
    } catch (_) {}
  }
  root.SSi18n = { t, apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());
  else apply();
})(typeof globalThis !== 'undefined' ? globalThis : self);
