(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';
  const { FEATURE_NAMES, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS } = C;

  const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

  function parseHost(urlString) {
    try {
      const u = new URL(urlString);
      return { url: u, host: u.hostname.toLowerCase(), ok: true };
    } catch (_) {
      // Best-effort: strip scheme and path for non-URL strings.
      const host = String(urlString).replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
      return { url: null, host, ok: false };
    }
  }

  function shannonEntropy(s) {
    if (!s) return 0;
    const counts = {};
    for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
    let h = 0;
    for (const k in counts) {
      const p = counts[k] / s.length;
      h -= p * Math.log2(p);
    }
    return h;
  }

  // Levenshtein distance, capped for performance.
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
    return dp[m][n];
  }

  // homoglyph normalisation: 1/l/i, 0/o, 5/s, etc.
  function deglyph(s) {
    return s.replace(/[1l|]/g, 'i').replace(/0/g, 'o').replace(/5/g, 's')
            .replace(/3/g, 'e').replace(/\$/g, 's').replace(/[^a-z]/g, '');
  }

  function isBrandLookalike(host) {
    const labels = host.split('.');
    const sld = labels.length >= 2 ? labels[labels.length - 2] : host;
    // exact match to a real brand SLD is NOT a lookalike
    if (POPULAR_BRANDS.includes(sld)) return 0;
    const candidates = [sld, deglyph(sld), ...labels.map(deglyph)];
    for (const brand of POPULAR_BRANDS) {
      const db = deglyph(brand);                                // deglyph brand too (symmetric)
      for (const cand of candidates) {
        if (cand === db && sld !== brand) return 1;                        // homoglyph exact
        if (db.length >= 5 && cand.includes(db) && sld !== brand) return 1; // embedded brand (paypalsecure); length gate avoids 'wise' in 'otherwise'
        if (levenshtein(cand, db) === 1) return 1;                          // typosquat
      }
    }
    return 0;
  }

  function extractUrlFeatures(urlString) {
    const s = String(urlString || '');
    const { url, host } = parseHost(s);
    const path = url ? url.pathname : (s.split(/[?#]/)[0].replace(/^[a-z]+:\/\/[^/]*/i, '') || '');
    const digitsHost = (host.match(/\d/g) || []).length;
    const lower = s.toLowerCase();
    const f = {
      url_length: s.length,
      host_length: host.length,
      path_length: path.length,
      num_dots_host: (host.match(/\./g) || []).length,
      num_subdomains: IP_RE.test(host) ? 0 : Math.max(0, host.split('.').length - 2),
      num_hyphens_host: (host.match(/-/g) || []).length,
      num_digits_host: digitsHost,
      digit_ratio_host: host.length ? digitsHost / host.length : 0,
      has_at_symbol: s.includes('@') ? 1 : 0,
      has_ip_host: IP_RE.test(host) ? 1 : 0,
      has_punycode: host.includes('xn--') ? 1 : 0,
      is_https: /^https:/i.test(s) ? 1 : 0,
      num_query_params: url ? [...url.searchParams.keys()].length : 0,
      suspicious_tld: SUSPICIOUS_TLDS.includes(host.split('.').pop()) ? 1 : 0,
      suspicious_token_count: SUSPICIOUS_TOKENS.filter((t) => lower.includes(t)).length,
      host_entropy: Number(shannonEntropy(host).toFixed(4)),
      brand_lookalike: isBrandLookalike(host)
    };
    return Float32Array.from(FEATURE_NAMES.map((name) => f[name]));
  }

  return { extractUrlFeatures, parseHost, shannonEntropy, levenshtein, deglyph, isBrandLookalike };
});
