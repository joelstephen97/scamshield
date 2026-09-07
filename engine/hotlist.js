// engine/hotlist.js — hourly hot list (0.13.0): parse, guard, build DNR rules.
// Pure. The SW fetches hot.json and owns declarativeNetRequest; this module
// only shapes data so tests/unit/hotlist.test.js can pin every decision.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./dnr_rules') : root.SSDnr, req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSHot = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (D, C) {
  'use strict';
  // 20,000 (0.13.0 fix round 5): matches the feed's HOT_CAP. Round 3 raised
  // it to 12k so tenant hosts under shared-hosting apexes (vercel.app,
  // pages.dev, ...) fit alongside the bulk threat-intel source; round 5
  // raised it again after the bench showed the cap was still cutting the
  // hosts users actually hit. At dnr_rules CHUNK=2500 that is 8 redirect
  // rules in the HOT_BASE range.
  const MAX_DOMAINS = 20000;
  const WINDOW_MS = 48 * 3600 * 1000;
  const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

  function parseHot(json, now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (!json || typeof json !== 'object' || json.v !== 1) return null;
    if (typeof json.generatedAt !== 'number' || !Array.isArray(json.domains)) return null;
    const minNow = Math.floor(t / 60000), minCutoff = Math.floor((t - WINDOW_MS) / 60000);
    const norm = (e) => {
      if (!e || typeof e.h !== 'string') return null;
      const h = e.h.trim().toLowerCase().replace(/\.+$/, '');
      if (!HOST_RE.test(h)) return null;
      const tt = typeof e.t === 'number' ? e.t : minNow;
      if (tt < minCutoff) return null;
      return { h, s: typeof e.s === 'string' ? e.s : '', t: tt };
    };
    const domains = json.domains.map(norm).filter(Boolean).sort((a, b) => b.t - a.t).slice(0, MAX_DOMAINS);
    const paths = (Array.isArray(json.paths) ? json.paths : []).map((e) => { const n = norm(e); return n && typeof e.p === 'string' && e.p.startsWith('/') ? Object.assign(n, { p: e.p }) : null; }).filter(Boolean);
    // `removed` is informational only — the SW honours removals by
    // construction, since applyHotRules() replaces the whole HOT/PATH id
    // range from the current file's `domains`/`paths` on every run rather
    // than diffing against the previous one.
    const removed = (Array.isArray(json.removed) ? json.removed : []).filter((h) => typeof h === 'string').map((h) => h.toLowerCase());
    return { v: 1, generatedAt: json.generatedAt, ttlMinutes: typeof json.ttlMinutes === 'number' ? json.ttlMinutes : 360, domains, paths, removed };
  }

  function isStale(hot, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return !hot || (t - hot.generatedAt) > hot.ttlMinutes * 60000;
  }

  // Client-side defence in depth against a poisoned upstream (R2): nothing
  // the user trusts, no verified registry namespace, no real brand domain,
  // and nothing on SAFE_DOMAINS can ever become a hot rule, whatever the
  // file says. Counts are returned so the options page can show them.
  //
  // A host can satisfy more than one reason at once (e.g. hdfc.bank.in is
  // both a verified .bank.in namespace AND HDFC's own brand-registrable
  // domain) — each host is attributed to exactly one reason, checked in
  // this fixed priority order, so the counts always sum to the number of
  // guarded-out hosts. The structural `apex` reject runs first (it is about
  // the SHAPE of the entry, not who owns it); among the trust-based reasons
  // verified namespaces come first, because that signal (registry-vetted) is
  // the strongest of the four.
  function guardHot(hot, settings, now) {
    const t = typeof now === 'number' ? now : Date.now();
    const dropped = { apex: 0, exempt: 0, safe: 0, brand: 0, verified: 0, expired: 0 };
    if (isStale(hot, t)) { dropped.expired = (hot ? hot.domains.length + hot.paths.length : 0); return { domains: [], paths: [], dropped }; }
    const exempt = new Set(D.exemptDomains(settings || {}, t));
    const brands = new Set(C.KNOWN_BRAND_REGISTRABLES || []);
    const verified = typeof C.isVerifiedNamespace === 'function' ? C.isVerifiedNamespace : () => false;
    const platforms = new Set(C.TENANT_PLATFORMS || []);
    const suffixes = new Set(C.MULTI_LABEL_SUFFIXES || []);
    // 0.13.0 final review: a poisoned (or merely sloppy) feed entry that names
    // a whole namespace rather than a host — 'com', 'app', 'co.uk',
    // 'vercel.app', 'duckdns.org' — would install ONE redirect rule that
    // blocks every site under it. Structural, so it is checked before the
    // trust-based reasons below: these entries are malformed regardless of
    // who owns them. A real tenant under such an apex ('foo.vercel.app') is
    // still perfectly blockable; only the apex itself is refused.
    const isApex = (h) => {
      const labels = h.split('.').filter(Boolean);
      if (labels.length < 2) return true;                       // (a) 'com', 'app'
      if (platforms.has(h)) return true;                        // (b)+(d) 'vercel.app', 'duckdns.org'
      if (suffixes.has(h)) return true;                         // (c) 'co.uk'
      const parts = C.registrableParts(h);
      return h === parts.suffix;                                // (c) bare public suffix
    };
    const keep = (h) => {
      const reg = C.registrableDomain(h);
      if (isApex(h)) { dropped.apex++; return false; }
      if (exempt.has(h) || exempt.has(reg)) { dropped.exempt++; return false; }
      if (verified(h)) { dropped.verified++; return false; }
      if (brands.has(reg) || brands.has(h)) { dropped.brand++; return false; }
      if (C.isSafeHost(h)) { dropped.safe++; return false; }
      return true;
    };
    const domains = hot.domains.map((d) => d.h).filter(keep);
    const paths = hot.paths.filter((p) => keep(p.h)).map((p) => ({ h: p.h, p: p.p }));
    return { domains, paths, dropped };
  }

  function hotRules(guarded, targetUrl) {
    return [...D.buildRedirectRules(guarded.domains, targetUrl, D.HOT_BASE), ...D.buildPathRedirectRules(guarded.paths, targetUrl)];
  }
  function hotRuleIds(existing) {
    return (existing || []).filter((r) => D.inRange(r.id, D.HOT_BASE) || D.inRange(r.id, D.PATH_BASE)).map((r) => r.id);
  }
  return { MAX_DOMAINS, WINDOW_MS, parseHot, isStale, guardHot, hotRules, hotRuleIds };
});
