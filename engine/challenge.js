// engine/challenge.js — bot-challenge page recogniser (0.15.0).
// DataDome / PerimeterX / Cloudflare / Akamai / hCaptcha / reCAPTCHA interstitials
// ("unusual activity from your device", hidden verification iframe) looked like
// scam pages and warned users on ordinary shops. Pure: the content script only
// extracts the features, this decides.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const CHALLENGE_WORDING = /just a moment|checking your browser|verify you are (a )?human|verify you're (a )?human|press\s*(&|and)\s*hold|unusual activity from your|access to this page has been denied|please verify you are a human|are you a robot|attention required/i;
  // Challenge vendors' own frame/script hosts (google.com/recaptcha is matched by path).
  const CHALLENGE_HOST_RE = /(^|[./])(captcha-delivery\.com|px-cdn\.net|perimeterx\.net|challenges\.cloudflare\.com|hcaptcha\.com)(\/|$|:)|google\.com\/recaptcha/i;
  const SHORT_BODY = 600;

  // features: { title, textSample (short visible text), bodyTextLength,
  //             frameHosts: iframe/script src hosts (host or host+path strings) }
  function isChallengePage(features) {
    const f = features || {};
    const words = String(f.title || '') + ' ' + String(f.textSample || '');
    if (!CHALLENGE_WORDING.test(words)) return false;
    const frames = Array.isArray(f.frameHosts) ? f.frameHosts : [];
    if (frames.some((h) => CHALLENGE_HOST_RE.test(String(h || '')))) return true;
    return typeof f.bodyTextLength === 'number' && f.bodyTextLength < SHORT_BODY;
  }

  return { isChallengePage, CHALLENGE_WORDING, CHALLENGE_HOST_RE };
});
