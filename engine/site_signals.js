// engine/site_signals.js — structural URL warn-tier signals (0.9.0, Task B3),
// inspired by Chromium's suspicious-site-reporter extension (Apache-2.0). See
// /NOTICE for the attribution this file exists to satisfy. Reimplemented
// clean-room from the public signal descriptions only (deep subdomain
// chains, long labels, shortener/redirect hosts) — no source consulted.
// Chrome-free and Node-testable like every other engine/ module.
//
// A fourth suspicious-site-reporter signal — IDN/punycode presence — is not
// duplicated here: engine/heuristics.js's scoreUrl() has flagged
// `has_punycode` (reason "punycodeHost") since 0.3.x, so that evidence
// already exists under its own code.
//
// The redirect-chain/shortener signal (d) has no navigation-chain data to
// work from: this extension holds no webNavigation/webRequest permission
// (and never will — "no new permissions"), so a content script only ever
// sees the FINAL landing URL, never the shortener link that redirected to
// it. Rather than build new plumbing to recover that chain, this fires as
// ordinary URL evidence wherever scoreUrl() already runs on a URL BEFORE
// it's followed — which is exactly what engine/message_rules.js's
// scoreMessage() already does for every link found in SMS/WhatsApp/email
// text. A shortener link pasted into a message is judged as shortener
// evidence the moment it's extracted, with zero new wiring.
//
// gatewaySignal (0.13.0, Task 10) is the one exception on the browsed-page
// path: it still adds no new permission, but reconstructs a same-tab
// redirect from two things already visible without webNavigation — the
// Navigation Timing API's redirectCount (exposed to any page) and the tab's
// pre-navigation URL, which background/service_worker.js now tracks off a
// tabs.onUpdated callback — no `tabs` permission needed since the existing
// host_permissions (http(s)://*/*) already expose changeInfo.url. See its
// doc comment below for the full picture.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';

  const { registrableParts } = C;

  const LONG_LABEL_MIN = 22;
  const DEEP_CHAIN_MIN = 4;
  // suspicious-site-reporter's shortener/redirect-chain host set, verbatim.
  const SHORTENER_HOSTS = [
    'bit.ly', 'goo.gl', 'tinyurl.com', 'is.gd', 'ow.ly', 'tiny.cc', 'bc.vc',
    'bit.do', 'ity.im', 'lc.chat', 's2r.co', 'soo.gd'
  ];

  // (a) Labels strictly below the registrable domain — true subdomains, not
  // the SLD or suffix. Reuses registrableParts so a multi-label ccTLD suffix
  // (co.uk, com.sg, ...) is never mistaken for extra subdomain depth: under
  // "a.b.c.co.uk" this returns ["a","b"] (2 labels), not 3.
  function labelsBelowRegistrable(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const parts = registrableParts(h);
    if (!parts.suffix) return []; // IP or single label — nothing "below" it
    const labels = h.split('.').filter(Boolean);
    const domainLabelCount = parts.domain.split('.').length;
    return labels.slice(0, Math.max(0, labels.length - domainLabelCount));
  }

  // (b) Any label (anywhere in the hostname, not just subdomains — a padded
  // SLD like "paypal-account-verification-secure.com" is the same trick) at
  // or above the length floor.
  function hasLongLabel(host, max) {
    const m = max || LONG_LABEL_MIN;
    const labels = String(host || '').toLowerCase().replace(/\.+$/, '').split('.').filter(Boolean);
    return labels.some((l) => l.length >= m);
  }

  // (d) Exact-or-subdomain match against the shortener host set.
  function shortenerHost(host) {
    const h = String(host || '').toLowerCase();
    return SHORTENER_HOSTS.find((d) => h === d || h.endsWith('.' + d)) || null;
  }

  // gatewaySignal (0.13.0, Task 10) — the unlisted-gateway counterpart to the
  // hot-list redirect rules built in Tasks 2-4: a short random-looking path on
  // one registrable domain that redirects to a completely different
  // registrable domain. This extension holds no webNavigation permission (and
  // never will), so the "chain" here is reconstructed from two things a
  // content script/service worker can already see without one: the tab's
  // pre-navigation URL (background/service_worker.js's lastNavigation map,
  // sourced from tabs.onUpdated's changeInfo.url — visible without a `tabs`
  // permission because the existing host_permissions already cover it) and
  // performance.getEntriesByType('navigation') redirectCount from the
  // Navigation Timing API the landing page itself exposes. Warn-tier
  // evidence only — see the module doctrine below.
  const RANDOM_PATH_RE = /^\/[A-Za-z0-9_-]{5,12}\/?$/;
  const RANDOM_QUERY_RE = /^\/?\?[A-Za-z0-9]{5,10}$/;
  function gatewaySignal(nav) {
    const n = nav || {};
    const none = { score: 0, reasons: [] };
    if (!(n.redirectCount > 0) || typeof n.originalUrl !== 'string' || !n.landingHost) return none;
    let u;
    try { u = new URL(n.originalUrl); } catch (_) { return none; }
    const from = u.hostname.toLowerCase();
    const to = String(n.landingHost).toLowerCase();
    if (registrableParts(from).domain === registrableParts(to).domain) return none;
    if (C.isSafeHost && C.isSafeHost(from)) return none;
    if (!(RANDOM_PATH_RE.test(u.pathname) || RANDOM_QUERY_RE.test(u.pathname + (u.search || '')))) return none;
    return { score: 0.25, reasons: [{ code: 'gatewayRedirect', kind: 'link', params: [from] }] };
  }

  // Combined warn-tier evidence for one host. Pure, synchronous, additive —
  // callers (engine/heuristics.js scoreUrl) fold this into the existing URL
  // rule score exactly like any other rule below.
  function scoreSiteSignals(host) {
    const reasons = [];
    let score = 0;
    if (labelsBelowRegistrable(host).length >= DEEP_CHAIN_MIN) {
      score += 0.20;
      reasons.push({ code: 'deepSubdomainChain', kind: 'link' });
    }
    if (hasLongLabel(host)) {
      score += 0.15;
      reasons.push({ code: 'longHostLabel', kind: 'link' });
    }
    const shortener = shortenerHost(host);
    if (shortener) {
      score += 0.20;
      reasons.push({ code: 'shortenerHost', kind: 'link', params: [shortener] });
    }
    return { score: Math.max(0, Math.min(1, score)), reasons };
  }

  return {
    LONG_LABEL_MIN, DEEP_CHAIN_MIN, SHORTENER_HOSTS,
    labelsBelowRegistrable, hasLongLabel, shortenerHost, scoreSiteSignals,
    gatewaySignal
  };
});
