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
    'grab.com', 'metamask.io', 'opensea.io', 'etherscan.io'
  ];

  // Known legitimate domains per brand (registrable form). If a page *names* a
  // brand but its domain is not in that brand's list, it's likely impersonation.
  const BRAND_DOMAINS = {
    paypal: ['paypal.com'], google: ['google.com', 'gmail.com', 'youtube.com'],
    apple: ['apple.com', 'icloud.com'], microsoft: ['microsoft.com', 'live.com', 'office.com', 'outlook.com'],
    amazon: ['amazon.com'], facebook: ['facebook.com'], instagram: ['instagram.com'],
    whatsapp: ['whatsapp.com'], netflix: ['netflix.com'], binance: ['binance.com'],
    coinbase: ['coinbase.com'], metamask: ['metamask.io'], dbs: ['dbs.com.sg'],
    maybank: ['maybank2u.com.my', 'maybank.com'], wise: ['wise.com'], revolut: ['revolut.com'],
    linkedin: ['linkedin.com'], outlook: ['outlook.com', 'live.com'], gmail: ['gmail.com', 'google.com']
  };
  // Phrases that indicate a wallet recovery-phrase harvesting attempt.
  const SEED_PHRASE_HINTS = ['recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic', 'private key'];

  return { FEATURE_NAMES, THRESHOLDS, POPULAR_BRANDS, SUSPICIOUS_TLDS, SUSPICIOUS_TOKENS, SCAM_PHRASES, SAFE_DOMAINS, BRAND_DOMAINS, SEED_PHRASE_HINTS };
});
