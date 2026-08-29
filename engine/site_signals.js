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
    labelsBelowRegistrable, hasLongLabel, shortenerHost, scoreSiteSignals
  };
});
