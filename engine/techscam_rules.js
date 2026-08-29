(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const SCARE_PHRASES = [
    'your computer has been blocked', 'your computer is infected',
    'do not turn off', 'do not restart', 'do not close this window',
    'windows defender alert', 'security alert', 'virus detected',
    'call microsoft', 'call apple support', 'call support', 'contact support immediately',
    'your account has been hacked', 'suspicious activity detected on your device',
    'error # ', 'license has expired'
  ];
  // Toll-free / "call now" phone patterns.
  const PHONE_RE = /(\+?\d[\d\-\s().]{7,}\d)/;
  const TOLLFREE_RE = /\b(1[-\s]?)?(800|888|877|866|855|844|833)[-\s]?\d{3}[-\s]?\d{4}\b/;

  // OS / security vendor brand tokens for the decisive discriminator below.
  const OS_BRAND_RE = /\b(microsoft|windows(\s+defender)?|apple|mac\s?os|icloud|mcafee|norton|google\s+(chrome|security))\b/i;

  function scoreTechScam(input) {
    const s = input || {};
    const text = String(s.text || '').toLowerCase();
    const reasons = [];
    const flags = [];
    let score = 0;

    const hits = SCARE_PHRASES.filter((p) => text.includes(p));
    if (hits.length) {
      score += Math.min(0.6, 0.25 * hits.length);
      reasons.push({ code: 'techScamScareText', kind: 'techscam', params: [hits[0]] });
    }
    const hasTollFree = s.hasTollFree != null ? !!s.hasTollFree : TOLLFREE_RE.test(text);
    const hasPhone = hasTollFree || (hits.length && PHONE_RE.test(text));
    if (hasPhone) {
      score += 0.3;
      reasons.push({ code: 'techScamPhoneAsk', kind: 'techscam' });
    }
    // Decisive discriminator (0.6.0): a phone number inside a security-alert
    // page that name-drops an OS/security vendor. Microsoft, Apple and Google
    // never put phone numbers in browser warnings, and vendor-owned domains
    // are excluded upstream by the trusted-host gate — near-zero FP.
    if (hasPhone && hits.length && OS_BRAND_RE.test(text)) {
      score = Math.max(score, 0.85);
      flags.push('fake-alert-phone');
      reasons.push({ code: 'techScamFakeAlert', kind: 'techscam' });
    }
    if (s.fullscreenOnLoad) {
      score += 0.2;
      reasons.push({ code: 'techScamFullscreen', kind: 'techscam' });
    }
    if (s.alarmAudio) {
      score += 0.2;
      reasons.push({ code: 'techScamAlarmAudio', kind: 'techscam' });
    }
    const flood = s.dialogFloodCount || 0;
    if (flood >= 5) { score += 0.25; reasons.push({ code: 'techScamDialogFlood', kind: 'techscam' }); }
    else if (flood >= 2) { score += 0.1; }
    if (s.historyTrap) { score += 0.15; reasons.push({ code: 'techScamHistoryTrap', kind: 'techscam' }); }

    return { score: Math.max(0, Math.min(1, score)), reasons, flags };
  }

  return { scoreTechScam };
});
