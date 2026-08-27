const test = require('node:test'); const assert = require('node:assert');
const F = require('../../ui/format');
const NOW = Date.UTC(2026, 7, 22, 10, 0, 0); // Saturday
test('relTime buckets (Intl, en default)', () => {
  assert.equal(F.relTime(NOW - 20000, NOW), 'now');
  assert.equal(F.relTime(NOW - 5 * 60000, NOW), '5 minutes ago');
  assert.equal(F.relTime(NOW - 2 * 3600000, NOW), '2 hours ago');
  assert.equal(F.relTime(NOW - 26 * 3600000, NOW), 'yesterday');
  assert.equal(F.relTime(NOW - 4 * 86400000, NOW), 'Tue');
  assert.equal(F.relTime(NOW - 20 * 86400000, NOW), 'Aug 2');
});
test('relTime honours a locale param and produces no English words', () => {
  assert.equal(F.relTime(NOW - 5 * 60000, NOW, 'de'), 'vor 5 Minuten');
  assert.doesNotMatch(F.relTime(NOW - 5 * 60000, NOW, 'de'), /\bago\b/);
});
test('relTime falls back to English on a bad/unsupported locale', () => {
  assert.equal(F.relTime(NOW - 5 * 60000, NOW, 'not-a-locale'), '5 minutes ago');
});
test('labels', () => {
  assert.equal(F.detectorLabel('techscam'), 'Scare page'); assert.equal(F.detectorLabel('page'), 'Page'); assert.equal(F.detectorLabel('wallet'), 'Wallet');
  assert.equal(F.levelText('safe'), 'Nothing suspicious here'); assert.equal(F.levelText('dangerous'), 'Dangerous page'); assert.equal(F.levelText('unknown'), "Can't check this page");
});
