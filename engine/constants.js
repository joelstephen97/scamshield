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
    'ml', 'ga', 'work', 'support', 'rest', 'country', 'kim'
  ];

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

  return { FEATURE_NAMES, THRESHOLDS, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS, SCAM_PHRASES };
});
