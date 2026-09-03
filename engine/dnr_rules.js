// engine/dnr_rules.js — declarativeNetRequest rule builders (0.12.0).
//
// Pure: no chrome.* access, no I/O. The service worker owns the calls to
// declarativeNetRequest; this module only shapes the rules so that
// tests/unit/dnr_rules.test.js can pin the exact JSON that reaches Chrome.
//
// Three dynamic-rule ID ranges live side by side:
//   BLOCK_BASE    100000+  one `block` rule per feed urlFilter (all resource
//                          types the feed asks for: main_frame + sub_frame).
//                          Pre-0.12 behaviour, unchanged — a blocked
//                          sub-frame or asset still just fails to load.
//   REDIRECT_BASE 200000+  a handful of `redirect` rules, priority 2, that
//                          send a MAIN-FRAME navigation to any listed domain
//                          (feed + the packaged static ruleset) to
//                          blocked.html#<original url> instead of Chrome's
//                          bare ERR_BLOCKED_BY_CLIENT page. One rule carries
//                          up to CHUNK domains via `requestDomains`; the
//                          regexFilter + regexSubstitution pair is what
//                          forwards the URL (`\0` = the whole match).
//   ALLOW_BASE    300000+  `allow` rules, priority 3, for every site the user
//                          has paused or trusted, so "Visit anyway" on the
//                          block page — and the popup's pause menu — really
//                          lets the site load. Priority wins over both the
//                          dynamic block rules and the static ruleset.
//
// UMD like the rest of engine/: attaches SSDnr to globalThis for the worker
// and exports for Node.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SSDnr = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const BLOCK_BASE = 100000;
  const REDIRECT_BASE = 200000;
  const ALLOW_BASE = 300000;
  const RANGE = 100000;
  const CHUNK = 2500;          // domains per redirect rule (5,000 installed fine in Chrome 140; halved for headroom)
  const MAX_ALLOW = 1000;      // paused/trusted domains that get a network-level allow

  // '||example.com^' → 'example.com'; anything else (paths, wildcards, IPs
  // are fine — they are still hosts) → null. Lower-cased, no trailing dot.
  function domainOfFilter(urlFilter) {
    const m = /^\|\|([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)\^$/i.exec(String(urlFilter || '').trim());
    if (!m) return null;
    return m[1].toLowerCase();
  }

  function inRange(id, base) { return typeof id === 'number' && id >= base && id < base + RANGE; }

  function buildBlockRules(filters) {
    return (filters || []).map((f, i) => ({
      id: BLOCK_BASE + i, priority: 1, action: { type: 'block' },
      condition: { urlFilter: String(f), resourceTypes: ['main_frame', 'sub_frame'] }
    }));
  }

  // domains: any iterable of hostnames (duplicates and nulls tolerated).
  // targetUrl: the absolute extension URL of blocked.html.
  function buildRedirectRules(domains, targetUrl) {
    const uniq = [...new Set([...(domains || [])].filter(Boolean).map((d) => String(d).toLowerCase()))];
    const rules = [];
    for (let i = 0; i < uniq.length; i += CHUNK) {
      rules.push({
        id: REDIRECT_BASE + rules.length, priority: 2,
        action: { type: 'redirect', redirect: { regexSubstitution: targetUrl + '#\\0' } },
        condition: { regexFilter: '^https?://.*', requestDomains: uniq.slice(i, i + CHUNK), resourceTypes: ['main_frame'] }
      });
    }
    return rules;
  }

  function buildAllowRules(domains) {
    const uniq = [...new Set([...(domains || [])].filter(Boolean).map((d) => String(d).toLowerCase()))].slice(0, MAX_ALLOW);
    return uniq.map((d, i) => ({
      id: ALLOW_BASE + i, priority: 3, action: { type: 'allow' },
      condition: { urlFilter: '||' + d + '^', resourceTypes: ['main_frame', 'sub_frame'] }
    }));
  }

  // The user's current exemptions: unexpired pauses + the permanent allowlist.
  function exemptDomains(settings, now) {
    const s = settings || {}; const t = typeof now === 'number' ? now : Date.now();
    const out = [];
    for (const d of Array.isArray(s.allowlist) ? s.allowlist : []) if (typeof d === 'string' && d) out.push(d);
    const ps = (s.pausedSites && typeof s.pausedSites === 'object') ? s.pausedSites : {};
    for (const d of Object.keys(ps)) { const until = Number(ps[d]); if (Number.isFinite(until) && until > t) out.push(d); }
    return [...new Set(out.map((d) => d.toLowerCase()))];
  }

  return { BLOCK_BASE, REDIRECT_BASE, ALLOW_BASE, RANGE, CHUNK, MAX_ALLOW, domainOfFilter, inRange, buildBlockRules, buildRedirectRules, buildAllowRules, exemptDomains };
});
