// engine/doctrine.js — the warning doctrine (0.15.0).
// One pure function decides what the user sees for a verdict: a full stop
// page, a banner, or nothing. Users were uninstalling because ScamShield
// interrupted on ordinary pages; the rule is now "interrupt only when
// confident, and never on a popular site on heuristics alone".
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';

  // Decisive, near-zero-FP flags: block the interaction outright.
  const STOP_FLAGS = ['feed-block', 'clickfix', 'seed-phrase-harvest', 'fake-browser-update', 'delivery-fee-scam'];
  // Flags confident enough to show a banner at "suspicious". A feed "warn" hit counts only once
  // it was verified against the exact shard (`feed-warn-verified`, set by content_script.js);
  // an unverified hit carries `feed-warn-unverified`, which is in no list here, so it stays
  // quiet unless other evidence makes the verdict dangerous (0.15.0).
  const CONFIDENT_FLAGS = ['feed-warn-verified', 'feed-warn-corroborated', 'brand-impersonation-content', 'brand-impersonation-visual', 'brand-impersonation-tenant', 'credential-form-foreign-domain',
    // (0.15.0) added by credentialFlags(): corroborated, non-popular evidence + a credential field.
    'nrd-credential', 'brand-lookalike-credential'];
  // Feed intel still counts on popular sites: a validated list hit is not a heuristic.
  const FEED_FLAGS = ['feed-warn-verified', 'feed-warn-corroborated'];

  // (0.15.0) USER_CONTENT_HOSTS / isUserContentHost live in engine/constants.js (single source of
  // truth; isSafeHost needs them and constants.js loads first). Re-exported unchanged below.
  const { USER_CONTENT_HOSTS, isUserContentHost } = C;

  // Popular guard input: user-content hosts of popular registrables are never shielded.
  function effectivePopular(popular, host) { return !!popular && !isUserContentHost(host); }

  // URL-rule reason codes that mean "the host imitates a brand". brandFuzzyMatch
  // counts only at grade strong/strongest (the weak grade is too noisy to warn on).
  const LOOKALIKE_CODES = ['brandLookalike', 'brandForeignSuffix', 'idnHomograph'];
  function isLookalikeReason(r) {
    if (!r) return false;
    if (LOOKALIKE_CODES.includes(r.code)) return true;
    return r.code === 'brandFuzzyMatch' && (r.grade === 'strong' || r.grade === 'strongest');
  }

  // Confident flags that need a credential field on a non-popular host (0.15.0):
  //   nrd-credential: new-domain evidence + password field
  //   brand-lookalike-credential: brand-imitating host + password field
  // in = { verdictFlags, urlReasons, hasPasswordField, popular, host }
  function credentialFlags(i) {
    const out = [];
    if (!i || !i.hasPasswordField || effectivePopular(i.popular, i.host)) return out;
    if ((i.verdictFlags || []).includes('new-domain')) out.push('nrd-credential');
    if ((i.urlReasons || []).some(isLookalikeReason)) out.push('brand-lookalike-credential');
    return out;
  }

  function surfaceTier(verdict, ctx) {
    const c = ctx || {};
    if (!verdict || verdict.level === 'safe') return 'quiet';
    const flags = Array.isArray(verdict.flags) ? verdict.flags : [];
    const has = (list) => flags.some((f) => list.includes(f));

    let tier;
    if (verdict.level === 'dangerous' && has(STOP_FLAGS)) return 'stop';
    const popular = effectivePopular(c.popular, c.host);
    if (popular && !has(STOP_FLAGS) && !has(FEED_FLAGS)) return 'quiet';
    if (verdict.level === 'dangerous') tier = 'warn';
    else if (verdict.level === 'suspicious' && has(CONFIDENT_FLAGS)) tier = 'warn';
    else tier = 'quiet';
    // Strict mode raises a warning to a stop; it never lifts quiet.
    if (c.strictMode === true && tier === 'warn') tier = 'stop';
    return tier;
  }

  return { surfaceTier, isUserContentHost, effectivePopular, credentialFlags, isLookalikeReason, STOP_FLAGS, CONFIDENT_FLAGS, USER_CONTENT_HOSTS };
});
