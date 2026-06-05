'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyzeWalletRequest } = require('../../engine/wallet_rules');

test('eth_sign is dangerous (blind signing)', () => {
  const r = analyzeWalletRequest({ method: 'eth_sign', params: ['0xabc', '0xdeadbeef'] });
  assert.strictEqual(r.level, 'dangerous');
  assert.ok(r.reasons.length);
});

test('setApprovalForAll calldata is dangerous', () => {
  const data = '0xa22cb465' + '0'.repeat(24) + '1'.repeat(40) + '0'.repeat(63) + '1';
  const r = analyzeWalletRequest({ method: 'eth_sendTransaction', params: [{ data }] });
  assert.strictEqual(r.level, 'dangerous');
});

test('unlimited ERC20 approve is dangerous', () => {
  const data = '0x095ea7b3' + '0'.repeat(24) + 'a'.repeat(40) + 'f'.repeat(64);
  const r = analyzeWalletRequest({ method: 'eth_sendTransaction', params: [{ data }] });
  assert.strictEqual(r.level, 'dangerous');
});

test('bounded ERC20 approve is at most suspicious', () => {
  const data = '0x095ea7b3' + '0'.repeat(24) + 'a'.repeat(40) + '0'.repeat(60) + '2710';
  const r = analyzeWalletRequest({ method: 'eth_sendTransaction', params: [{ data }] });
  assert.notStrictEqual(r.level, 'dangerous');
});

test('read-only / connect methods are safe', () => {
  for (const m of ['eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'eth_call', 'eth_blockNumber']) {
    assert.strictEqual(analyzeWalletRequest({ method: m, params: [] }).level, 'safe', m);
  }
});

test('Permit2/typed-data with token permissions is dangerous', () => {
  const typed = JSON.stringify({ primaryType: 'PermitSingle', types: { PermitSingle: [] }, message: { spender: '0x1' } });
  const r = analyzeWalletRequest({ method: 'eth_signTypedData_v4', params: ['0xaddr', typed] });
  assert.strictEqual(r.level, 'dangerous');
});

test('plain typed-data login is safe', () => {
  const typed = JSON.stringify({ primaryType: 'Login', types: { Login: [] }, message: { statement: 'Sign in' } });
  const r = analyzeWalletRequest({ method: 'eth_signTypedData_v4', params: ['0xaddr', typed] });
  assert.notStrictEqual(r.level, 'dangerous');
});

test('malformed input fails safe (no throw)', () => {
  assert.doesNotThrow(() => analyzeWalletRequest(null));
  assert.strictEqual(analyzeWalletRequest(null).level, 'safe');
  assert.strictEqual(analyzeWalletRequest({ method: 'eth_sendTransaction', params: [{}] }).level, 'safe');
});
