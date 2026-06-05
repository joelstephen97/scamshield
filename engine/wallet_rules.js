(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // EIP-1193 methods that never move funds — always allowed without prompting.
  const SAFE_METHODS = new Set([
    'eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'net_version',
    'eth_call', 'eth_blockNumber', 'eth_getBalance', 'eth_gasPrice',
    'eth_estimateGas', 'wallet_switchEthereumChain', 'wallet_getPermissions',
    'wallet_requestPermissions', 'eth_getTransactionReceipt'
  ]);

  const SELECTOR_APPROVE = '0x095ea7b3';          // approve(address,uint256)
  const SELECTOR_SET_APPROVAL_ALL = '0xa22cb465'; // setApprovalForAll(address,bool)
  const UNLIMITED_THRESHOLD = BigInt('0x' + 'f'.repeat(56)); // near-max uint256

  function hexToBigInt(hex) {
    try { return BigInt('0x' + String(hex).replace(/^0x/, '')); } catch (_) { return 0n; }
  }

  function analyzeWalletRequest(req) {
    const out = { level: 'safe', reasons: [], flags: [] };
    try {
      if (!req || typeof req.method !== 'string') return out;
      const method = req.method;
      const params = Array.isArray(req.params) ? req.params : [];
      if (SAFE_METHODS.has(method)) return out;

      // Blind signing of an arbitrary hash — legit dApps avoid this.
      if (method === 'eth_sign') {
        out.level = 'dangerous';
        out.flags.push('blind-sign');
        out.reasons.push('A site asked your wallet to blind-sign arbitrary data — a common drainer trick.');
        return out;
      }

      if (method === 'personal_sign') {
        // Usually safe (login messages); leave as safe.
        return out;
      }

      if (/^eth_signTypedData/.test(method)) {
        const raw = params[1] != null ? params[1] : params[0];
        let payload = raw;
        if (typeof raw === 'string') { try { payload = JSON.parse(raw); } catch (_) { payload = {}; } }
        const pt = (payload && payload.primaryType) || '';
        const types = (payload && payload.types) || {};
        const grants = /permit/i.test(pt) || /permitsingle|permitbatch/i.test(Object.keys(types).join(','))
          || /seaport|order/i.test(pt);
        if (grants) {
          out.level = 'dangerous';
          out.flags.push('permit-grant');
          out.reasons.push('This signature would let a site move your tokens or NFTs (token-approval signature).');
        }
        return out;
      }

      if (method === 'eth_sendTransaction') {
        const tx = params[0] || {};
        const data = typeof tx.data === 'string' ? tx.data.toLowerCase() : '';
        if (data.startsWith(SELECTOR_SET_APPROVAL_ALL)) {
          // last 32-byte word: bool approved
          const approved = data.length >= 10 + 128 ? hexToBigInt(data.slice(-64)) !== 0n : false;
          if (approved) {
            out.level = 'dangerous';
            out.flags.push('set-approval-all');
            out.reasons.push('This transaction grants a site control over ALL your NFTs in a collection.');
          }
          return out;
        }
        if (data.startsWith(SELECTOR_APPROVE)) {
          const amountHex = data.slice(10 + 64); // second arg word
          const amount = hexToBigInt(amountHex);
          if (amount >= UNLIMITED_THRESHOLD) {
            out.level = 'dangerous';
            out.flags.push('unlimited-approve');
            out.reasons.push('This transaction gives a site UNLIMITED permission to spend your tokens.');
          } else if (amount > 0n) {
            out.level = 'suspicious';
            out.flags.push('token-approve');
            out.reasons.push('This transaction lets a site spend some of your tokens.');
          }
          return out;
        }
        return out; // ordinary tx — let the wallet's own UI handle it
      }

      return out;
    } catch (_) {
      return { level: 'safe', reasons: [], flags: [] }; // fail-open
    }
  }

  return { analyzeWalletRequest };
});
