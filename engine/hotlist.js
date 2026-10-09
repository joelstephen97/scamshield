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
  // 0.14.1 stale-while-revalidate: a list past its ttlMinutes keeps being
  // applied (a feed outage must not tear down every HOT/PATH rule) until this
  // hard cap, measured from generatedAt. Beyond it the list is dropped.
  const MAX_STALE_MS = 48 * 3600 * 1000;
  // 0.14.1 client-side kill switch (assessHot): a list whose guard had to drop
  // more than this many safe/brand/verified hosts, or that grew past this
  // multiple of the previous list, is treated as poisoned and not applied.
  const MAX_TRUST_DROPPED = 25;
  const MAX_GROWTH_FACTOR = 3;
  // Growth is a SOFT check (fix round 1): the baseline is floored so a small
  // list after a source outage cannot freeze updates, and after this many
  // consecutive growth rejections the list is accepted anyway (the hard
  // trusted-hosts check still applies).
  const GROWTH_FLOOR = 2000;
  const MAX_GROWTH_REJECTS = 3;
  const HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

  const BRANDS = new Set(C.KNOWN_BRAND_REGISTRABLES || []);
  const verifiedNs = typeof C.isVerifiedNamespace === 'function' ? C.isVerifiedNamespace : () => false;
  const isTenantHost = (h) => (C.TENANT_PLATFORMS || []).some((p) => h.endsWith('.' + p));

  // 0.14.1 final review: the one definition of "a host we must never block".
  // Only an entry that IS a safe/brand registrable (or its www. form), or a
  // verified registry namespace, is protected. A strict subdomain of a
  // tenant-platform apex or of a brand/safe registrable (evil.github.io,
  // x.sharepoint.com, accounts.google.com) is exactly where phishing kits
  // live, so it is not. Shared by the kill switch (assessHot) and the OTA
  // filter guard.
  function isProtectedHost(h) {
    if (verifiedNs(h)) return true;
    const bare = h.replace(/^www\./, '');
    if (isTenantHost(bare) || C.registrableDomain(bare) !== bare) return false;
    return BRANDS.has(bare) || C.isSafeHost(bare);
  }

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

  // Past the hard cap (0.14.1): max(ttl, MAX_STALE_MS) after generatedAt.
  function isExpired(hot, now) {
    const t = typeof now === 'number' ? now : Date.now();
    return !hot || (t - hot.generatedAt) > Math.max(hot.ttlMinutes * 60000, MAX_STALE_MS);
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
    const dropped = { apex: 0, exempt: 0, safe: 0, brand: 0, verified: 0, expired: 0, aged: 0 };
    if (isExpired(hot, t)) { dropped.expired = (hot ? hot.domains.length + hot.paths.length : 0); return { domains: [], paths: [], dropped }; }
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
    // 0.14.1: a user exemption covers the host it names and that host's
    // subdomains — and nothing wider. Walking the label suffixes (instead of
    // only checking the registrable domain) is what keeps a trust on
    // 'x.pages.dev' from shielding 'y.pages.dev', and a legacy bare tenant
    // apex entry ('pages.dev') from shielding any tenant at all.
    const isExempt = (h, reg) => {
      if (exempt.has(reg) && !D.isTenantApex(reg)) return true;
      const labels = h.split('.');
      for (let i = 0; i < labels.length - 1; i++) {
        const cand = labels.slice(i).join('.');
        if (exempt.has(cand) && !D.isTenantApex(cand)) return true;
      }
      return false;
    };
    const keep = (h) => {
      const reg = C.registrableDomain(h);
      if (isApex(h)) { dropped.apex++; return false; }
      if (isExempt(h, reg)) { dropped.exempt++; return false; }
      if (verified(h)) { dropped.verified++; return false; }
      // 0.14.1 final review: github.io / gitlab.io are brand/safe registrables
      // AND tenant platforms. Their strict subdomains are phishing tenants and
      // stay in the hot rules; the apex (dropped above as `apex`) and its www.
      // form are still dropped here.
      const bare = h.replace(/^www\./, '');
      if (isTenantHost(h) && !platforms.has(bare) && !isProtectedHost(h)) return true;
      if (brands.has(reg) || brands.has(h)) { dropped.brand++; return false; }
      if (C.isSafeHost(h)) { dropped.safe++; return false; }
      return true;
    };
    // 0.14.1: parseHot only ages entries against fetch time; a list kept past
    // its TTL must also shed entries that have since left the 48 h window.
    const minCutoff = Math.floor((t - WINDOW_MS) / 60000);
    const fresh = (e) => { if (typeof e.t === 'number' && e.t < minCutoff) { dropped.aged++; return false; } return true; };
    const domains = hot.domains.filter(fresh).map((d) => d.h).filter(keep);
    const paths = hot.paths.filter(fresh).filter((p) => keep(p.h)).map((p) => ({ h: p.h, p: p.p }));
    return { domains, paths, dropped };
  }

  // 0.14.1 kill switch. Pure verdict on a freshly parsed list BEFORE it
  // replaces anything. `trusted` is counted from the parsed list itself with
  // isProtectedHost (a feed that names google.com 30 times is poisoned), NOT
  // from guardHot's drops: guardHot keeps tenant phishing on github.io, and
  // its drop counters say nothing about how many protected hosts the feed
  // named. `_guardResult` is unused (kept for the SW call shape); `prevCount`
  // is the domain count of the list currently applied. The list-size cap is
  // enforced by parseHot (MAX_DOMAINS), so no size check is needed here.
  function assessHot(parsed, _guardResult, prevCount, growthRejects) {
    const domains = parsed && parsed.domains ? parsed.domains : [];
    const n = domains.length;
    const trusted = domains.filter((d) => d && typeof d.h === 'string' && isProtectedHost(d.h)).length;
    if (trusted > MAX_TRUST_DROPPED) return { ok: false, reason: 'trusted-hosts' };
    if (prevCount > 0 && n > Math.max(prevCount, GROWTH_FLOOR) * MAX_GROWTH_FACTOR && !((growthRejects || 0) >= MAX_GROWTH_REJECTS)) return { ok: false, reason: 'growth' };
    return { ok: true, reason: '' };
  }

  // 0.14.1: the OTA filter list gets the same trust check as the hot list
  // (verified namespace / known brand / SAFE_DOMAINS) before it becomes block
  // + redirect rules. Filters that are not a plain `||host^` are kept as-is.
  function guardOtaFilters(filters) {
    const kept = []; let dropped = 0;
    for (const f of filters || []) {
      const h = D.domainOfFilter(f);
      if (h && isProtectedHost(h)) { dropped++; continue; }
      kept.push(f);
    }
    return { kept, dropped };
  }

  function hotRules(guarded, targetUrl) {
    return [...D.buildRedirectRules(guarded.domains, targetUrl, D.HOT_BASE), ...D.buildPathRedirectRules(guarded.paths, targetUrl)];
  }
  function hotRuleIds(existing) {
    return (existing || []).filter((r) => D.inRange(r.id, D.HOT_BASE) || D.inRange(r.id, D.PATH_BASE)).map((r) => r.id);
  }
  return { MAX_DOMAINS, WINDOW_MS, MAX_STALE_MS, MAX_TRUST_DROPPED, MAX_GROWTH_FACTOR, GROWTH_FLOOR, MAX_GROWTH_REJECTS, parseHot, isStale, isExpired, guardHot, assessHot, isProtectedHost, guardOtaFilters, hotRules, hotRuleIds };
});
