const test = require('node:test'); const assert = require('node:assert');
const { validatePayload } = require('../lib/validate');
const ok = { v: 1, kind: 'auto', label: 'dangerous', host: 'a.example', regDomain: 'a.example', level: 'dangerous', score: 0.9,
  flags: [], reasonCodes: [], urlFeatures: new Array(17).fill(0), pageFeatures: null, iconMatches: [], detectors: ['page'], extVersion: '0.5.0', ts: 1755860400 };
test('accepts a valid payload', () => assert.equal(validatePayload(ok).ok, true));
test('rejects wrong version, label, host, oversized arrays, extra string blobs', () => {
  assert.equal(validatePayload({ ...ok, v: 2 }).ok, false);
  assert.equal(validatePayload({ ...ok, label: 'x' }).ok, false);
  assert.equal(validatePayload({ ...ok, host: 'not a host/with/path' }).ok, false);
  assert.equal(validatePayload({ ...ok, urlFeatures: new Array(18).fill(0) }).ok, false);
  assert.equal(validatePayload({ ...ok, url: 'https://a.example/secret' }).ok, false, 'unknown keys rejected');
});
test('rejects non-finite score, ts, token values, and icon distances', () => {
  assert.equal(validatePayload({ ...ok, score: NaN }).ok, false);
  assert.equal(validatePayload({ ...ok, ts: Infinity }).ok, false);
  assert.equal(validatePayload({ ...ok, pageFeatures: { tokens: { '5': NaN }, dense: new Array(16).fill(0) } }).ok, false);
  assert.equal(validatePayload({ ...ok, iconMatches: [{ brand: 'x', distance: NaN }] }).ok, false);
});
