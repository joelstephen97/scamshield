// Tiny i18n applier for the extension pages (popup, options, onboarding).
// chrome.i18n.getMessage falls back to the default locale (en) per-key, so a
// partial translation still renders — missing keys show English, never blank.
//
// Language override (0.7.0): when the user has picked a language in settings
// (`uiLang` ≠ 'auto'), this page loads that locale's packaged messages.json
// itself — extension pages may fetch their own files, so no new permission and
// no web_accessible_resource is involved — and installs it on SSReasons, which
// is the shared lookup every localized string on the page (and every engine
// reason) already goes through. The fetch is asynchronous, so the page renders
// once in the browser language and re-applies when the dictionary lands;
// `SSi18n.ready` lets a page defer the strings it builds in JavaScript instead
// of visibly re-writing them.
(function (root) {
  'use strict';
  const api = root.browser || root.chrome;
  // Looked up on every use, never captured at evaluation time: binding it to a
  // const here would silently and permanently disable the override if this file
  // were ever loaded before ui/reasons.js, with no error to notice.
  const reasons = () => root.SSReasons;
  // Returns '' (never the raw key) when the message truly can't be resolved,
  // so callers relying on a JS-literal fallback (T(key, subs, fallback) in
  // popup.js/options.js) actually get to use it instead of key-echo, and so
  // apply() below just leaves the HTML's own English text in place.
  function t(key, subs) {
    try { const R = reasons(); if (R && R.tOverride) { const o = R.tOverride(key, subs); if (o) return o; } } catch (_) {}
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
      // isRTL() with no argument follows the override when one is installed,
      // so the page flips direction with the chosen language, not the browser's.
      const R = reasons();
      const rtl = R ? R.isRTL() : false;
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    } catch (_) {}
  }

  // Resolves to the language actually installed ('' when following the
  // browser), once the override decision has been made. Never rejects: a
  // missing/unreadable locale file degrades to the browser language rather
  // than leaving the page waiting.
  const ready = (async () => {
    const R = reasons();
    if (!R || !R.messagesToDict || !R.LOCALES) return '';
    let lang = '';
    try {
      // The settings object is read straight from storage rather than through
      // the service worker: it saves a round trip on every page open, and the
      // worker may still be booting when the popup paints.
      const cur = await api.storage.local.get('settings');
      lang = (cur && cur.settings && cur.settings.uiLang) || '';
    } catch (_) { return ''; }
    if (!lang || lang === 'auto' || R.LOCALES.indexOf(lang) === -1) return '';
    try {
      const res = await fetch(api.runtime.getURL('_locales/' + lang + '/messages.json'));
      R.setOverride(lang, R.messagesToDict(await res.json()));
    } catch (_) { return ''; }
    try { apply(); } catch (_) { /* the dictionary is installed either way */ }
    return lang;
  })();

  root.SSi18n = { t, apply, ready };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());
  else apply();
})(typeof globalThis !== 'undefined' ? globalThis : self);
