'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { scoreTechScam } = require('../../engine/techscam_rules');

test('classic scare text + phone scores dangerous', () => {
  const r = scoreTechScam({
    text: 'your computer has been blocked. do not turn off your computer. call microsoft support now at 1-800-555-0199',
    fullscreenOnLoad: true, dialogFloodCount: 6, historyTrap: false
  });
  assert.ok(r.score >= 0.8, 'score=' + r.score);
  assert.ok(r.reasons.length);
});

test('mild page stays low', () => {
  const r = scoreTechScam({ text: 'welcome to our blog about computers', fullscreenOnLoad: false, dialogFloodCount: 0, historyTrap: false });
  assert.ok(r.score < 0.5, 'score=' + r.score);
});

test('dialog flood alone is suspicious not dangerous', () => {
  const r = scoreTechScam({ text: 'hello', fullscreenOnLoad: false, dialogFloodCount: 8, historyTrap: true });
  assert.ok(r.score >= 0.3 && r.score < 0.8, 'score=' + r.score);
});

test('handles missing input', () => {
  assert.doesNotThrow(() => scoreTechScam());
  assert.strictEqual(scoreTechScam().score, 0);
});

// --- 0.6.0 upgrades ---
test('phone + OS brand inside a scare page is decisive (fake-alert-phone)', () => {
  const r = scoreTechScam({ text: 'WINDOWS DEFENDER ALERT: your computer has been blocked. Call Microsoft support now at 1-888-555-0100.' });
  assert.ok(r.score >= 0.8, 'expected dangerous, got ' + r.score);
  assert.ok((r.flags || []).includes('fake-alert-phone'));
  assert.ok(r.reasons.some((x) => /web page pretending to be a system alert/i.test(x)));
});

test('scare language with a phone but no OS brand is not decisive on its own', () => {
  const brandless = scoreTechScam({ text: 'security alert. call 1-800-555-0000 now.' });
  assert.ok(!(brandless.flags || []).includes('fake-alert-phone'));
});

test('alarm audio adds signal', () => {
  const quiet = scoreTechScam({ text: 'virus detected on your device' });
  const loud = scoreTechScam({ text: 'virus detected on your device', alarmAudio: true });
  assert.ok(loud.score > quiet.score);
  assert.ok(loud.reasons.some((x) => /alarm audio/i.test(x)));
});
