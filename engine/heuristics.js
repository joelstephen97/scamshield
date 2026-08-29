(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.Parry,
                       req ? require('./features') : root.Parry,
                       req ? require('./brand_match') : root.Parry,
                       req ? require('./site_signals') : root.Parry,
                       req ? require('./risk_rules') : root.Parry);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, F, BM, Sig, Risk) {
  'use strict';
  const { FEATURE_NAMES } = C;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  // Fuzzy brand-match confidence grades (engine/brand_match.js) as URL-rule
  // score weights. All three stay under THRESHOLDS.dangerous (0.8) alone, so
  // a lone fuzzy hit — with no other URL/DOM evidence — can only ever reach
  // "suspicious", never "dangerous" (task brief requirement).
  const FUZZY_BRAND_WEIGHT = { strongest: 0.55, strong: 0.50, weak: 0.25 };

  // `riskTlds` (optional): risk.json's `tlds` abused-TLD weight table
  // (background/service_worker.js mirrors it into settings.riskTlds once
  // fetched, so content_script.js can pass it straight through — no new
  // message round-trip). dyndns/hoster membership needs an async hash and is
  // therefore NOT scored here; see checkRiskHosting() in service_worker.js.
  function scoreUrl(urlString, riskTlds) {
    const v = F.extractUrlFeatures(urlString);
    const get = (n) => v[FEATURE_NAMES.indexOf(n)];
    const host = F.parseHost(urlString).host;
    const reasons = [];
    let score = 0;

    if (get('has_ip_host')) { score += 0.45; reasons.push({ code: 'ipHost', kind: 'link' }); }
    if (get('has_at_symbol')) { score += 0.35; reasons.push({ code: 'atSymbol', kind: 'link' }); }
    if (get('has_punycode')) { score += 0.30; reasons.push({ code: 'punycodeHost', kind: 'link' }); }
    // IDN homograph of a known brand (0.6.0): the domain, decoded and mapped
    // through the Unicode confusables skeleton, reads as a brand name. No
    // legitimate site writes a brand with look-alike foreign characters, so
    // together with the punycode rule above this reaches "dangerous" (0.80).
    if (get('has_punycode') && F.idnHomographBrand) {
      const hb = F.idnHomographBrand(F.parseHost(urlString).host);
      if (hb) { score += 0.50; reasons.push({ code: 'idnHomograph', kind: 'brand', params: [hb] }); }
    }
    if (get('brand_lookalike')) { score += 0.45; reasons.push({ code: 'brandLookalike', kind: 'brand' }); }
    if (get('suspicious_tld')) { score += 0.20; reasons.push({ code: 'suspiciousTld', kind: 'link' }); }
    if (!get('is_https')) { score += 0.15; reasons.push({ code: 'noHttps', kind: 'link' }); }
    if (get('num_subdomains') >= 3) { score += 0.15; reasons.push({ code: 'manySubdomains', kind: 'link' }); }
    const tok = get('suspicious_token_count');
    if (tok >= 2) { score += Math.min(0.25, 0.08 * tok); reasons.push({ code: 'urgencyKeywords', kind: 'link' }); }
    if (get('host_entropy') > 3.5 && get('host_length') > 20) { score += 0.10; reasons.push({ code: 'randomHost', kind: 'link' }); }

    // Fuzzy brand-impersonation evidence (0.9.0, engine/brand_match.js).
    // Allowlist-first: a host that IS (or is a subdomain of) a real brand
    // domain is short-circuited out of fuzzy matching entirely — it can
    // never be flagged as impersonating any brand. Only when that gate
    // clears do we grade the host against the fuzzy brand candidate list.
    if (BM && BM.allowlistBrandMatch && !BM.allowlistBrandMatch(host)) {
      const fuzzy = BM.fuzzyBrandMatch(host);
      if (fuzzy) {
        score += FUZZY_BRAND_WEIGHT[fuzzy.grade] || 0;
        reasons.push({ code: 'brandFuzzyMatch', kind: 'brand', params: [C.brandDisplayName(fuzzy.brand)] });
      }
    }

    // suspicious-site-reporter-inspired structural signals (0.9.0,
    // engine/site_signals.js): deep subdomain chains, over-long labels, and
    // known link-shortener/redirect hosts. See /NOTICE.
    if (Sig && Sig.scoreSiteSignals) {
      const site = Sig.scoreSiteSignals(host);
      score += site.score;
      for (const r of site.reasons) reasons.push(r);
    }

    // risk.json abused-TLD weight table (0.9.0, engine/risk_rules.js) — warn-
    // tier evidence only when the OTA feed cycle has fetched the table.
    if (Risk && Risk.abusedTldWeight && riskTlds) {
      const tldHit = Risk.abusedTldWeight(host, riskTlds);
      if (tldHit) { score += 0.20; reasons.push({ code: 'riskAbusedTld', kind: 'link', params: [tldHit.tld] }); }
    }

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
        reasons.push({ code: 'credentialFormForeignDomain', kind: 'page' });
      }
    }

    if ((s.hiddenIframeCount || 0) > 0) {
      score += 0.2;
      reasons.push({ code: 'hiddenIframes', kind: 'page' });
    }

    const phrases = s.scamPhrases || [];
    if (phrases.length) {
      score += Math.min(0.5, 0.2 * phrases.length);
      reasons.push({ code: 'scamPhrase', kind: 'page', params: [phrases[0]] });
    }

    // Seed-phrase / recovery-phrase harvesting (no legit site asks for this).
    if (s.seedPhraseForm) {
      score = Math.max(score, 0.9);
      flags.push('seed-phrase-harvest');
      reasons.push({ code: 'seedPhraseAsk', kind: 'wallet' });
    }

    // ClickFix / fake-CAPTCHA instructions (0.6.0, engine/clickfix_rules.js).
    if (s.clickfix && s.clickfix.level === 'dangerous') {
      score = Math.max(score, 0.9);
      flags.push('clickfix');
      for (const r of s.clickfix.reasons) reasons.push(r);
    } else if (s.clickfix && s.clickfix.level === 'suspicious') {
      score += 0.25;
      if (s.clickfix.reasons[0]) reasons.push(s.clickfix.reasons[0]);
    }

    // Fake browser-update prompt (0.6.0, engine/fakeupdate_rules.js).
    if (s.fakeUpdate && s.fakeUpdate.level === 'dangerous') {
      score = Math.max(score, 0.9);
      flags.push('fake-browser-update');
      for (const r of s.fakeUpdate.reasons) reasons.push(r);
    }

    // Content-based brand impersonation: page *names* a brand but is not on that
    // brand's real domain, and collects a password.
    //
    // Allowlist-first short-circuit (0.9.0, Task B3 requirement 2, verified):
    // `legit.some((d) => pageDomain === d || host.endsWith('.' + d))` below IS
    // suffix matching — the same semantics engine/brand_match.js's
    // allowlistBrandMatch() trie implements — so a page on (or a subdomain
    // of) `brandKey`'s real domain always short-circuits every heuristic that
    // calls isOnBrand() before it can fire. `exactBrandCc` additionally
    // treats an exact-brand SLD on an ordinary ccTLD as trusted (regional
    // storefronts not in the hardcoded list, e.g. a hypothetical
    // "amazon.jp") — deliberately more permissive than brand_match.js's
    // fuzzy TLD-swap grade, which DOES flag that same shape as evidence; the
    // two signals disagreeing there is intentional defense-in-depth (content
    // impersonation demands higher precision since it reaches "dangerous"
    // directly, fuzzy URL evidence is capped at "suspicious").
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
      reasons.push({ code: 'brandImpersonationContent', kind: 'brand', params: [matchedBrand] });
    }

    // Delivery-fee scam (0.6.0): carrier brand + card-number form + small-fee
    // wording on a non-carrier domain — the classic package-phishing landing
    // page (49% of UK-reported scams in 2025). No password field involved, so
    // the content-impersonation branch above never catches it.
    if (matchedBrand && (C.CARRIER_BRANDS || []).includes(matchedBrand) &&
        !isOnBrand(matchedBrand) && s.hasCardInput && s.deliveryFeeText) {
      score = Math.max(score, 0.9); flags.push('delivery-fee-scam'); brand = brand || matchedBrand;
      reasons.push({ code: 'deliveryFeeScam', kind: 'brand', params: [displayName(matchedBrand)] });
    }
    // Visual (icon/logo hash) impersonation — 0.5.0. A 'logo' match (an <img>
    // logo candidate, more prone to false positives than a favicon/touch-icon)
    // only ever earns the +0.35 corroboration bump, never the 0.85 visual flag
    // reserved for icon/favicon-derived (or unknown-kind) matches.
    const icon = (s.iconMatches || []).find((m) => m && m.brand && !isOnBrand(m.brand));
    if (icon) {
      const label = displayName(icon.brand);
      const iconReason = { code: 'brandIconMismatch', kind: 'brand', params: [label] };
      if (s.hasPasswordField && icon.kind !== 'logo') {
        score = Math.max(score, 0.85); flags.push('brand-impersonation-visual'); brand = brand || icon.brand;
        reasons.push(iconReason);
      } else {
        score += 0.35; reasons.push(iconReason);
      }
    }

    return { score: Math.max(0, Math.min(1, score)), reasons, flags, brand };
  }

  return { scoreUrl, scoreDom, registrableDomain };
});
