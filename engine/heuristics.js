(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield,
                       req ? require('./features') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, F) {
  'use strict';
  const { FEATURE_NAMES } = C;
  const clamp = (x) => Math.max(0, Math.min(1, x));

  function scoreUrl(urlString) {
    const v = F.extractUrlFeatures(urlString);
    const get = (n) => v[FEATURE_NAMES.indexOf(n)];
    const reasons = [];
    let score = 0;

    if (get('has_ip_host')) { score += 0.45; reasons.push('Uses a raw IP address instead of a domain name.'); }
    if (get('has_at_symbol')) { score += 0.35; reasons.push('URL contains an "@" that can hide the real destination.'); }
    if (get('has_punycode')) { score += 0.30; reasons.push('Domain uses punycode, often used to mimic real brands.'); }
    // IDN homograph of a known brand (0.6.0): the domain, decoded and mapped
    // through the Unicode confusables skeleton, reads as a brand name. No
    // legitimate site writes a brand with look-alike foreign characters, so
    // together with the punycode rule above this reaches "dangerous" (0.80).
    if (get('has_punycode') && F.idnHomographBrand) {
      const hb = F.idnHomographBrand(F.parseHost(urlString).host);
      if (hb) { score += 0.50; reasons.push('This domain imitates "' + hb + '" using look-alike foreign characters.'); }
    }
    if (get('brand_lookalike')) { score += 0.45; reasons.push('Domain looks like it impersonates a well-known brand.'); }
    if (get('suspicious_tld')) { score += 0.20; reasons.push('Domain uses a top-level domain frequently abused by scams.'); }
    if (!get('is_https')) { score += 0.15; reasons.push('Connection is not secure (no HTTPS).'); }
    if (get('num_subdomains') >= 3) { score += 0.15; reasons.push('Unusually many subdomains.'); }
    const tok = get('suspicious_token_count');
    if (tok >= 2) { score += Math.min(0.25, 0.08 * tok); reasons.push('URL contains multiple urgency/security keywords.'); }
    if (get('host_entropy') > 3.5 && get('host_length') > 20) { score += 0.10; reasons.push('Domain name looks randomly generated.'); }

    return { score: clamp(score), reasons };
  }

  // Canonical implementation lives in constants.js; re-exported here for API compat.
  const registrableDomain = C.registrableDomain;

  function scoreDom(signals) {
    const s = signals || {};
    const reasons = [];
    const flags = [];
    let score = 0;
    let brand; // set when impersonation is flagged, so UI can offer the real site
    const pageDomain = registrableDomain(s.pageHost);
    const displayName = (key) => C.brandDisplayName ? C.brandDisplayName(key) : key;

    if (s.hasPasswordField) {
      const AUTH = C.KNOWN_AUTH_PROVIDERS || [];
      const foreign = (s.passwordFormActions || []).some((action) => {
        try {
          const h = new URL(action, 'https://' + (s.pageHost || 'x')).hostname;
          const actionDomain = registrableDomain(h);
          if (actionDomain === pageDomain) return false;
          // Federated login: posting to a known identity provider is normal.
          if (AUTH.includes(actionDomain)) return false;
          return true;
        } catch (_) { return false; }
      });
      if (foreign) {
        score = Math.max(score, 0.9);
        flags.push('credential-form-foreign-domain');
        reasons.push('A password form on this page sends your credentials to a different site.');
      }
    }

    if ((s.hiddenIframeCount || 0) > 0) {
      score += 0.2;
      reasons.push('Page contains hidden frames that may capture input.');
    }

    const phrases = s.scamPhrases || [];
    if (phrases.length) {
      score += Math.min(0.5, 0.2 * phrases.length);
      reasons.push('Page shows classic scam/giveaway language ("' + phrases[0] + '").');
    }

    // Seed-phrase / recovery-phrase harvesting (no legit site asks for this).
    if (s.seedPhraseForm) {
      score = Math.max(score, 0.9);
      flags.push('seed-phrase-harvest');
      reasons.push('This page asks for your wallet recovery phrase — never enter it; this steals your funds.');
    }

    // Content-based brand impersonation: page *names* a brand but is not on that
    // brand's real domain, and collects a password.
    const BRAND_DOMAINS = C.BRAND_DOMAINS || {};
    const matchedBrand = C.brandNameIn([s.titleBrand, s.ogSiteName, ...(s.logoAltBrands || [])].join(' | '));
    function isOnBrand(brandKey) {
      const legit = BRAND_DOMAINS[brandKey] || [];
      const host = String(s.pageHost || '').toLowerCase();
      const parts = C.registrableParts(host);
      const tld = parts.suffix.split('.').pop();
      const ccShaped = (C.MULTI_LABEL_SUFFIXES || []).includes(parts.suffix) || tld.length === 2;
      const exactBrandCc = parts.sld === brandKey && ccShaped && !(C.SUSPICIOUS_TLDS || []).includes(tld);
      return exactBrandCc || legit.some((d) => pageDomain === d || host.endsWith('.' + d));
    }
    if (matchedBrand && s.hasPasswordField && !isOnBrand(matchedBrand)) {
      score = Math.max(score, 0.85); flags.push('brand-impersonation-content'); brand = matchedBrand;
      reasons.push('This page looks like "' + matchedBrand + '" but is not on its real website.');
    }
    // Visual (icon/logo hash) impersonation — 0.5.0. A 'logo' match (an <img>
    // logo candidate, more prone to false positives than a favicon/touch-icon)
    // only ever earns the +0.35 corroboration bump, never the 0.85 visual flag
    // reserved for icon/favicon-derived (or unknown-kind) matches.
    const icon = (s.iconMatches || []).find((m) => m && m.brand && !isOnBrand(m.brand));
    if (icon) {
      const label = displayName(icon.brand);
      if (s.hasPasswordField && icon.kind !== 'logo') {
        score = Math.max(score, 0.85); flags.push('brand-impersonation-visual'); brand = brand || icon.brand;
        reasons.push('This page uses ' + label + "'s icon but is not " + label + "'s website.");
      } else {
        score += 0.35; reasons.push('This page uses ' + label + "'s icon but is not " + label + "'s website.");
      }
    }

    return { score: Math.max(0, Math.min(1, score)), reasons, flags, brand };
  }

  return { scoreUrl, scoreDom, registrableDomain };
});
