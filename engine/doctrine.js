// engine/doctrine.js — the warning doctrine (0.15.0).
// One pure function decides what the user sees for a verdict: a full stop
// page, a banner, or nothing. Users were uninstalling because ScamShield
// interrupted on ordinary pages; the rule is now "interrupt only when
// confident, and never on a popular site on heuristics alone".
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Decisive, near-zero-FP flags: block the interaction outright.
  const STOP_FLAGS = ['feed-block', 'clickfix', 'seed-phrase-harvest', 'fake-browser-update', 'delivery-fee-scam'];
  // Flags confident enough to show a banner at "suspicious". `feed-warn` joins
  // them only once the hit was verified (`feed-warn-verified`, set by Task 6);
  // until then a plain feed-warn counts as confident (see FEED_FLAGS).
  const CONFIDENT_FLAGS = ['feed-warn-corroborated', 'brand-impersonation-content', 'brand-impersonation-visual', 'brand-impersonation-tenant', 'credential-form-foreign-domain'];
  // Feed intel still counts on popular sites: a validated list hit is not a heuristic.
  const FEED_FLAGS = ['feed-warn-verified', 'feed-warn-corroborated', 'feed-warn'];

  // Hosts where anyone can publish a page. Phishing kits live there, so a
  // popular registrable (google.com, microsoft.com…) must not shield them.
  const USER_CONTENT_HOSTS = [
    'sites.google.com', 'docs.google.com', 'drive.google.com', 'forms.gle',
    'storage.googleapis.com', 'firebasestorage.googleapis.com', 'sharepoint.com',
    'onedrive.live.com', '1drv.ms', 'dropbox.com', 'dl.dropboxusercontent.com',
    'notion.site', 'forms.office.com', 'typeform.com', 'jotform.com',
    'wixsite.com', 'canva.site', 'my.canva.site'
  ];

  function isUserContentHost(host) {
    if (typeof host !== 'string' || !host) return false;
    const h = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    return USER_CONTENT_HOSTS.some((u) => h === u || h.endsWith('.' + u));
  }

  function surfaceTier(verdict, ctx) {
    const c = ctx || {};
    if (!verdict || verdict.level === 'safe') return 'quiet';
    const flags = Array.isArray(verdict.flags) ? verdict.flags : [];
    const has = (list) => flags.some((f) => list.includes(f));

    let tier;
    if (verdict.level === 'dangerous' && has(STOP_FLAGS)) return 'stop';
    const popular = !!c.popular && !isUserContentHost(c.host);
    if (popular && !has(STOP_FLAGS) && !has(FEED_FLAGS)) return 'quiet';
    if (verdict.level === 'dangerous') tier = 'warn';
    else if (verdict.level === 'suspicious' && (has(CONFIDENT_FLAGS) || has(['feed-warn-verified']) || has(['feed-warn']))) tier = 'warn';
    else tier = 'quiet';
    // Strict mode raises a warning to a stop; it never lifts quiet.
    if (c.strictMode === true && tier === 'warn') tier = 'stop';
    return tier;
  }

  return { surfaceTier, isUserContentHost, STOP_FLAGS, CONFIDENT_FLAGS, USER_CONTENT_HOSTS };
});
