const test = require('node:test'); const assert = require('node:assert');
const F = require('../../ui/format');
const NOW = Date.UTC(2026, 7, 22, 10, 0, 0); // Saturday
test('relTime buckets', () => {
  assert.equal(F.relTime(NOW - 20000, NOW), 'just now');
  assert.equal(F.relTime(NOW - 5 * 60000, NOW), '5 min ago');
  assert.equal(F.relTime(NOW - 2 * 3600000, NOW), '2 h ago');
  assert.equal(F.relTime(NOW - 26 * 3600000, NOW), 'Yesterday');
  assert.equal(F.relTime(NOW - 4 * 86400000, NOW), 'Tue');
  assert.equal(F.relTime(NOW - 20 * 86400000, NOW), '2 Aug');
});
test('labels', () => {
  assert.equal(F.detectorLabel('techscam'), 'Scare page'); assert.equal(F.detectorLabel('page'), 'Page'); assert.equal(F.detectorLabel('wallet'), 'Wallet');
  assert.equal(F.levelText('safe'), 'Nothing suspicious here'); assert.equal(F.levelText('dangerous'), 'Dangerous page'); assert.equal(F.levelText('unknown'), "Can't check this page");
});
