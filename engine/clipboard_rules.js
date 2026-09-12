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

  // 0.14.0 tiering. The ollama.com case: a user clicks "copy" on an install
  // page, the payload is a real shell command, but there are no paste-and-run
  // instructions — that is a notice, not a threat. Only the ClickFix pattern
  // (payload + instructions) is the interstitial/"block" tier.
  function clipboardTier(input) {
    const s = input || {};
    if (!s.level || s.level === 'safe') return 'none';
    if (s.clickfixLevel === 'dangerous') return 'block';
    return s.userGesture === true ? 'notice' : 'warn';
  }
  return { analyzeClipboardWrite, clipboardTier };
});
