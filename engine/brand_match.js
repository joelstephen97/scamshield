// engine/brand_match.js — brand-impersonation upgrades (0.9.0, Task B3).
//
// Two independent, pure, chrome-free pieces:
//
//   1. allowlistBrandMatch(host): a reversed-label suffix trie over
//      BRAND_DOMAINS — MetaMask eth-phishing-detect's "allowlist-first"
//      matching semantics, reimplemented clean-room from the public
//      algorithm description only (reverse each known domain's labels into a
//      trie; a host matches when walking ITS reversed labels reaches a
//      terminal node). This is the single short-circuit gate every
//      brand-impersonation heuristic in this file must consult first: a page
//      ON (or a subdomain of) a brand's real domain can never be flagged as
//      impersonating that brand.
//
//   2. fuzzyBrandMatch(host): graded confidence EVIDENCE (never automatic
//      blocking — callers keep a lone hit at "suspicious", not "dangerous")
//      for hosts that are NOT on the allowlist but resemble a well-known
//      brand's domain closely enough to be a typosquat/lookalike/injection
//      attempt. Grading follows the task brief: subdomain/hyphen brand-token
//      injection > homoglyph substitution / exact Damerau-Levenshtein-1 /
//      TLD-swap of the exact brand > DL-2 on long brand names only.
//
// This is ADDITIVE to, and independent of, engine/features.js's
// isBrandLookalike() — that feature's output is frozen (parity-locked
// against the Python model trainer via model/parity.json) and is never
// touched here.
//
// FP discipline: a brand whose "fuzzy form" (see fuzzyForm() below) is under
// 5 characters never fuzzy-matches — MetaMask's own production fuzzylist
// tolerates the same floor, because a short brand name collides with too
// much ordinary text. Filtering BRANDS by that length also caps the
// candidate list at ~45 entries out of ~65 defined brands, in the same
// spirit as "fuzzy over a big list is a false-positive machine".
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';

  const { BRAND_DOMAINS, BRANDS_BY_KEY, registrableParts, isVerifiedNamespace } = C;
  const MIN_BRAND_LEN = 5;

  // ---- 1. allowlist-first suffix trie ---------------------------------------

  function buildTrie() {
    const trieRoot = {};
    for (const brand of Object.keys(BRAND_DOMAINS)) {
      for (const domain of BRAND_DOMAINS[brand]) {
        const labels = String(domain).toLowerCase().split('.').filter(Boolean).reverse();
        let node = trieRoot;
        for (const label of labels) {
          node.children = node.children || {};
          node = node.children[label] = node.children[label] || {};
        }
        node.brand = brand; // domain terminates here
      }
    }
    return trieRoot;
  }
  let TRIE = null;
  function trie() { return TRIE || (TRIE = buildTrie()); }
  // Test-only: BRAND_DOMAINS never mutates at runtime otherwise, so nothing
  // in the shipped extension ever needs to invalidate this cache.
  function _resetTrieForTest() { TRIE = null; }

  // Returns the brand key if `host` IS a brand's real domain, or any
  // subdomain of it ("pay.paypal.com" matches "paypal.com"); null otherwise.
  // Walking reversed labels means a host can only match by ending in a real
  // brand domain — "paypal.com.evil.tk" reverses to [tk, evil, com, paypal],
  // and the walk dies at the very first label ("tk" has no trie branch), so
  // the classic prefix-trick bypass never fools it.
  function allowlistBrandMatch(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const labels = h.split('.').filter(Boolean).reverse();
    let node = trie();
    let hit = null;
    for (const label of labels) {
      const children = node.children;
      if (!children || !children[label]) break;
      node = children[label];
      if (node.brand) hit = node.brand; // deepest terminal seen so far wins
    }
    // Registry-verified namespaces (0.13.0): every registrant here is
    // licence-checked by the registry itself (e.g. only a licensed Indian
    // bank can hold a *.bank.in name), so a host inside one is never brand
    // impersonation even when it isn't a hardcoded BRAND_DOMAINS entry yet.
    // Prefer an actual brand-key label match (hdfc.bank.in -> 'hdfc') so
    // callers get a real brand for display; otherwise short-circuit with a
    // sentinel that just means "don't fuzzy-match this host".
    if (!hit && isVerifiedNamespace && isVerifiedNamespace(h)) {
      const hostLabels = h.split('.').filter(Boolean);
      const brandKeys = Object.keys(BRAND_DOMAINS);
      const labelHit = hostLabels.find((lab) => brandKeys.includes(lab));
      return labelHit || '__verified__';
    }
    return hit;
  }

  // ---- 2. fuzzy brand detection ----------------------------------------------

  // hostname minus its public suffix, remaining labels re-joined with dots
  // ("app.metamask.io" -> "app.metamask"). Reuses registrableParts so this
  // never disagrees with the rest of the engine about where the suffix ends
  // (multi-label ccTLD suffixes like .co.uk included).
  function fuzzyForm(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const parts = registrableParts(h);
    if (!parts.suffix) return h; // IP or single label — nothing to strip
    const labels = h.split('.').filter(Boolean);
    const suffixLabelCount = parts.suffix.split('.').length;
    return labels.slice(0, Math.max(0, labels.length - suffixLabelCount)).join('.');
  }

  // Damerau-Levenshtein distance (optimal string alignment: substitution,
  // insertion, deletion, and adjacent transposition all cost 1). Bounded the
  // same way engine/features.js's plain Levenshtein is, for the same reason —
  // our largest tolerance is 2, so a length gap over 2 can never come in
  // under it and the full DP table is skippable.
  function damerauLevenshtein(a, b) {
    const al = a.length, bl = b.length;
    if (Math.abs(al - bl) > 2) return 3;
    const d = [];
    for (let i = 0; i <= al; i++) d[i] = [i];
    for (let j = 0; j <= bl; j++) d[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }

  // Homoglyph normalisation using the task-specified substitution set
  // (0<->o, 1<->l/i, rn<->m, vv<->w). Deliberately separate from
  // engine/features.js's deglyph(): that one is frozen (model parity). rn->m
  // and vv->w are 2-characters-for-1 substitutions that a plain edit-distance
  // check can't see cheaply (they cost 2 under Levenshtein/DL, not 1), which
  // is exactly why they need their own dedicated check to earn "strong"
  // confidence instead of falling through to "weak" (DL-2).
  function homoglyphVariants(s) {
    const base = String(s).toLowerCase().replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o');
    // "1" is ambiguous between l and i — try both.
    return [base.replace(/1/g, 'l'), base.replace(/1/g, 'i')];
  }
  function tokenMatchesBrand(token, brand) {
    if (token === brand) return true;
    for (const variant of homoglyphVariants(token)) if (variant === brand) return true;
    return false;
  }

  // The ~45-entry fuzzy candidate list: every brand whose fuzzy form (from
  // its first/primary domain) is at least MIN_BRAND_LEN characters. Computed
  // once and cached, same lifetime rationale as the trie above.
  //
  // `fuzzy: false` opt-out (0.13.0 fix round): gradeAgainst's rules (a)/(b)
  // match a host's bare label/hyphen token against the raw brand KEY —
  // independent of MIN_BRAND_LEN, which only gates on domains[0]'s fuzzy
  // FORM. A brand whose key is an ordinary word ("square", "discover",
  // "chase", ...) therefore false-positives on any unrelated hyphenated
  // host that happens to use that word ("square-dance-club.org"). Those
  // brands are excluded from the candidate list entirely; content
  // impersonation (brandNameIn) still covers them via a distinctive,
  // non-bare-word `names` entry (enforced by scripts/build-brands.js).
  function buildCandidates() {
    const out = [];
    for (const brand of Object.keys(BRAND_DOMAINS)) {
      const b = BRANDS_BY_KEY && BRANDS_BY_KEY[brand];
      if (b && b.fuzzy === false) continue;
      const domains = BRAND_DOMAINS[brand];
      if (!domains || !domains.length) continue;
      const form = fuzzyForm(domains[0]);
      if (form.length < MIN_BRAND_LEN) continue;
      out.push({ brand, form });
    }
    return out;
  }
  let CANDIDATES = null;
  function candidates() { return CANDIDATES || (CANDIDATES = buildCandidates()); }
  function _resetCandidatesForTest() { CANDIDATES = null; }

  const GRADE_RANK = { strongest: 3, strong: 2, weak: 1 };

  // Grades `host` against one brand candidate. `hostForm` is the whole
  // host's fuzzy form; `subLabels` are the labels strictly below the
  // registrable domain (true subdomains); `sld` is the registrable domain's
  // own label. Returns a grade string or null.
  function gradeAgainst(brand, form, hostForm, subLabels, sld) {
    // a) brand token as its own whole subdomain label, homoglyph-aware
    // ("paypal.attacker.com", "rnetamask.attacker.com").
    for (const lab of subLabels) {
      if (tokenMatchesBrand(lab, brand)) return 'strongest';
    }
    // b) brand token as a hyphen-delimited piece of a label — subdomain OR
    // the SLD itself ("secure-paypal-login.attacker.com",
    // "secure-paypa1-login.com"). A bare (non-hyphenated) label match is
    // TLD-swap/homoglyph territory below, not injection.
    const hyphenCandidates = subLabels.concat(sld ? [sld] : []);
    for (const lab of hyphenCandidates) {
      const tokens = lab.split('-');
      if (tokens.length > 1 && tokens.some((t) => tokenMatchesBrand(t, brand))) return 'strongest';
    }
    // Rules c/d/e judge the registrable name ITSELF, so they compare the
    // bare SLD — not the subdomain-inclusive fuzzy form, which would let any
    // "www."/"secure."/"mail." prefix push the distance out of tolerance and
    // defeat typosquat detection entirely ("www.paypai.com" must still hit).
    // The length floor sits here, after a/b: a short SLD ("talabat.xy.com")
    // must not exempt the host from the subdomain-injection rules above.
    if (!sld || sld.length < MIN_BRAND_LEN) return null;
    // c) TLD-swap of the exact brand: SLD matches exactly (distance 0) —
    // only the suffix differs, and the allowlist gate the caller already ran
    // ruled out that suffix being one the brand controls.
    if (sld === form) return 'strong';
    // d) homoglyph substitution match (exact, after normalising).
    for (const variant of homoglyphVariants(sld)) {
      if (variant === form) return 'strong';
    }
    // e) generic edit distance.
    const dist = damerauLevenshtein(sld, form);
    if (dist === 1) return 'strong';
    if (dist === 2 && form.length >= 8) return 'weak'; // long brand names only
    return null;
  }

  // Best (host, brand) match across the whole candidate list, or null.
  // CALLERS MUST check allowlistBrandMatch(host) first and skip this entirely
  // on a hit — this function assumes the host is not already on a real
  // brand domain (requirement 2's short-circuit).
  function fuzzyBrandMatch(host) {
    const h = String(host || '').toLowerCase();
    const hostForm = fuzzyForm(h);
    // No whole-form length floor here: the SLD floor lives inside
    // gradeAgainst() after the injection rules, so a short registrable name
    // with a brand smuggled into a subdomain still gets caught.
    if (!hostForm) return null;
    const parts = registrableParts(h);
    const labels = h.replace(/\.+$/, '').split('.').filter(Boolean);
    const domainLabelCount = parts.domain ? parts.domain.split('.').length : labels.length;
    const subLabels = labels.slice(0, Math.max(0, labels.length - domainLabelCount));
    let best = null;
    for (const { brand, form } of candidates()) {
      const grade = gradeAgainst(brand, form, hostForm, subLabels, parts.sld);
      if (!grade) continue;
      if (!best || GRADE_RANK[grade] > GRADE_RANK[best.grade]) best = { brand, grade };
    }
    return best;
  }

  // ---- 3. brand-foreign-suffix (0.13.0) --------------------------------------
  // Exact brand SLD under a public suffix the brand provably never uses
  // (ccPolicy 'closed'). Ordinary evidence (not risk-table) so it can reach
  // "dangerous" with one corroborating signal. Open brands keep the
  // permissive regional-storefront behaviour (R11).
  function brandForeignSuffix(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    if (allowlistBrandMatch(h)) return null;
    const parts = registrableParts(h);
    const b = C.BRANDS_BY_KEY && C.BRANDS_BY_KEY[parts.sld];
    if (!b || b.ccPolicy !== 'closed' || !Array.isArray(b.suffixes)) return null;
    return b.suffixes.includes(parts.suffix) ? null : { brand: b.key, suffix: parts.suffix };
  }

  // ---- 4. tenant-host brand token (0.13.0, Task 9) ---------------------------
  // Brand token inside a tenant label ("signin-att-verifier" -> att). Exact
  // token, homoglyph variant, or DL-1 for brands >= 6 chars. Short keys
  // (att, bhd, td) match only as exact tokens.
  //
  // `fuzzy: false` keys are excluded here too (0.13.0 fix round): a tenant
  // label token is matched against the raw KEY exactly the same way
  // gradeAgainst's rules (a)/(b) are, so a common-word key ("smart",
  // "regions", ...) would turn an ordinary tenant subdomain
  // ("smart-home-devices.vercel.app") into a false brand-impersonation hit.
  function tenantBrandToken(label) {
    const tokens = String(label || '').toLowerCase().split(/[-_.]+/).filter((t) => t.length >= 3);
    if (!tokens.length) return null;
    const keys = Object.keys(BRAND_DOMAINS).filter((k) => !(BRANDS_BY_KEY && BRANDS_BY_KEY[k] && BRANDS_BY_KEY[k].fuzzy === false));
    for (const t of tokens) for (const k of keys) if (t === k || homoglyphVariants(t).includes(k)) return k;
    for (const t of tokens) for (const k of keys) if (k.length >= 6 && t.length >= 5 && damerauLevenshtein(t, k) === 1) return k;
    return null;
  }

  return {
    MIN_BRAND_LEN, GRADE_RANK,
    allowlistBrandMatch, fuzzyForm, damerauLevenshtein, homoglyphVariants, fuzzyBrandMatch,
    brandForeignSuffix, tenantBrandToken,
    _resetTrieForTest, _resetCandidatesForTest
  };
});
