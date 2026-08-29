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

  // Minimal RFC 3492 punycode decoder (decode-only). Hostnames reach us in
  // their xn-- form; decoding lets the confusables skeleton see the actual
  // Cyrillic/Greek characters an IDN homograph is built from.
  function punyDecode(input) {
    const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700;
    let n = 128, bias = 72, i = 0;
    const output = [];
    const basic = input.lastIndexOf('-');
    for (let j = 0; j < basic; j++) output.push(input.charCodeAt(j));
    let index = basic > 0 ? basic + 1 : 0;
    while (index < input.length) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (index >= input.length) return null;
        const c = input.charCodeAt(index++);
        const digit = (c >= 48 && c <= 57) ? c - 22
          : (c >= 65 && c <= 90) ? c - 65
          : (c >= 97 && c <= 122) ? c - 97
          : base;
        if (digit >= base || digit > Math.floor((2147483647 - i) / w)) return null;
        i += digit * w;
        const t = k <= bias ? tmin : (k >= bias + tmax ? tmax : k - bias);
        if (digit < t) break;
        w *= base - t;
      }
      const out = output.length + 1;
      let delta = i - oldi;
      delta = oldi === 0 ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / out);
      let k2 = 0;
      for (; delta > ((base - tmin) * tmax) >> 1; k2 += base) delta = Math.floor(delta / (base - tmin));
      bias = Math.floor(k2 + ((base - tmin + 1) * delta) / (delta + skew));
      n += Math.floor(i / out);
      i %= out;
      output.splice(i, 0, n);
      i++;
    }
    try { return String.fromCodePoint.apply(String, output); } catch (_) { return null; }
  }

  function decodeLabel(label) {
    if (!label.startsWith('xn--')) return label;
    const d = punyDecode(label.slice(4));
    return d != null ? d : label;
  }

  // Unicode confusables → Latin skeleton (the common attack subset of the
  // Unicode confusables table: Cyrillic, Greek and a few fullwidth/math forms).
  // Mirrors the approach Chromium documents for its local lookalike checks.
  const CONFUSABLES = {
    'а': 'a', 'ә': 'a', 'ɑ': 'a', 'α': 'a', 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a',
    'в': 'b', 'ь': 'b', 'ъ': 'b', 'б': 'b',
    'с': 'c', 'ϲ': 'c', 'ç': 'c', 'ć': 'c',
    'ԁ': 'd', 'ɗ': 'd',
    'е': 'e', 'ё': 'e', 'є': 'e', 'ε': 'e', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e',
    'ɡ': 'g', 'ġ': 'g',
    'һ': 'h', 'ĥ': 'h',
    'і': 'i', 'ı': 'i', 'ɩ': 'i', 'ι': 'i', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ј': 'j',
    'к': 'k', 'κ': 'k', 'ĸ': 'k',
    'ӏ': 'l', 'ⅼ': 'l', 'ℓ': 'l', 'ł': 'l',
    'м': 'm', 'ṃ': 'm',
    'п': 'n', 'ո': 'n', 'ñ': 'n', 'ń': 'n', 'η': 'n',
    'о': 'o', 'ο': 'o', 'ө': 'o', 'σ': 'o', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ø': 'o',
    'р': 'p', 'ρ': 'p',
    'ԛ': 'q',
    'г': 'r', 'ŕ': 'r',
    'ѕ': 's', 'ś': 's', 'ş': 's',
    'т': 't', 'τ': 't', 'ţ': 't',
    'υ': 'u', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ц': 'u', 'ս': 'u',
    'ν': 'v', 'ѵ': 'v',
    'ԝ': 'w', 'ѡ': 'w', 'ω': 'w',
    'х': 'x', 'χ': 'x', '×': 'x',
    'у': 'y', 'ү': 'y', 'γ': 'y', 'ý': 'y', 'ÿ': 'y',
    'ż': 'z', 'ź': 'z', 'ʐ': 'z'
  };

  // Confusables skeleton: decode punycode elsewhere, then map each character
  // to its Latin look-alike and run the ASCII deglyph. 'аррӏе' → 'apple'.
  function skeleton(s) {
    let out = '';
    for (const ch of String(s).toLowerCase()) out += (CONFUSABLES[ch] || ch);
    return deglyph(out);
  }

  function isBrandLookalike(host) {
    const parts = C.registrableParts(host);
    if (!parts.suffix) return 0; // IP or single label — no SLD to judge
    // A registrable domain a brand actually controls is never a lookalike
    // (login.microsoftonline.com, accounts.google.com, media-amazon.com, ...).
    if (C.KNOWN_BRAND_REGISTRABLES.includes(parts.domain)) return 0;
    const sld = parts.sld;
    // Exact brand SLD: trusted on ordinary TLDs (amazon.ae, paypal.co.uk —
    // regional storefronts), but a brand name registered on a free/high-abuse
    // TLD (amazon.tk) is a classic phish.
    if (POPULAR_BRANDS.includes(sld)) {
      return SUSPICIOUS_TLDS.includes(parts.suffix.split('.').pop()) ? 1 : 0;
    }
    const candidates = [sld, deglyph(sld)];
    const labels = host.toLowerCase().split('.').filter(Boolean);
    const domainLabelCount = parts.domain.split('.').length;
    const subLabels = labels.slice(0, Math.max(0, labels.length - domainLabelCount));
    for (const brand of POPULAR_BRANDS) {
      const db = deglyph(brand);                                // deglyph brand too (symmetric)
      for (const cand of candidates) {
        if (cand === db) return 1;                                // homoglyph exact (amaz0n)
        if (db.length >= 5 && cand.includes(db)) return 1;        // embedded brand (paypalsecure); length gate avoids 'wise' in 'otherwise'
        if (levenshtein(cand, db) === 1) return 1;                // typosquat
      }
      for (const lab of subLabels) {                              // brand hidden in a subdomain
        if (db.length >= 5 && deglyph(lab).includes(db)) return 1; // (secure-paypal.com-verify.tk)
      }
    }
    return 0;
  }

  // IDN homograph attribution (0.6.0). Deliberately SEPARATE from the
  // brand_lookalike model feature above: that feature's semantics are frozen
  // to what the URL model was trained on (and parity-locked against the
  // Python extractor), so the confusables/punycode upgrade lives here as a
  // hand rule input instead. Returns the imitated brand name, or null.
  function idnHomographBrand(host) {
    const labels = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (!labels.some((l) => l.startsWith('xn--'))) return null;
    const parts = C.registrableParts(host);
    if (C.KNOWN_BRAND_REGISTRABLES.includes(parts.domain)) return null;
    for (const lab of labels) {
      if (!lab.startsWith('xn--')) continue;
      const decoded = decodeLabel(lab);
      if (decoded === lab) continue;                 // decode failed
      const sk = skeleton(decoded);
      if (!sk) continue;
      for (const brand of POPULAR_BRANDS) {
        const db = deglyph(brand);
        // exact homograph (аррӏе → apple) or one confusable typo away, or the
        // brand embedded in a longer decoded label (secure-аpple-login)
        if (sk === db || levenshtein(sk, db) === 1 || (db.length >= 5 && sk.includes(db))) return brand;
      }
    }
    return null;
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
      suspicious_token_count: (() => {
        // Whole-token match only: "windows" must not count as "win",
        // "accountant" must not count as "account".
        const tokens = new Set(lower.split(/[^a-z0-9]+/));
        return SUSPICIOUS_TOKENS.filter((t) => tokens.has(t)).length;
      })(),
      host_entropy: Number(shannonEntropy(host).toFixed(4)),
      brand_lookalike: isBrandLookalike(host)
    };
    return Float32Array.from(FEATURE_NAMES.map((name) => f[name]));
  }

  return { extractUrlFeatures, parseHost, shannonEntropy, levenshtein, deglyph, isBrandLookalike, punyDecode, skeleton, idnHomographBrand };
});
