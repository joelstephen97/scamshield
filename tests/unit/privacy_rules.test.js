// tests/unit/privacy_rules.test.js — 0.6.0 privacy pack pure logic
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { privacy } = require('../../engine/privacy_rules');

const EMAIL = 'jane.doe@example.com';
const md5ref = crypto.createHash('md5').update(EMAIL).digest('hex');
const sha1ref = crypto.createHash('sha1').update(EMAIL).digest('hex');
const sha256ref = crypto.createHash('sha256').update(EMAIL).digest('hex');

test('md5 matches Node crypto for an email', () => {
  assert.equal(privacy.md5(EMAIL), md5ref);
});

test('md5 matches for a few known vectors', () => {
  assert.equal(privacy.md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(privacy.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(privacy.md5('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
});

const needles = {
  plain: [EMAIL],
  md5: [md5ref],
  sha1: [sha1ref],
  sha256: [sha256ref]
};

test('findLeak detects plaintext email in an outbound URL', () => {
  assert.equal(privacy.findLeak('https://track.example/p?e=jane.doe@example.com&x=1', needles), 'plain');
});

test('findLeak detects hashed email (md5/sha1/sha256)', () => {
  assert.equal(privacy.findLeak('https://t.example/collect?h=' + md5ref, needles), 'md5');
  assert.equal(privacy.findLeak('{"id":"' + sha1ref + '"}', needles), 'sha1');
  assert.equal(privacy.findLeak('u=' + sha256ref.toUpperCase(), needles), 'sha256'); // case-insensitive
});

test('findLeak returns null for unrelated traffic', () => {
  assert.equal(privacy.findLeak('https://cdn.example/app.js?v=123', needles), null);
});

test('scoreFingerprint flags 3+ distinct surfaces', () => {
  const r = privacy.scoreFingerprint({ canvasReadback: 1, webglParams: 2, audioFingerprint: 1 });
  assert.equal(r.isFp, true);
  assert.equal(r.distinct, 3);
});

test('scoreFingerprint flags canvas + heavy font probing', () => {
  assert.equal(privacy.scoreFingerprint({ canvasReadback: 1, fontProbe: 40 }).isFp, true);
});

test('scoreFingerprint does not flag a single benign canvas draw', () => {
  assert.equal(privacy.scoreFingerprint({ canvasReadback: 1 }).isFp, false);
  assert.equal(privacy.scoreFingerprint({ fontProbe: 3 }).isFp, false);
});
