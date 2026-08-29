(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // ORDER IS LAW. features.js and model/train.py must emit in this order.
  const FEATURE_NAMES = [
    'url_length', 'host_length', 'path_length', 'num_dots_host',
    'num_subdomains', 'num_hyphens_host', 'num_digits_host', 'digit_ratio_host',
    'has_at_symbol', 'has_ip_host', 'has_punycode', 'is_https',
    'num_query_params', 'suspicious_tld', 'suspicious_token_count',
    'host_entropy', 'brand_lookalike'
  ];

  const THRESHOLDS = { suspicious: 0.5, dangerous: 0.8,
    // contentSuspicious is a default only; the shipped page model's
    // `thresholds.suspicious` (0.80) takes precedence at runtime.
    contentSuspicious: 0.9, contentCorroborateRule: 0.3, contentCorroborateModel: 0.7,
    // iconHamming lowered 6 -> 4 (v0.5.0 fix wave): tools/measure-icon-fp.js
    // against 88 real Tranco sites measured a 2.74% false-positive rate at
    // maxDist=6 (> the 1% bar) — see model/README.md / final-fix-report.md
    // for the measurement. Re-measured at maxDist=4 before shipping.
    contentCorroborateModelMinRule: 0.15, iconHamming: 4 };

  // key, display names (word-boundary matched when nameMatch), legit registrable domains (incl. auth), nameMatch,
  // display (canonical mixed-case name for UI; falls back to title-cased names[0], then key)
  const B = (key, names, domains, nameMatch = true, display) => ({ key, names, domains, nameMatch, display });
  const BRANDS = [
    B('paypal', ['paypal'], ['paypal.com'], true, 'PayPal'),
    B('google', ['google', 'gmail', 'youtube'], ['google.com', 'gmail.com', 'youtube.com', 'googleapis.com', 'gstatic.com']),
    B('apple', ['apple', 'icloud', 'apple id'], ['apple.com', 'icloud.com']),
    B('microsoft', ['microsoft', 'office 365', 'onedrive', 'sharepoint', 'microsoft azure'], ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'microsoftonline.com', 'office365.com', 'azure.com', 'sharepoint.com', 'onedrive.com', 'msftauth.net', 'msauth.net', 'hotmail.com']),
    B('amazon', ['amazon', 'prime video'], ['amazon.com', 'amazon.ae', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.ca', 'amazon.in', 'amazon.sg', 'amazon.sa', 'amazon.eg', 'amazon.com.au', 'amazon.com.br', 'amazon.com.mx', 'amazon.com.tr', 'amazon.co.jp', 'primevideo.com', 'media-amazon.com']),
    B('facebook', ['facebook', 'meta platforms'], ['facebook.com', 'fb.com', 'fbcdn.net']),
    B('instagram', ['instagram'], ['instagram.com', 'cdninstagram.com']),
    B('netflix', ['netflix'], ['netflix.com', 'nflxext.com']),
    B('whatsapp', ['whatsapp'], ['whatsapp.com', 'whatsapp.net'], true, 'WhatsApp'),
    B('binance', ['binance'], ['binance.com']),
    B('coinbase', ['coinbase'], ['coinbase.com']),
    B('metamask', ['metamask'], ['metamask.io'], true, 'MetaMask'),
    B('dbs', ['dbs bank', 'posb'], ['dbs.com.sg', 'dbs.com', 'posb.com.sg'], false, 'DBS Bank'),
    B('maybank', ['maybank'], ['maybank2u.com.my', 'maybank.com']),
    B('wise', ['wise'], ['wise.com'], false),
    B('revolut', ['revolut'], ['revolut.com']),
    B('linkedin', ['linkedin'], ['linkedin.com', 'licdn.com'], true, 'LinkedIn'),
    B('outlook', ['outlook', 'hotmail'], ['outlook.com', 'live.com', 'hotmail.com']),
    B('gmail', ['gmail'], ['gmail.com', 'google.com']),
    B('telegram', ['telegram'], ['telegram.org', 'telegram.me', 't.me']),
    B('steam', ['steam'], ['steampowered.com', 'steamcommunity.com'], false),
    B('roblox', ['roblox'], ['roblox.com', 'rbxcdn.com']),
    B('dhl', ['dhl'], ['dhl.com', 'dhl.de'], true, 'DHL'),
    B('fedex', ['fedex'], ['fedex.com'], true, 'FedEx'),
    B('usps', ['usps'], ['usps.com'], true, 'USPS'),
    B('ups', ['ups'], ['ups.com'], false, 'UPS'),
    B('docusign', ['docusign'], ['docusign.com', 'docusign.net'], true, 'DocuSign'),
    B('dropbox', ['dropbox'], ['dropbox.com']),
    B('adobe', ['adobe'], ['adobe.com', 'adobelogin.com']),
    B('spotify', ['spotify'], ['spotify.com', 'scdn.co']),
    B('chase', ['chase bank', 'jpmorgan'], ['chase.com', 'jpmorgan.com'], false),
    B('wellsfargo', ['wells fargo'], ['wellsfargo.com'], true, 'Wells Fargo'),
    B('bankofamerica', ['bank of america'], ['bankofamerica.com', 'bofa.com'], true, 'Bank of America'),
    B('citi', ['citibank'], ['citi.com', 'citibank.com', 'citibank.ae']),
    B('hsbc', ['hsbc'], ['hsbc.com', 'hsbc.ae', 'hsbc.co.uk', 'hsbc.com.sg', 'hsbc.com.hk'], true, 'HSBC'),
    B('barclays', ['barclays'], ['barclays.co.uk', 'barclays.com']),
    B('santander', ['santander'], ['santander.com', 'santander.co.uk', 'santander.es']),
    B('ing', ['ing bank'], ['ing.com', 'ing.nl', 'ing.be'], false),
    B('sbi', ['state bank of india', 'onlinesbi'], ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com'], true, 'SBI'),
    B('hdfc', ['hdfc'], ['hdfcbank.com', 'hdfc.com'], true, 'HDFC Bank'),
    B('icici', ['icici'], ['icicibank.com'], true, 'ICICI Bank'),
    B('emiratesnbd', ['emirates nbd'], ['emiratesnbd.com'], true, 'Emirates NBD'),
    B('adcb', ['adcb'], ['adcb.com'], true, 'ADCB'),
    B('fab', ['first abu dhabi bank'], ['bankfab.com', 'fab.ae'], false, 'FAB'),
    B('mashreq', ['mashreq'], ['mashreq.com', 'mashreqbank.com']),
    B('rakbank', ['rakbank'], ['rakbank.ae'], true, 'RAKBANK'),
    B('dib', ['dubai islamic bank'], ['dib.ae'], false, 'DIB'),
    B('etisalat', ['etisalat', 'e& uae'], ['etisalat.ae', 'eand.com', 'eandme.ae']),
    B('du', ['du telecom'], ['du.ae'], false),
    B('noon', ['noon.com'], ['noon.com'], false),
    B('aramex', ['aramex'], ['aramex.com']),
    B('royalmail', ['royal mail'], ['royalmail.com'], true, 'Royal Mail'),
    B('evri', ['evri'], ['evri.com'], true, 'Evri'),
    B('emiratespost', ['emirates post'], ['emiratespost.ae', 'epg.gov.ae'], true, 'Emirates Post'),
    B('dpd', ['dpd'], ['dpd.com', 'dpd.co.uk', 'dpd.de'], true, 'DPD'),
    B('talabat', ['talabat'], ['talabat.com']),
    B('careem', ['careem'], ['careem.com']),
    B('adnoc', ['adnoc'], ['adnoc.ae', 'adnocdistribution.ae'], true, 'ADNOC'),
    B('dewa', ['dewa'], ['dewa.gov.ae'], true, 'DEWA'),
    B('icp', ['icp uae', 'federal authority for identity'], ['icp.gov.ae'], false, 'ICP'),
    B('mohre', ['mohre'], ['mohre.gov.ae'], true, 'MOHRE'),
    B('dubaipolice', ['dubai police'], ['dubaipolice.gov.ae']),
    B('uaepass', ['uae pass', 'uaepass'], ['uaepass.ae'], true, 'UAE PASS'),
    B('emirates', ['emirates airline', 'fly emirates'], ['emirates.com'], false),
    B('etihad', ['etihad'], ['etihad.com']),
    B('shopee', ['shopee'], ['shopee.sg', 'shopee.com.my', 'shopee.co.id', 'shopee.ph', 'shopee.com']),
    B('lazada', ['lazada'], ['lazada.sg', 'lazada.com.my', 'lazada.com', 'lazada.co.th']),
    B('grab', ['grab'], ['grab.com'], false)
  ];
  const ORIGINAL_19 = ['paypal', 'google', 'apple', 'microsoft', 'amazon', 'facebook', 'instagram', 'netflix',
    'whatsapp', 'binance', 'coinbase', 'metamask', 'dbs', 'maybank', 'wise', 'revolut', 'linkedin', 'outlook', 'gmail'];
  // URL lookalike matching (features.js) keeps the original 19 exactly — behaviour floor.
  const POPULAR_BRANDS = ORIGINAL_19;
  const NAME_RES = BRANDS.filter((b) => b.nameMatch).map((b) => [b.key,
    new RegExp('(^|[^a-z0-9])(' + b.names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\-]?')).join('|') + ')([^a-z0-9]|$)', 'i')]);
  function brandNameIn(text) {
    const t = String(text || '');
    for (const [key, re] of NAME_RES) if (re.test(t)) return key;
    return null;
  }

  // High-abuse TLDs (no leading dot).
  const SUSPICIOUS_TLDS = [
    'zip', 'mov', 'xyz', 'top', 'club', 'click', 'link', 'gq', 'cf', 'tk',
    'ml', 'ga', 'work', 'support', 'rest', 'country', 'kim',
    'pw', 'cc', 'ws', 'icu', 'buzz'
  ];

  // Two-label public suffixes (subset of the PSL covering the ccTLDs our users
  // and target brands actually live on). Hosts on suffixes missing from this
  // list degrade to plain last-two-label parsing — same as pre-0.3.1, never worse.
  const MULTI_LABEL_SUFFIXES = [
    'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'ac.uk', 'gov.uk', 'sch.uk', 'nhs.uk',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'com.sg', 'edu.sg', 'gov.sg', 'net.sg', 'org.sg',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
    'com.my', 'net.my', 'org.my', 'edu.my', 'gov.my',
    'co.in', 'net.in', 'org.in', 'ac.in', 'edu.in', 'gov.in', 'res.in',
    'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
    'com.mx', 'org.mx', 'gob.mx', 'edu.mx',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
    'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
    'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk',
    'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr',
    'com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw',
    'co.za', 'net.za', 'org.za', 'gov.za', 'ac.za',
    'com.ar', 'net.ar', 'org.ar', 'gob.ar', 'edu.ar',
    'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa',
    'com.eg', 'net.eg', 'org.eg', 'gov.eg', 'edu.eg',
    'co.th', 'in.th', 'or.th', 'ac.th', 'go.th',
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
    'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn',
    'co.id', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
    'com.pk', 'com.bd', 'com.ng', 'co.ke',
    'co.il', 'org.il', 'ac.il', 'gov.il',
    'com.ua', 'com.co', 'com.pe', 'com.cl', 'com.ec', 'com.uy',
    'com.ve', 'co.ve', 'com.do', 'com.gt', 'co.cr', 'com.pa', 'com.py', 'com.bo',
    'com.kw', 'com.qa', 'com.bh', 'com.om', 'com.jo', 'com.lb',
    'com.lk', 'com.np', 'com.kh', 'com.mm'
  ];
  const MULTI_LABEL_SUFFIX_SET = new Set(MULTI_LABEL_SUFFIXES);
  const IP4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

  // Canonical approximate eTLD+1 split. The single implementation shared by
  // engine, content scripts, and popup — do not re-implement elsewhere.
  function registrableParts(host) {
    const h = String(host || '').toLowerCase().replace(/\.+$/, '');
    const labels = h.split('.').filter(Boolean);
    if (IP4_RE.test(h) || labels.length <= 1) return { domain: h, sld: h, suffix: '' };
    const lastTwo = labels.slice(-2).join('.');
    if (MULTI_LABEL_SUFFIX_SET.has(lastTwo) && labels.length >= 3) {
      return { domain: labels.slice(-3).join('.'), sld: labels[labels.length - 3], suffix: lastTwo };
    }
    return { domain: lastTwo, sld: labels[labels.length - 2], suffix: labels[labels.length - 1] };
  }
  function registrableDomain(host) { return registrableParts(host).domain; }

  const SUSPICIOUS_TOKENS = [
    'login', 'signin', 'verify', 'verification', 'account', 'secure',
    'update', 'confirm', 'bank', 'wallet', 'free', 'win', 'winner', 'gift',
    'prize', 'bonus', 'claim', 'unlock', 'suspended', 'limited', 'security'
  ];

  const SCAM_PHRASES = [
    'you won', 'you have won', 'congratulations you', 'claim your prize',
    'you have been selected', 'free gift', 'crypto giveaway', 'double your',
    'risk-free investment', 'act now', 'verify your account', 'account suspended',
    'unusual activity', 'confirm your identity'
  ];

  // Very-high-traffic legitimate sites; we skip warnings on these to avoid
  // embarrassing false positives. NOT a security boundary — just FP control.
  // Matched by exact host or any subdomain (host.endsWith('.' + d)), so
  // multi-label suffixes like dbs.com.sg work without eTLD parsing.
  const SAFE_DOMAINS = [
    'google.com', 'youtube.com', 'gmail.com', 'facebook.com', 'instagram.com',
    'whatsapp.com', 'microsoft.com', 'live.com', 'office.com', 'outlook.com',
    'apple.com', 'icloud.com', 'amazon.com', 'netflix.com', 'linkedin.com',
    'github.com', 'wikipedia.org', 'x.com', 'twitter.com', 'reddit.com',
    'paypal.com', 'binance.com', 'coinbase.com', 'cloudflare.com', 'mozilla.org',
    'dbs.com.sg', 'maybank2u.com.my', 'wise.com', 'revolut.com',
    'discord.com', 'spotify.com', 'tiktok.com', 'shopee.sg', 'lazada.sg',
    'grab.com', 'metamask.io', 'opensea.io', 'etherscan.io',
    // Regional brand storefronts + brand-controlled infra. NEVER add shared
    // hosting infra here (amazonaws.com, azurewebsites.net, googleusercontent.com,
    // windows.net) — those hosts serve arbitrary attacker content.
    'amazon.ae', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it',
    'amazon.es', 'amazon.nl', 'amazon.ca', 'amazon.in', 'amazon.sg',
    'amazon.sa', 'amazon.eg', 'amazon.com.au', 'amazon.com.br',
    'amazon.com.mx', 'amazon.com.tr', 'amazon.co.jp', 'primevideo.com',
    'google.co.uk', 'google.de', 'google.fr', 'google.ae', 'google.com.sg',
    'google.com.au', 'google.co.in', 'google.co.jp', 'google.ca', 'google.com.br',
    'microsoftonline.com', 'office365.com', 'azure.com', 'sharepoint.com'
  ];

  // SSO / identity providers that legitimate sites post credential forms to.
  // A password form whose action targets one of these registrable domains is
  // normal federated login, not credential exfiltration.
  const KNOWN_AUTH_PROVIDERS = [
    'google.com', 'microsoftonline.com', 'microsoft.com', 'live.com',
    'apple.com', 'facebook.com', 'github.com', 'linkedin.com',
    'okta.com', 'auth0.com', 'onelogin.com', 'pingidentity.com',
    'duosecurity.com', 'salesforce.com', 'amazon.com', 'paypal.com'
  ];

  // Known legitimate domains per brand (registrable form). If a page *names* a
  // brand but its domain is not in that brand's list, it's likely impersonation.
  const BRAND_DOMAINS = Object.fromEntries(BRANDS.map((b) => [b.key, b.domains]));
  // Every registrable domain a known brand legitimately controls (flattened).
  const KNOWN_BRAND_REGISTRABLES = [...new Set(Object.values(BRAND_DOMAINS).flat())];

  const BRANDS_BY_KEY = Object.fromEntries(BRANDS.map((b) => [b.key, b]));
  function titleCase(s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }
  // Canonical mixed-case brand name for UI. Explicit `display` wins; falls
  // back to a title-cased names[0], then the raw key.
  function brandDisplayName(key) {
    const b = BRANDS_BY_KEY[key];
    if (!b) return key;
    if (b.display) return b.display;
    if (b.names && b.names[0]) return titleCase(b.names[0]);
    return b.key;
  }

  function isSafeHost(host) {
    const h = String(host || '').toLowerCase();
    return SAFE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
  }
  // Phrases that indicate a wallet recovery-phrase harvesting attempt.
  const SEED_PHRASE_HINTS = ['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key'];

  // Parcel carriers (0.6.0): brands whose impersonation pattern is a card-fee
  // form rather than a password form — drives the delivery-fee-scam rule.
  const CARRIER_BRANDS = ['dhl', 'fedex', 'usps', 'ups', 'aramex', 'royalmail', 'evri', 'emiratespost', 'dpd'];

  // SERP redirect-wrapper hosts (0.10.0, Task C1): search engines that route
  // an organic/sponsored result through a same-origin tracking redirect
  // before the real destination, keyed on the query param(s) that carry it.
  // Pure string/URL parsing only — no network fetch, no DOM — so the SERP
  // badge annotator (content/content_script.js) can unwrap a result href
  // before taking its registrable domain, and this stays unit-testable here
  // like every other constants.js helper.
  // `path` scopes the unwrap to the actual redirect endpoint — e.g. Google's
  // own /maps or /search also carry a "q" parameter that means something
  // else entirely, so only /url and /aclk (its ad-click redirect) qualify.
  const SERP_REDIRECT_HOSTS = [
    { re: /(^|\.)google\.[a-z.]+$/i, path: /^\/(url|aclk)$/, params: ['q', 'url', 'adurl'] },
    { re: /(^|\.)bing\.com$/i, path: /^\/aclick$/, params: ['u'] },
    { re: /(^|\.)duckduckgo\.com$/i, path: /^\/y\.js$/, params: ['uddg'] }
  ];
  function unwrapSerpRedirect(href, baseHref) {
    if (!href) return null;
    let u;
    try { u = new URL(href, baseHref); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    const entry = SERP_REDIRECT_HOSTS.find((e) => e.re.test(host) && e.path.test(u.pathname));
    if (entry) {
      for (const p of entry.params) {
        const wrapped = u.searchParams.get(p);
        if (!wrapped) continue;
        try {
          const w = new URL(wrapped, baseHref);
          if (/^https?:$/.test(w.protocol)) return w.href;
        } catch (_) { /* not a real wrapped URL — fall through */ }
      }
    }
    return u.href;
  }

  // Unique, insertion-ordered, bounded — the SERP badge annotator's own
  // "hard cap the work" requirement, and generic enough for any other caller
  // that wants to dedup a list without an unbounded scan.
  function dedupeCapped(list, cap) {
    const seen = new Set();
    const out = [];
    for (const item of (list || [])) {
      if (item == null || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
      if (out.length >= cap) break;
    }
    return out;
  }

  return {
    FEATURE_NAMES, THRESHOLDS, BRANDS, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS,
    SCAM_PHRASES, SAFE_DOMAINS, BRAND_DOMAINS, SEED_PHRASE_HINTS, CARRIER_BRANDS,
    MULTI_LABEL_SUFFIXES, KNOWN_AUTH_PROVIDERS, KNOWN_BRAND_REGISTRABLES,
    registrableParts, registrableDomain, isSafeHost, brandNameIn, brandDisplayName,
    unwrapSerpRedirect, dedupeCapped
  };
});
