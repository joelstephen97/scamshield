// ui/theme.js — tri-state theme for extension pages (auto/light/dark).
(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  function applyTheme(t) {
    const el = document.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
  }
  globalThis.SSTheme = { applyTheme };
  try { api.runtime.sendMessage({ type: 'getSettings' }, (s) => applyTheme(s && s.theme)); } catch (_) {}
  try { api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) applyTheme(ch.settings.newValue && ch.settings.newValue.theme); }); } catch (_) {}
})();
