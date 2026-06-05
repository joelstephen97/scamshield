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
