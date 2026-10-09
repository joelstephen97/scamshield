// MAIN world. Wraps window.ethereum.request to pre-screen dangerous wallet
// operations before the wallet popup. Fail-open: any error forwards the call.
(function () {
  'use strict';
  if (window.__scamshieldWalletHook) return;
  window.__scamshieldWalletHook = true;

  const pending = new Map();
  const timers = new Map(); // id -> fail-open timer, cleared once the overlay acks (0.14.1)
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
    if (p) { pending.delete(d.id); clearTimeout(timers.get(d.id)); timers.delete(d.id); p(!!d.allow); }
  });
  // 0.14.1: the isolated world acks as soon as the overlay is on screen. From
  // then on the request waits for the user's decision (a person reading a
  // warning for >8 s must not be waved through). No ack = extension
  // disabled/absent/broken, so the fail-open timer below still fires. A page
  // can forge an ack, but that only makes its own request hang.
  window.addEventListener('scamshield:wallet-ack', (e) => {
    const d = e.detail || {};
    if (pending.has(d.id) && timers.has(d.id)) {
      clearTimeout(timers.get(d.id));
      // Backstop: the overlay is up, but if no decision ever arrives (the
      // isolated world died, the page tore the overlay down) the request must
      // not hang forever. After 5 minutes resolve it as a deny (4001).
      timers.set(d.id, setTimeout(() => { timers.delete(d.id); if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p(false); } }, 5 * 60000));
    }
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
      // Fail-open if the isolated world never acks (e.g., disabled/absent).
      timers.set(id, setTimeout(() => { timers.delete(id); if (pending.has(id)) { pending.delete(id); resolve(true); } }, 8000));
    });
  }

  function wrap(provider) {
    if (!provider || provider.__scamshieldWrapped || typeof provider.request !== 'function') return;
    provider.__scamshieldWrapped = true;
    const orig = provider.request.bind(provider);
    // Best-effort guard: a page can still call the provider's prototype
    // `request` directly and skip this wrapper.
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
  // EIP-6963 multi-provider discovery (0.6.0): modern wallets announce
  // themselves via events instead of (only) window.ethereum — wrap each
  // announced provider and re-request announcements in case we loaded late.
  window.addEventListener('eip6963:announceProvider', (e) => {
    try { wrap(e && e.detail && e.detail.provider); } catch (_) {}
  });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (_) {}
  let tries = 0;
  const iv = setInterval(() => { if (window.ethereum) wrap(window.ethereum); if (++tries > 20) clearInterval(iv); }, 250);
})();
