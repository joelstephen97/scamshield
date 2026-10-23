(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const SHELL_PATTERNS = [
    /\bpowershell\b/i, /\bpwsh\b/i, /\bcmd(\.exe)?\s*\/c\b/i, /\bmshta\b/i,
    /\bbitsadmin\b/i, /\bcertutil\b/i, /\b-enc(odedcommand)?\b/i,
    /\bInvoke-(Expression|WebRequest|RestMethod)\b/i, /\biex\b/i,
    /\b(curl|wget)\b[^\n|]*\|\s*(bash|sh|zsh)\b/i, /\bnew-object\s+net\.webclient/i,
    /\bregsvr32\b/i, /\brundll32\b/i
  ];
  const CRYPTO_ADDR = [
    /^0x[a-fA-F0-9]{40}$/,                       // ETH
    /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/,      // BTC
    /^T[a-zA-Z0-9]{33}$/                         // TRON
  ];

  function analyzeClipboardWrite(text) {
    const out = { level: 'safe', reasons: [] };
    try {
      const t = String(text == null ? '' : text);
      if (!t.trim()) return out;
      if (SHELL_PATTERNS.some((re) => re.test(t))) {
        out.level = 'dangerous';
        out.reasons.push({ code: 'clipboardCommand', kind: 'clipboard' });
        return out;
      }
      const trimmed = t.trim();
      if (trimmed.length < 80 && CRYPTO_ADDR.some((re) => re.test(trimmed))) {
        out.level = 'suspicious';
        out.reasons.push({ code: 'clipboardCryptoAddress', kind: 'clipboard' });
      }
      return out;
    } catch (_) {
      return { level: 'safe', reasons: [] };
    }
  }

  // 0.14.0 tiering, reworked in 0.15.0. A user who copies what they selected (or what the
  // button's neighbouring <pre> shows) chose that text: never a warning, never an overwrite.
  // Only a page that wrote something the user did NOT select, on a ClickFix-shaped page, is
  // 'block'. 'notice' is kept as a tier name but maps to no surface in content_script.js.
  function clipboardTier(input) {
    const s = input || {};
    if (!s.level || s.level === 'safe') return 'none';
    // A matching copy is trusted only when the page carries no strong ClickFix lure (Win+R, captcha claim,
    // paste-then-Enter); with one, a dangerous payload is blocked even if the user "selected" it.
    const strong = s.strongLure === true;
    if (s.userGesture === true && s.selectionMatches === true && !strong) return 'none';
    if (s.clickfixLevel === 'dangerous' && (s.userGesture === false || s.selectionMatches === false || strong)) return 'block';
    return s.userGesture === true ? 'notice' : 'warn';
  }
  // Whitespace-insensitive comparison helpers (pure, so unit-testable). `candidates` are the
  // texts the user could have copied: the selection, the clicked element, its code block.
  function normalizeCopyText(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function copyMatches(payload, candidates) {
    const p = normalizeCopyText(payload);
    if (!p) return false;
    return (candidates || []).some((c) => normalizeCopyText(c) === p);
  }
  return { analyzeClipboardWrite, clipboardTier, normalizeCopyText, copyMatches };
});
