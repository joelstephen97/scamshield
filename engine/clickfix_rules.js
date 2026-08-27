(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // ClickFix / fake-CAPTCHA detection (0.6.0). The attack: a fake "verify you
  // are human" widget copies a PowerShell/mshta one-liner to the clipboard and
  // instructs the user to press Win+R then Ctrl+V. Microsoft tracked ClickFix
  // as the initial access method in ~47% of 2025 intrusions. Signals are two
  // independent families — the social-engineering INSTRUCTIONS in page text,
  // and the clipboard PAYLOAD (from clipboard_rules) — so the decisive verdict
  // needs both, or the complete three-part instruction cluster.
  const WIN_RUN_RE = /\b(win(dows)?(\s*(key|logo))?\s*(\+|plus|and|,)\s*r)\b|⊞\s*(\+|plus)?\s*r\b/i;
  const PASTE_RE = /\bctrl\s*(\+|plus|and|,)\s*v\b|\bpaste\s+(it|this|the (command|code|text))\b/i;
  const RUN_TARGET_RE = /\b(run\s+(dialog|box|window|command|prompt)|powershell|windows\s+terminal|command\s+prompt|cmd(\.exe)?\b)/i;
  const CAPTCHA_RE = /\b(verify\s+(that\s+)?you\s*('?re|\s*are)\s+(a\s+)?human|i\s*('?m|\s*am)\s+not\s+a\s+robot|robot\s+verification|human\s+verification|verification\s+(step|required|id)|captcha)\b/i;

  function scoreClickFix(input) {
    const s = input || {};
    const text = String(s.text || '');
    const reasons = [];
    const flags = [];
    const winRun = WIN_RUN_RE.test(text);
    const paste = PASTE_RE.test(text);
    const runTarget = RUN_TARGET_RE.test(text);
    const captcha = CAPTCHA_RE.test(text);
    const instructionHits = (winRun ? 1 : 0) + (paste ? 1 : 0) + (runTarget ? 1 : 0);
    const payload = s.clipboardLevel === 'dangerous';

    let level = 'none';
    if (payload && (winRun || paste || runTarget || captcha)) {
      // Independent confirmation: a shell payload on the clipboard AND
      // paste-it-somewhere instructions in the page. Essentially zero
      // legitimate base rate.
      level = 'dangerous';
      reasons.push({ code: 'clickfixPasteRun', kind: 'clipboard' });
    } else if (winRun && paste && captcha) {
      // Full instruction cluster dressed as a CAPTCHA, even before any copy.
      level = 'dangerous';
      reasons.push({ code: 'clickfixFakeCaptcha', kind: 'clipboard' });
    } else if (winRun && (paste || runTarget)) {
      level = 'suspicious';
      reasons.push({ code: 'clickfixWinR', kind: 'clipboard' });
    } else if (payload) {
      level = 'suspicious';
    }
    if (level === 'dangerous') flags.push('clickfix');
    if (captcha && level !== 'none') reasons.push({ code: 'clickfixCaptchaDisguise', kind: 'clipboard' });
    return { level, reasons, flags };
  }

  return { scoreClickFix };
});
