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
    if (get('brand_lookalike')) { score += 0.45; reasons.push('Domain looks like it impersonates a well-known brand.'); }
    if (get('suspicious_tld')) { score += 0.20; reasons.push('Domain uses a top-level domain frequently abused by scams.'); }
    if (!get('is_https')) { score += 0.15; reasons.push('Connection is not secure (no HTTPS).'); }
    if (get('num_subdomains') >= 3) { score += 0.15; reasons.push('Unusually many subdomains.'); }
    const tok = get('suspicious_token_count');
    if (tok >= 2) { score += Math.min(0.25, 0.08 * tok); reasons.push('URL contains multiple urgency/security keywords.'); }
    if (get('host_entropy') > 3.5 && get('host_length') > 20) { score += 0.10; reasons.push('Domain name looks randomly generated.'); }

    return { score: clamp(score), reasons };
  }

  function registrableDomain(host) {
    // Approximate eTLD+1: last two labels. Good enough for "foreign form" checks.
    const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
    return parts.slice(-2).join('.');
  }

  function scoreDom(signals) {
    const s = signals || {};
    const reasons = [];
    const flags = [];
    let score = 0;
    const pageDomain = registrableDomain(s.pageHost);

    if (s.hasPasswordField) {
      const foreign = (s.passwordFormActions || []).some((action) => {
        try {
          const h = new URL(action, 'https://' + (s.pageHost || 'x')).hostname;
          return registrableDomain(h) !== pageDomain;
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

    return { score: Math.max(0, Math.min(1, score)), reasons, flags };
  }

  return { scoreUrl, scoreDom, registrableDomain };
});
