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
  // Brand keys that are ALSO ordinary English words (or bare abbreviations
  // that read as one). A tenant label is arbitrary user-chosen text —
  // "trust-portal", "wish-list-app", "back-ups-manager", "grab-a-coffee" —
  // so matching these keys as a hyphen token there is a false-positive
  // machine, and the 2026-09-07 final review found every one of them firing
  // on ordinary demo/app hosts. Excluded from tenantBrandToken ONLY: content
  // impersonation (brandNameIn, via a distinctive multi-word `names` entry)
  // and the feed/hot block paths still cover these brands.
  const TENANT_TOKEN_EXCLUDE = new Set([
    // named in the 0.13.0 final review
    'apple', 'amazon', 'outlook', 'steam', 'wise', 'grab', 'noon', 'emirates',
    'ups', 'ing', 'fab', 'dib', 'du', 'icp', 'dbs', 'line', 'wish', 'mobile', 'trust',
    // found by scanning Object.keys(BRAND_DOMAINS) for bare English words
    'affirm', 'chase', 'chime', 'concur', 'digi', 'discover', 'exodus', 'gemini',
    'greenhouse', 'indeed', 'indigo', 'kraken', 'ledger', 'lever', 'nab', 'notion',
    'orange', 'popular', 'regions', 'scoot', 'slack', 'smart', 'southwest',
    'square', 'stripe', 'target', 'three', 'twitch', 'united', 'zoom'
  ]);
  // The subset of the above that must ALSO be excluded from gradeAgainst's
  // token-injection rules (a)/(b), where the same bare word turns up inside
  // an ordinary compound hostname ("general-ledger-app.vercel.app"). Kept
  // deliberately tiny: apple/amazon/steam/outlook stay eligible there
  // because hyphen-injection ("secure-apple-verify.com") is the dominant
  // phishing shape for them and the FP cost is worth paying. Rules c/d/e
  // (TLD swap, homoglyph, DL-1 on the registrable name itself) still apply
  // to every brand here, so "ledgerr.com" is still caught.
  const INJECTION_TOKEN_EXCLUDE = new Set(['ledger']);

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
  // own label. Returns `{ grade, rule }` (rule 'a'..'e') or null — callers
  // that need to know WHICH rule fired (engine/heuristics.js dedupes rules
  // c/d/e against brandForeignSuffix, which is the same evidence) read it.
  function gradeAgainst(brand, form, hostForm, subLabels, sld) {
    // Rules (a)/(b) match the raw brand KEY as a whole token, so they need a
    // key long enough to be distinctive: a 2-3 letter key (fab, icp, ups,
    // ing, dib, du) hits every hyphenated host that happens to contain those
    // letters as a word ("my-fab-store.com", "back-ups-manager"). Ordinary
    // English-word keys are excluded for the same reason — see
    // INJECTION_TOKEN_EXCLUDE. Rules c/d/e below are unaffected.
    const injectable = brand.length >= 4 && !INJECTION_TOKEN_EXCLUDE.has(brand);
    // a) brand token as its own whole subdomain label, homoglyph-aware
    // ("paypal.attacker.com", "rnetamask.attacker.com").
    if (injectable) for (const lab of subLabels) {
      if (tokenMatchesBrand(lab, brand)) return { grade: 'strongest', rule: 'a' };
    }
    // b) brand token as a hyphen-delimited piece of a label — subdomain OR
    // the SLD itself ("secure-paypal-login.attacker.com",
    // "secure-paypa1-login.com"). A bare (non-hyphenated) label match is
    // TLD-swap/homoglyph territory below, not injection.
    const hyphenCandidates = subLabels.concat(sld ? [sld] : []);
    if (injectable) for (const lab of hyphenCandidates) {
      const tokens = lab.split('-');
      if (tokens.length > 1 && tokens.some((t) => tokenMatchesBrand(t, brand))) return { grade: 'strongest', rule: 'b' };
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
    if (sld === form) return { grade: 'strong', rule: 'c' };
    // d) homoglyph substitution match (exact, after normalising).
    for (const variant of homoglyphVariants(sld)) {
      if (variant === form) return { grade: 'strong', rule: 'd' };
    }
    // e) generic edit distance.
    const dist = damerauLevenshtein(sld, form);
    if (dist === 1) return { grade: 'strong', rule: 'e' };
    if (dist === 2 && form.length >= 8) return { grade: 'weak', rule: 'e' }; // long brand names only
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
      const g = gradeAgainst(brand, form, hostForm, subLabels, parts.sld);
      if (!g) continue;
      if (!best || GRADE_RANK[g.grade] > GRADE_RANK[best.grade]) best = { brand, grade: g.grade, rule: g.rule };
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
  // Brand token inside a tenant label ("signin-att-verifier" -> att). EXACT
  // token or homoglyph variant only.
  //
  // Excluded keys (0.13.0 final review):
  //   - `fuzzy: false` — a tenant label token is matched against the raw KEY
  //     exactly the way gradeAgainst's rules (a)/(b) are, so a common-word
  //     key ("smart", "regions", ...) would turn an ordinary tenant subdomain
  //     ("smart-home-devices.vercel.app") into a false impersonation hit;
  //   - `nameMatch: false` — the hand-written flag already saying "this key
  //     is too generic to word-match in page text"; a tenant label is even
  //     more arbitrary than page text, so the same verdict applies;
  //   - TENANT_TOKEN_EXCLUDE — bare English words that survive both flags.
  //
  // The old DL-1 pass is GONE. It was the single biggest FP source in the
  // 2026-09-07 review: "trust-portal" -> truist, "mobile-account" -> tmobile,
  // "ledgerr-lliv" -> ledger. A tenant kit that misspells the brand it
  // impersonates still carries credentialFormOnTenantHost (+0.45) plus,
  // almost always, the brand's name in the page content.
  function tenantBrandToken(label) {
    const tokens = String(label || '').toLowerCase().split(/[-_.]+/).filter((t) => t.length >= 3);
    if (!tokens.length) return null;
    const keys = Object.keys(BRAND_DOMAINS).filter((k) => {
      if (TENANT_TOKEN_EXCLUDE.has(k)) return false;
      const b = BRANDS_BY_KEY && BRANDS_BY_KEY[k];
      return !(b && (b.fuzzy === false || b.nameMatch === false));
    });
    for (const t of tokens) for (const k of keys) if (t === k || homoglyphVariants(t).includes(k)) return k;
    return null;
  }

  return {
    MIN_BRAND_LEN, GRADE_RANK, TENANT_TOKEN_EXCLUDE, INJECTION_TOKEN_EXCLUDE,
    allowlistBrandMatch, fuzzyForm, damerauLevenshtein, homoglyphVariants, fuzzyBrandMatch,
    brandForeignSuffix, tenantBrandToken,
    _resetTrieForTest, _resetCandidatesForTest
  };
});
