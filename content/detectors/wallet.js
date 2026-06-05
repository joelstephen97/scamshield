// MAIN world. Wraps window.ethereum.request to pre-screen dangerous wallet
// operations before the wallet popup. Fail-open: any error forwards the call.
(function () {
  'use strict';
  if (window.__scamshieldWalletHook) return;
  window.__scamshieldWalletHook = true;

  const pending = new Map();
  let seq = 0;
  const analyze = (req) => {
    try {
      return (window.ScamShield && window.ScamShield.analyzeWalletRequest)
        ? window.ScamShield.analyzeWalletRequest(req) : { level: 'safe', reasons: [] };
    } catch (_) { return { level: 'safe', reasons: [] }; }
  };

  window.addEventListener('scamshield:wallet-decision', (e) => {
    const d = e.detail || {};
    const p = pending.get(d.id);
    if (p) { pending.delete(d.id); p(!!d.allow); }
  });

  function confirm(verdict) {
    return new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      try {
        window.dispatchEvent(new CustomEvent('scamshield:wallet-confirm', {
          detail: { id, level: verdict.level, reasons: verdict.reasons }
        }));
      } catch (_) { pending.delete(id); resolve(true); return; }
      // Fail-open if the isolated world never answers (e.g., disabled/absent).
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(true); } }, 8000);
    });
  }

  function wrap(provider) {
    if (!provider || provider.__scamshieldWrapped || typeof provider.request !== 'function') return;
    provider.__scamshieldWrapped = true;
    const orig = provider.request.bind(provider);
    provider.request = async function (args) {
      const verdict = analyze(args);
      if (verdict.level === 'dangerous' || verdict.level === 'suspicious') {
        const allow = await confirm(verdict);
        if (!allow) {
          const err = new Error('ScamShield blocked a risky wallet request.');
          err.code = 4001; // EIP-1193 user rejected
          throw err;
        }
      }
      return orig(args);
    };
  }

  if (window.ethereum) wrap(window.ethereum);
  // Provider may be injected after us.
  window.addEventListener('ethereum#initialized', () => wrap(window.ethereum), { once: true });
  let tries = 0;
  const iv = setInterval(() => { if (window.ethereum) wrap(window.ethereum); if (++tries > 20) clearInterval(iv); }, 250);
})();
