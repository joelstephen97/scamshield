// tests/unit/clickfix_rules.test.js — 0.6.0 ClickFix / fake-CAPTCHA guard
const test = require('node:test');
const assert = require('node:assert');
const { scoreClickFix } = require('../../engine/clickfix_rules');

test('clipboard payload + paste instructions is dangerous with the clickfix flag', () => {
  const r = scoreClickFix({
    text: 'Verification step: press Windows key + R, then Ctrl + V and hit Enter.',
    clipboardLevel: 'dangerous'
  });
  assert.equal(r.level, 'dangerous');
  assert.ok(r.flags.includes('clickfix'));
  assert.ok(r.reasons[0].length > 20);
});

test('full instruction cluster dressed as a CAPTCHA is dangerous even without a copy', () => {
  const r = scoreClickFix({
    text: 'Verify you are human: 1) press Win + R  2) press CTRL+V  3) press Enter to complete the captcha'
  });
  assert.equal(r.level, 'dangerous');
  assert.ok(r.flags.includes('clickfix'));
});

test('run-box instructions without captcha framing are only suspicious', () => {
  const r = scoreClickFix({ text: 'Open the run dialog with Win+R and paste the command.' });
  assert.equal(r.level, 'suspicious');
  assert.ok(!r.flags.includes('clickfix'));
});

test('a plain CAPTCHA page is not flagged', () => {
  const r = scoreClickFix({ text: 'Please verify you are human by clicking the checkbox below.' });
  assert.equal(r.level, 'none');
});

test('a tech article mentioning PowerShell alone is not flagged', () => {
  const r = scoreClickFix({ text: 'PowerShell is a task automation framework from Microsoft. Use the terminal to run scripts.' });
  assert.equal(r.level, 'none');
});

test('clipboard payload alone (no instructions) stays suspicious — the toast path', () => {
  const r = scoreClickFix({ text: 'Welcome to our download portal.', clipboardLevel: 'dangerous' });
  assert.equal(r.level, 'suspicious');
});
