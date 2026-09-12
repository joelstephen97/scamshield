(function (root, factory) { const mod = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = mod; root.ScamShield = Object.assign(root.ScamShield || {}, mod); })(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  // Per-site, per-warning-kind mutes (0.14.0). Pure; storage shape:
  // { [registrableDomain]: { [kind]: { via, at } } }. Page verdicts are not
  // muted per kind — they use pausedSites/allowlist (engine/trust.js).
  const WARNING_KINDS = ['clipboard', 'leak', 'notify', 'credpost'];
  const MAX_DOMAINS = 2000;
  const norm = (d) => (typeof d === 'string' ? d.trim().toLowerCase() : '');
  function isMuted(muted, domain, kind) { const d = norm(domain); return !!(muted && d && WARNING_KINDS.includes(kind) && muted[d] && muted[d][kind]); }
  function withMute(muted, domain, kind, via, now) {
    const d = norm(domain); if (!d || !WARNING_KINDS.includes(kind)) return Object.assign({}, muted || {});
    const out = Object.assign({}, muted || {}); out[d] = Object.assign({}, out[d] || {}, { [kind]: { via: typeof via === 'string' && via ? via : 'unknown', at: typeof now === 'number' ? now : Date.now() } }); return out;
  }
  function withoutMute(muted, domain, kind) {
    const d = norm(domain); const out = Object.assign({}, muted || {}); if (!out[d]) return out;
    const rest = Object.assign({}, out[d]); delete rest[kind]; if (Object.keys(rest).length) out[d] = rest; else delete out[d]; return out;
  }
  function sanitizeMuted(v) {
    const out = {}; if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const [d, kinds] of Object.entries(v)) {
      if (Object.keys(out).length >= MAX_DOMAINS) break;
      if (typeof d !== 'string' || !kinds || typeof kinds !== 'object') continue;
      const clean = {};
      for (const k of WARNING_KINDS) { const m = kinds[k]; if (m && typeof m === 'object') clean[k] = { via: typeof m.via === 'string' ? m.via : 'unknown', at: Number.isFinite(m.at) ? m.at : 0 }; }
      if (Object.keys(clean).length) out[d.toLowerCase()] = clean;
    }
    return out;
  }
  function listMuted(muted) {
    const rows = []; for (const [domain, kinds] of Object.entries(muted || {})) for (const kind of WARNING_KINDS) if (kinds && kinds[kind]) rows.push({ domain, kind, via: kinds[kind].via, at: kinds[kind].at });
    return rows.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  return { WARNING_KINDS, isMuted, withMute, withoutMute, sanitizeMuted, listMuted };
});
