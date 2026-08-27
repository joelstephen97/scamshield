// ui/format.js
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSFormat = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function relTime(ts, now) {
    const t = typeof now === 'number' ? now : Date.now(); const d = Math.max(0, t - ts);
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.round(d / 60000) + ' min ago';
    if (d < 86400000) return Math.round(d / 3600000) + ' h ago';
    if (d < 2 * 86400000) return 'Yesterday';
    const dt = new Date(ts);
    if (d < 7 * 86400000) return DAYS[dt.getDay()];
    return dt.getDate() + ' ' + MONTHS[dt.getMonth()];
  }
  // Detector kinds (history rows) and reason kinds (evidence chips) share this
  // English fallback table; the localized labels live under the chip* keys.
  const LABELS = { page: 'Page', brand: 'Brand', wallet: 'Wallet', clipboard: 'Clipboard', techscam: 'Scare page', link: 'Link', shop: 'Shop', message: 'Message' };
  function detectorLabel(kind) { return LABELS[kind] || 'Page'; }
  function levelText(level) {
    return level === 'dangerous' ? 'Dangerous page' : level === 'suspicious' ? 'Suspicious page' : level === 'safe' ? 'Nothing suspicious here' : "Can't check this page";
  }
  return { relTime, detectorLabel, levelText };
});
