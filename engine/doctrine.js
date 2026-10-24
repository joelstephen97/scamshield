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
  // (0.15.0 final fix A, I2/I3) On a popular registrable these three read as ordinary pages: a security-news
  // article about a fake Chrome update, a wallet vendor's recovery help, a parcel-scam explainer. They are
  // demoted to quiet there (the finding stays in the verdict and the popup). feed-block and clickfix (page-initiated
  // write) stay unconditional; wallet drainer is its own runtime path and is never demoted.
  const POPULAR_DEMOTED_STOP_FLAGS = ['seed-phrase-harvest', 'fake-browser-update', 'delivery-fee-scam'];
  // Flags confident enough to show a banner at "suspicious". A feed "warn" hit counts only once
  // it was verified against the exact shard (`feed-warn-verified`, set by content_script.js);
  // an unverified hit carries `feed-warn-unverified`, which is in no list here, so it stays
  // quiet unless other evidence makes the verdict dangerous (0.15.0).
  const CONFIDENT_FLAGS = ['feed-warn-verified', 'feed-warn-corroborated', 'brand-impersonation-content', 'brand-impersonation-visual', 'brand-impersonation-tenant', 'credential-form-foreign-domain',
    // (0.15.0) added by credentialFlags(): corroborated, non-popular evidence + a credential field.
    'nrd-credential', 'brand-lookalike-credential',
    // (recall recovery) insecure-credential: visible login on a plain-http public page; tenant-credential: visible login
    // on a no-code builder tenant.
    'insecure-credential', 'tenant-credential',
    // (0.15.0, Joel's call after bench Run 8) nrd-brand-host: a newly registered domain that carries a brand as its own
    // label or hyphen token (vinted-offer.info, paypal.secure-x.com) or an IDN homograph, on a non-popular host. No form needed:
    // lure and "offer" pages ask for nothing until the next click.
    'nrd-brand-host',
    // (0.15.0) credential-exfil: the page's inline script names a Telegram bot / Discord webhook AND shows a visible password or card field.
    'credential-exfil'];
  // Feed intel still counts on popular sites: a validated list hit is not a heuristic.
  const FEED_FLAGS = ['feed-warn-verified', 'feed-warn-corroborated'];
  // Flags that need a credential field on the page. On a path-based publishing host (medium.com/@evil) the
  // popular shield is lifted for these only.
  const CREDENTIAL_FLAGS = ['credential-form-foreign-domain', 'brand-impersonation-content', 'brand-impersonation-visual', 'brand-lookalike-credential', 'nrd-credential', 'insecure-credential', 'tenant-credential', 'credential-exfil'];

  // (0.15.0) USER_CONTENT_HOSTS / isUserContentHost live in engine/constants.js (single source of
  // truth; isSafeHost needs them and constants.js loads first). Re-exported unchanged below.
  const { USER_CONTENT_HOSTS, isUserContentHost, isPathUserContentHost } = C;

  // How far the popular guard shields this host:
  //   'none'       not popular, or a user-content host (evil.gitbook.io, sites.google.com): no shield
  //   'credential' popular, but a path-based publishing host: shielded EXCEPT credential-form flags
  //   'full'       popular: heuristic and model signals can never warn
  function popularMode(popular, host) {
    if (!popular) return 'none';
    if (isUserContentHost(host)) return 'none';
    if (isPathUserContentHost && isPathUserContentHost(host)) return 'credential';
    return 'full';
  }
  // Popular guard input: user-content hosts of popular registrables are never shielded.
  function effectivePopular(popular, host) { return popularMode(popular, host) === 'full'; }

  // URL-rule reason codes that mean "the host imitates a brand". brandFuzzyMatch
  // counts only at grade strong/strongest (the weak grade is too noisy to warn on).
  const LOOKALIKE_CODES = ['brandLookalike', 'brandForeignSuffix', 'idnHomograph'];
  function isLookalikeReason(r) {
    if (!r) return false;
    if (LOOKALIKE_CODES.includes(r.code)) return true;
    return r.code === 'brandFuzzyMatch' && (r.grade === 'strong' || r.grade === 'strongest');
  }

  // Confident flags that need a credential field on a non-popular host (0.15.0):
  //   nrd-credential: new-domain evidence + a visible password/card field + CORROBORATION
  //     (final fix A, I9: URL score >= 0.15, or a brand reason, or a foreign-action reason) -
  //     a Bloom false positive on an old login page must not warn by itself.
  //   brand-lookalike-credential: brand-imitating host + a visible password/card field
  // in = { verdictFlags, urlReasons, urlScore, domReasons, hasPasswordField (a VISIBLE credential field), popular, host }
  // Fuzzy brand match at a grade that counts (strong/strongest); weak never counts as brand evidence.
  const isStrongFuzzy = (r) => !!r && r.code === 'brandFuzzyMatch' && (r.grade === 'strong' || r.grade === 'strongest');
  const WEAK_FUZZY_WEIGHT = 0.25; // engine/heuristics.js FUZZY_BRAND_WEIGHT.weak
  // in.strictLookalike (final fix A round 2, N1): the lookalike flag needs a typosquat-shaped match, not mere
  // brand-as-substring (applebees.com, amazonia.com) or a bare suffix swap (dropbox.org): an idnHomograph, OR a
  // strong/strongest fuzzy match (edit distance <= 1 to the brand) PLUS in.corroborated (a non-URL signal).
  // finalizeVerdict always sets it; without it the 0.15.0 rule (any lookalike reason) applies. A verdict that is
  // already dangerous warns regardless of this flag.
  // Hosts where a plain-http login is normal or not public: IP literals, localhost, intranet-style suffixes, single labels.
  const LOCAL_SUFFIX = /\.(local|localhost|lan|internal|home\.arpa|test|example|invalid|corp|home|intranet)$/;
  function isLocalOrIpHost(host) {
    const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (!h || h.indexOf('.') === -1) return true; // single label (incl. localhost, router)
    if (h.indexOf(':') !== -1 || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv6 / IPv4 literal
    return LOCAL_SUFFIX.test(h);
  }
  function credentialFlags(i) {
    const out = [];
    if (!i || !i.hasPasswordField || popularMode(i.popular, i.host) === 'full') return out;
    const urlReasons = i.urlReasons || [], domReasons = i.domReasons || [];
    // (recall recovery, R1) a visible password/card field on a plain-http public page. The scheme is read off the URL
    // rules' noHttps reason (they score the page URL), so no new signal is needed.
    if (urlReasons.some((r) => r && r.code === 'noHttps') && !isLocalOrIpHost(i.host)) out.push('insecure-credential');
    // (recall recovery, R3) a visible login on a no-code builder tenant. hasLoginPair (a visible text/email/tel/card input
    // beside the password) is optional: when the content script reports false, a password-only site gate stays quiet.
    if (C.isBuilderTenantHost && C.isBuilderTenantHost(i.host) && i.hasLoginPair !== false) out.push('tenant-credential');
    if ((i.verdictFlags || []).includes('new-domain')) {
      // (N6) a weak-grade fuzzy match is not brand evidence: not as a reason, and not through the URL score it adds.
      const weak = urlReasons.some((r) => r && r.code === 'brandFuzzyMatch' && !isStrongFuzzy(r));
      const urlScore = (i.urlScore || 0) - (weak ? WEAK_FUZZY_WEIGHT : 0);
      const brandReason = (r) => r && r.kind === 'brand' && (r.code !== 'brandFuzzyMatch' || isStrongFuzzy(r));
      const corroborated = urlScore >= 0.15 - 1e-9
        || urlReasons.some(brandReason) || domReasons.some(brandReason)
        || domReasons.some((r) => r && r.code === 'credentialFormForeignDomain');
      if (corroborated) out.push('nrd-credential');
    }
    const lookalike = i.strictLookalike
      ? (urlReasons.some((r) => r && r.code === 'idnHomograph') || (urlReasons.some(isStrongFuzzy) && i.corroborated === true))
      : urlReasons.some(isLookalikeReason);
    if (lookalike) out.push('brand-lookalike-credential');
    return out;
  }

  // Non-URL corroboration for a safe-level typosquat (N1): a brand named in the title/og/logo, a foreign form action,
  // a young domain, http, a suspicious TLD, or a generic phishing title.
  const PHISH_TITLE = /\b(verify|verification|suspended|unlock|locked|restore|confirm your|secure your|update your|re-?activate|unusual)\b/i;
  function lookalikeCorroborated(x, v, urlReasons, domReasons) {
    const sg = x.signals || {};
    if ((v.flags || []).includes('new-domain')) return true;
    if (urlReasons.some((r) => r && (r.code === 'noHttps' || r.code === 'suspiciousTld' || r.code === 'riskAbusedTld'))) return true;
    if (domReasons.some((r) => r && (r.kind === 'brand' || r.code === 'credentialFormForeignDomain'))) return true;
    const title = String(sg.titleBrand || '');
    if (PHISH_TITLE.test(title)) return true;
    if (C.brandNameIn && C.brandNameIn([title, sg.ogSiteName || '', ...(sg.logoAltBrands || [])].join(' | '))) return true;
    return false;
  }

  function surfaceTier(verdict, ctx) {
    const c = ctx || {};
    if (!verdict || verdict.level === 'safe') return 'quiet';
    const flags = Array.isArray(verdict.flags) ? verdict.flags : [];
    const has = (list) => flags.some((f) => list.includes(f));

    let tier;
    const mode = popularMode(c.popular, c.host);
    // Popular hosts: the three text-lure stop flags are demoted (path-based hosts keep seed-phrase and
    // delivery-fee, which need a real form field, but demote the fake-update wording that articles quote).
    const demoted = mode === 'full' ? POPULAR_DEMOTED_STOP_FLAGS : mode === 'credential' ? ['fake-browser-update'] : [];
    const stopFlags = STOP_FLAGS.filter((f) => !demoted.includes(f));
    if (verdict.level === 'dangerous' && has(stopFlags)) return 'stop';
    if (mode === 'full' && !has(FEED_FLAGS)) return 'quiet';
    if (mode === 'credential' && !has(FEED_FLAGS) && !has(CREDENTIAL_FLAGS)) return 'quiet';
    if (verdict.level === 'dangerous') tier = 'warn';
    else if (verdict.level === 'suspicious' && has(CONFIDENT_FLAGS)) tier = 'warn';
    else tier = 'quiet';
    // Strict mode raises a warning to a stop; it never lifts quiet.
    if (c.strictMode === true && tier === 'warn') tier = 'stop';
    return tier;
  }

  // The final stage of the page pipeline (0.15.0 final fix A): everything that happens to a fused verdict
  // between "the scorers are done" and "show / don't show", as ONE pure function so content_script.js and
  // the tests cannot drift apart (a safe-level gate here once hid every one-edit brand typosquat).
  //   1. bot-challenge suppression of a flag-less verdict - never when the URL imitates a brand (I8)
  //   2. credential evidence: a non-popular page with a VISIBLE password/card field that also has a
  //      brand-lookalike host is lifted to at least "suspicious" with the confident flag (C1)
  //   3. the surface tier
  // i = { urlRules, domRules, signals: { hasVisiblePasswordField, hasVisibleCardInput },
  //       popular, host, strictMode, isTop, challengePage }
  // Flags that lift a safe verdict to suspicious (the evidence is host- or scheme-shaped, below the 0.5 line by itself).
  const LIFT_FLAGS = ['brand-lookalike-credential', 'insecure-credential', 'tenant-credential'];
  // nrd-brand-host: needs BOTH the new-domain flag (an nrd.bloom hit) and a host-shaped brand claim that has no innocent
  // reading - the brand as a whole label or hyphen token (fuzzy grade "strongest", rules a/b) or an IDN homograph. A one-edit
  // typo (applebees.com) or a suffix swap is not enough. Never on a popular or brand-owned host (the fuzzy matcher skips the
  // brand's own domains), and only for a verdict the scorers already made suspicious (NRD + URL evidence does that).
  function nrdBrandHost(v, urlReasons, x) {
    if (!v || v.level === 'safe') return false;
    if (!(v.flags || []).includes('new-domain')) return false;
    if (popularMode(x.popular, x.host) !== 'none' || isLocalOrIpHost(x.host)) return false;
    return urlReasons.some((r) => r && (r.code === 'idnHomograph' || (r.code === 'brandFuzzyMatch' && r.grade === 'strongest')));
  }
  function finalizeVerdict(verdict, i) {
    const x = i || {};
    let v = verdict || { level: 'safe', score: 0, reasons: [], reasonCodes: [], flags: [] };
    const urlReasons = (x.urlRules && x.urlRules.reasons) || [];
    const domReasons = (x.domRules && x.domRules.reasons) || [];
    if (v.level !== 'safe' && !(v.flags || []).length && x.challengePage === true && !urlReasons.some(isLookalikeReason)) {
      v = Object.assign({}, v, { level: 'safe', reasons: [], reasonCodes: [], suppressed: 'challenge' });
    }
    const sg = x.signals || {};
    const credFlags = credentialFlags({
      verdictFlags: v.flags, urlReasons, urlScore: x.urlRules && x.urlRules.score, domReasons,
      strictLookalike: true, corroborated: lookalikeCorroborated(x, v, urlReasons, domReasons),
      hasPasswordField: !!(sg.hasVisiblePasswordField || sg.hasVisibleCardInput), hasLoginPair: sg.hasLoginPair, popular: x.popular, host: x.host
    });
    if (credFlags.length && v.suppressed !== 'engagement') {
      const next = Object.assign({}, v, { flags: credFlags.concat((v.flags || []).filter((f) => !credFlags.includes(f))) });
      if (credFlags.some((f) => LIFT_FLAGS.includes(f)) && next.level === 'safe') {
        const have = new Set((next.reasons || []).map((r) => r && r.code));
        const add = urlReasons.concat(domReasons).filter((r) => r && !have.has(r.code) && (isLookalikeReason(r) || r.code === 'noHttps' || r.code === 'credentialFormOnTenantHost'));
        next.level = 'suspicious';
        next.score = Math.max(next.score || 0, (C.THRESHOLDS && C.THRESHOLDS.suspicious) || 0.5);
        next.reasons = add.concat(next.reasons || []);
        next.reasonCodes = add.map((r) => r.code).concat(next.reasonCodes || []);
      }
      v = next;
    }
    if (nrdBrandHost(v, urlReasons, x) && !(v.flags || []).includes('nrd-brand-host')) {
      v = Object.assign({}, v, { flags: ['nrd-brand-host'].concat(v.flags || []) });
    }
    const tier = surfaceTier(v, { popular: x.popular, strictMode: x.strictMode === true, isTop: x.isTop, host: x.host });
    return { verdict: v, tier };
  }


  // (0.15.0) SERP dots only on a real results page: Gmail, Docs, Maps and News on google.* are not result lists.
  const SERP_HOST = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org)$/i;
  function isSerpPage(hostname, pathname, search) {
    const h = String(hostname || '').toLowerCase(), p = String(pathname || '/'), q = String(search || '');
    if (!SERP_HOST.test(h)) return false;
    if (/(^|\.)duckduckgo\.com$/.test(h)) return (p === '/' || p === '/html' || p === '/html/') && /[?&]q=[^&]/.test(q);
    if (/^(mail|docs|maps|news)\./.test(h)) return false;
    return p === '/search';
  }

  return { isSerpPage, SERP_HOST, surfaceTier, finalizeVerdict, isUserContentHost, isPathUserContentHost, popularMode, effectivePopular, credentialFlags, isLocalOrIpHost, isLookalikeReason, STOP_FLAGS, CONFIDENT_FLAGS, CREDENTIAL_FLAGS, USER_CONTENT_HOSTS };
});
