(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
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

  function scoreTechScam(input) {
    const s = input || {};
    const text = String(s.text || '').toLowerCase();
    const reasons = [];
    let score = 0;

    const hits = SCARE_PHRASES.filter((p) => text.includes(p));
    if (hits.length) {
      score += Math.min(0.6, 0.25 * hits.length);
      reasons.push('Page uses fake security-alert language ("' + hits[0] + '").');
    }
    const hasTollFree = s.hasTollFree != null ? !!s.hasTollFree : TOLLFREE_RE.test(text);
    if (hasTollFree || (hits.length && PHONE_RE.test(text))) {
      score += 0.3;
      reasons.push('Page urges you to call a phone number for "support" — a hallmark of tech-support scams.');
    }
    if (s.fullscreenOnLoad) {
      score += 0.2;
      reasons.push('Page forced fullscreen to make itself hard to close.');
    }
    const flood = s.dialogFloodCount || 0;
    if (flood >= 5) { score += 0.25; reasons.push('Page spammed pop-up dialogs to trap you.'); }
    else if (flood >= 2) { score += 0.1; }
    if (s.historyTrap) { score += 0.15; reasons.push('Page is hijacking your Back button.'); }

    return { score: Math.max(0, Math.min(1, score)), reasons };
  }

  return { scoreTechScam };
});
