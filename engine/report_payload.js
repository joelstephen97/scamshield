(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.Parry);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';
  const REPORT_MAX_BYTES = 32768;
  const LABELS = ['dangerous', 'false_positive', 'scam'];
  const KINDS = ['auto', 'user'];
  const TOKEN_CAP = 2000;

  function payloadBytes(p) { return new TextEncoder().encode(JSON.stringify(p)).length; }
  function capTokens(tokens, cap) {
    const entries = Object.entries(tokens || {});
    if (entries.length <= cap) return tokens || {};
    entries.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(entries.slice(0, cap));
  }
  function buildReportPayload(input) {
    try {
      const i = input || {};
      if (!KINDS.includes(i.kind) || !LABELS.includes(i.label)) return null;
      const u = new URL(String(i.url));
      if (!/^https?:$/.test(u.protocol)) return null;
      const host = u.hostname.toLowerCase();
      const v = i.verdict || {};
      let pageFeatures = null;
      if (i.pageFeatures && i.pageFeatures.tokens) {
        pageFeatures = { tokens: capTokens(i.pageFeatures.tokens, TOKEN_CAP), dense: Array.from(i.pageFeatures.dense || []).map(Number) };
      }
      const s = Number(v.score);
      const p = {
        v: 1, kind: i.kind, label: i.label, host, regDomain: C.registrableDomain(host),
        level: String(v.level || ''), score: Number.isFinite(s) ? s : 0,
        flags: Array.isArray(v.flags) ? v.flags.map(String).slice(0, 20) : [],
        // Coded reasons when the verdict has any; otherwise the flag names, so a
        // verdict that fired a flag without a coded reason still says why.
        reasonCodes: (Array.isArray(v.reasonCodes) && v.reasonCodes.length) ? v.reasonCodes.map(String).slice(0, 20)
          : (Array.isArray(v.flags) ? v.flags.map(String).slice(0, 20) : []),
        urlFeatures: i.urlFeatures ? Array.from(i.urlFeatures).map((x) => Number.isFinite(x) ? x : 0) : null,
        pageFeatures,
        iconMatches: (i.iconMatches || []).slice(0, 6).map((m) => ({ brand: String(m.brand), distance: Number(m.distance) })),
        detectors: (i.detectors || []).map(String).slice(0, 6),
        extVersion: String(i.extVersion || ''),
        ts: Math.floor(Number(i.now || Date.now()) / 3600000) * 3600
      };
      let cap = TOKEN_CAP;
      while (payloadBytes(p) > REPORT_MAX_BYTES && p.pageFeatures && cap > 100) { cap = Math.floor(cap / 2); p.pageFeatures.tokens = capTokens(p.pageFeatures.tokens, cap); }
      if (payloadBytes(p) > REPORT_MAX_BYTES) p.pageFeatures = null;
      if (payloadBytes(p) > REPORT_MAX_BYTES) return null;
      return p;
    } catch (_) { return null; }
  }
  return { buildReportPayload, payloadBytes, REPORT_MAX_BYTES };
});
