// engine/surface_log.js — local log of in-page surfaces shown (0.15.0). Pure.
// False alarms were invisible: hidden blocks, toasts and SERP dots were never
// logged. The SW owns storage (local, unsynced `surfaceLog`, separate from the
// threat `history`); this module only validates, caps and formats.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSSurfaceLog = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  const CAP = 300;
  const DIAG_ROWS = 100;
  const KINDS = ['banner', 'interstitial', 'toast-clipboard', 'toast-leak', 'toast-notify', 'techscam',
    'hidden-blocks', 'serp-dot', 'wallet', 'form-guard', 'link-block', 'link-warn', 'link-confirm'];

  // Newest first, capped. Returns the new list, or the old one when the row is invalid.
  function appendRow(list, row, now) {
    const cur = Array.isArray(list) ? list : [];
    if (!row || KINDS.indexOf(row.kind) === -1) return cur;
    const host = typeof row.host === 'string' ? row.host.toLowerCase().slice(0, 253) : '';
    if (!host || /[\/\s?#]/.test(host)) return cur; // hostnames only, never a URL
    return [{ ts: typeof now === 'number' ? now : Date.now(), host, kind: row.kind }].concat(cur).slice(0, CAP);
  }

  // Plain-text support dump: version, boolean toggles, last 100 {time, host, kind}.
  // Deliberately omits every string/array/object setting (allowlist, blocklist, urls, lang).
  function formatDiagnostics(input) {
    const i = input || {};
    const lines = ['ScamShield diagnostics', 'Version: ' + (typeof i.version === 'string' ? i.version : 'unknown'), 'Settings:'];
    const s = i.settings && typeof i.settings === 'object' ? i.settings : {};
    for (const k of Object.keys(s).sort()) if (typeof s[k] === 'boolean') lines.push('  ' + k + ': ' + s[k]);
    const rows = (Array.isArray(i.rows) ? i.rows : []).slice(0, DIAG_ROWS);
    lines.push('Surfaces shown (newest first, ' + rows.length + '):');
    for (const r of rows) {
      if (!r || typeof r.ts !== 'number' || !isFinite(r.ts)) continue;
      lines.push(new Date(r.ts).toISOString() + ' ' + String(r.host || '') + ' ' + String(r.kind || ''));
    }
    return lines.join('\n');
  }
  return { appendRow, formatDiagnostics, CAP, DIAG_ROWS, KINDS };
});
