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

  const THRESHOLDS = { suspicious: 0.5, dangerous: 0.8 };

  const POPULAR_BRANDS = [
    'paypal', 'google', 'apple', 'microsoft', 'amazon', 'facebook',
    'instagram', 'netflix', 'whatsapp', 'binance', 'coinbase', 'metamask',
    'dbs', 'maybank', 'wise', 'revolut', 'linkedin', 'outlook', 'gmail'
  ];

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
  const BRAND_DOMAINS = {
    paypal: ['paypal.com'], google: ['google.com', 'gmail.com', 'youtube.com'],
    apple: ['apple.com', 'icloud.com'],
    microsoft: ['microsoft.com', 'live.com', 'office.com', 'outlook.com',
      'microsoftonline.com', 'office365.com', 'azure.com', 'sharepoint.com'],
    amazon: ['amazon.com', 'amazon.ae', 'amazon.co.uk', 'amazon.de', 'amazon.fr',
      'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.ca', 'amazon.in', 'amazon.sg',
      'amazon.sa', 'amazon.eg', 'amazon.com.au', 'amazon.com.br', 'amazon.com.mx',
      'amazon.com.tr', 'amazon.co.jp', 'primevideo.com', 'media-amazon.com'],
    facebook: ['facebook.com'], instagram: ['instagram.com'],
    whatsapp: ['whatsapp.com'], netflix: ['netflix.com'], binance: ['binance.com'],
    coinbase: ['coinbase.com'], metamask: ['metamask.io'], dbs: ['dbs.com.sg'],
    maybank: ['maybank2u.com.my', 'maybank.com'], wise: ['wise.com'], revolut: ['revolut.com'],
    linkedin: ['linkedin.com'], outlook: ['outlook.com', 'live.com'], gmail: ['gmail.com', 'google.com']
  };
  // Every registrable domain a known brand legitimately controls (flattened).
  const KNOWN_BRAND_REGISTRABLES = [...new Set(Object.values(BRAND_DOMAINS).flat())];

  function isSafeHost(host) {
    const h = String(host || '').toLowerCase();
    return SAFE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
  }
  // Phrases that indicate a wallet recovery-phrase harvesting attempt.
  const SEED_PHRASE_HINTS = ['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key'];

  return {
    FEATURE_NAMES, THRESHOLDS, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS,
    SCAM_PHRASES, SAFE_DOMAINS, BRAND_DOMAINS, SEED_PHRASE_HINTS,
    MULTI_LABEL_SUFFIXES, KNOWN_AUTH_PROVIDERS, KNOWN_BRAND_REGISTRABLES,
    registrableParts, registrableDomain, isSafeHost
  };
});
