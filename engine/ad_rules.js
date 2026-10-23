// engine/ad_rules.js — pure rules for hiding SCAM ads (0.15.0, Task 17a). Not an ad blocker: an ad is touched
// only when it leads to a listed/risky site or its own text carries two independent scam patterns.
// No DOM, no chrome.*: content/adguard.js wires these to the page. UMD like the other engine files.
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(req ? require('./constants') : root.ScamShield, req ? require('./linkguard_rules') : root.ScamShield && root.ScamShield.linkRules);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, { adRules: mod });
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, L) {
  'use strict';

  // Ad-slot containers of the big networks. Nothing here matches ordinary page content.
  const AD_SELECTOR = [
    'ins.adsbygoogle', 'iframe[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]',
    '.trc_rbox_container', '.trc_related_container',
    '.OUTBRAIN', '.ob-widget',
    '[id^="mgid"]', '.mgbox',
    '.rc-widget',
    '[aria-label="Advertisement" i]', '[data-ad-slot]'
  ].join(',');

  // The generic selectors also match ordinary page wrappers, so they get a stricter text cap (see tooBigForAd).
  const AD_GENERIC_SELECTOR = '[aria-label="Advertisement" i],[data-ad-slot]';
  const AD_SPECIFIC_SELECTOR = AD_SELECTOR.split(',').filter((x) => x !== '[data-ad-slot]' && x !== '[aria-label="Advertisement" i]').join(',');
  // What an ad container must NOT contain (it is page content then) and its largest plausible size.
  const CONTENT_SELECTOR = 'article,main,h1,form,[role="main"],[role="article"]';
  const MAX_AD_HEIGHT = 1000, MAX_AD_VIEWPORT_SHARE = 0.6, MAX_GENERIC_TEXT = 600;
  // rect: {width, height}; vw/vh: viewport. generic: matched ONLY by a generic selector.
  function tooBigForAd(rect, vw, vh, generic, textLength) {
    if (!rect) return true;
    if (rect.height > MAX_AD_HEIGHT) return true;
    if (vw > 0 && vh > 0 && rect.width * rect.height > MAX_AD_VIEWPORT_SHARE * vw * vh) return true;
    if (generic && textLength > MAX_GENERIC_TEXT) return true;
    return false;
  }

  // Each pattern is a list of alternatives, or (celebrity-crypto) an all-of pair. Matching goes through
  // matchScamPhrases (word boundaries, apostrophe-aware), so "you won't" is not "you won". A pattern counts
  // once however often it repeats; a container needs two DIFFERENT patterns.
  const CELEBRITIES = ['elon musk', 'mark cuban', 'jeff bezos', 'bill gates', 'richard branson', 'warren buffett', 'shark tank', 'dragons den', "dragons' den", 'endorsed by', 'celebrity', 'celebrities'];
  const SCAM_AD_PATTERNS = [
    { id: 'celebrity-crypto', all: [['bitcoin'], CELEBRITIES] },
    { id: 'virus-detected', any: ['virus detected'] },
    { id: 'computer-infected', any: ['your computer is infected'] },
    { id: 'you-won', any: ['you won'] },
    { id: 'claim-prize', any: ['claim your prize'] },
    { id: 'miracle-cure', any: ['miracle cure'] },
    { id: 'doctors-hate', any: ['doctors hate'] },
    { id: 'guaranteed-returns', any: ['guaranteed returns'] },
    { id: 'double-money', any: ['double your money'] }
  ];
  const hit = (text, list) => C.matchScamPhrases(text, list).length > 0;
  function matchedPatterns(text) {
    const t = String(text || '');
    if (!t) return [];
    return SCAM_AD_PATTERNS.filter((p) => p.all ? p.all.every((l) => hit(t, l)) : hit(t, p.any)).map((p) => p.id);
  }
  function scamAdTextHit(text) { return matchedPatterns(text).length >= 2; }

  // Ad-click trackers whose plain `url=` parameter is the landing page. adurl= / clickurl= are distinctive
  // enough to unwrap on any host; a bare url= is only trusted on these.
  const AD_CLICK_HOSTS = /(^|\.)(googleadservices\.com|doubleclick\.net|googlesyndication\.com|taboola\.com|outbrain\.com|mgid\.com|revcontent\.com|adnxs\.com)$/i;
  function adDestination(href, baseHref, pageHost) {
    if (!href || typeof href !== 'string') return null;
    let u;
    try { u = new URL(href, baseHref); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    let inner = u.searchParams.get('adurl') || u.searchParams.get('clickurl');
    if (!inner && AD_CLICK_HOSTS.test(u.hostname)) inner = u.searchParams.get('url');
    return L.destination(inner || u.href, baseHref, pageHost);
  }

  // levels: link-guard levels ('block'|'warn'|null) of the container's destinations.
  function shouldCollapse(input) {
    if (!input) return false;
    const levels = Array.isArray(input.levels) ? input.levels : [];
    if (levels.some((l) => l === 'block' || l === 'warn')) return true;
    return scamAdTextHit(input.text);
  }

  // Standard display sizes (IAB), with a few px of slack for borders.
  const AD_SIZES = [[300, 250], [336, 280], [728, 90], [970, 90], [970, 250], [320, 50], [320, 100], [300, 600], [160, 600], [120, 600], [468, 60], [250, 250], [200, 200], [300, 50], [300, 100], [980, 120], [930, 180], [580, 400]];
  function isAdSized(w, h) {
    if (!(w > 0) || !(h > 0)) return false;
    return AD_SIZES.some((s) => Math.abs(s[0] - w) <= 6 && Math.abs(s[1] - h) <= 6);
  }

  return { AD_GENERIC_SELECTOR, AD_SPECIFIC_SELECTOR, CONTENT_SELECTOR, tooBigForAd, AD_SELECTOR, SCAM_AD_PATTERNS, matchedPatterns, scamAdTextHit, adDestination, shouldCollapse, isAdSized, AD_SIZES };
});
