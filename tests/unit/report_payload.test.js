const test = require('node:test');
const assert = require('node:assert');
const RP = require('../../engine/report_payload');

const base = { kind: 'auto', label: 'dangerous', url: 'https://login.paypa1-secure.example/account/verify?id=123#x',
  verdict: { level: 'dangerous', score: 0.91, flags: ['brand-impersonation-visual'], reasons: ['This page uses PayPal\'s icon but is not PayPal\'s website.'] },
  urlFeatures: new Float32Array(17).fill(1), pageFeatures: { tokens: { 5: 2, 9: 1 }, dense: new Array(16).fill(0.5) },
  iconMatches: [{ brand: 'paypal', distance: 3, url: 'https://x/y.ico' }], detectors: ['page'], extVersion: '0.5.0', now: 1755860000123 };

test('payload keeps host/regDomain and drops path, query, fragment and reason text', () => {
  const p = RP.buildReportPayload(base);
  assert.equal(p.v, 1); assert.equal(p.host, 'login.paypa1-secure.example'); assert.equal(p.regDomain, 'paypa1-secure.example');
  const s = JSON.stringify(p);
  assert.ok(!s.includes('/account'), 'no path'); assert.ok(!s.includes('id=123'), 'no query'); assert.ok(!s.includes('#x'));
  assert.ok(!('url' in p) && !('reasons' in p), 'no url/reasons keys');
  assert.ok(!s.includes('y.ico'), 'icon URLs stripped');
  assert.deepEqual(p.iconMatches, [{ brand: 'paypal', distance: 3 }]);
});
test('ts is rounded down to the hour', () => {
  assert.equal(RP.buildReportPayload(base).ts, Math.floor(1755860000123 / 3600000) * 3600000 / 1000);
});
test('urlFeatures become a plain number array; pageFeatures pass through', () => {
  const p = RP.buildReportPayload(base);
  assert.ok(Array.isArray(p.urlFeatures) && p.urlFeatures.length === 17);
  assert.deepEqual(p.pageFeatures.tokens, { 5: 2, 9: 1 });
});
test('reasonCodes derived from flags + level, never free text', () => {
  const p = RP.buildReportPayload(base);
  assert.deepEqual(p.reasonCodes, ['brand-impersonation-visual']);
});
test('oversized token maps are truncated to the 2000 highest counts and payload ≤ 32 KB', () => {
  const tokens = {}; for (let i = 0; i < 30000; i++) tokens[i] = (i % 7) + 1;
  const p = RP.buildReportPayload({ ...base, pageFeatures: { tokens, dense: [] } });
  assert.ok(Object.keys(p.pageFeatures.tokens).length <= 2000);
  assert.ok(RP.payloadBytes(p) <= RP.REPORT_MAX_BYTES);
});
test('invalid input → null', () => {
  assert.equal(RP.buildReportPayload({ ...base, url: 'not a url' }), null);
  assert.equal(RP.buildReportPayload({ ...base, label: 'weird' }), null);
});
test('invalid kind → null', () => {
  assert.equal(RP.buildReportPayload({ ...base, kind: 'weird' }), null);
});
test('non-numeric score → 0', () => {
  const p = RP.buildReportPayload({ ...base, verdict: { ...base.verdict, score: 'abc' } });
  assert.equal(p.score, 0);
});
test('Infinity score → 0', () => {
  const p = RP.buildReportPayload({ ...base, verdict: { ...base.verdict, score: Infinity } });
  assert.equal(p.score, 0);
});
test('huge urlFeatures array → null (final payload size backstop)', () => {
  const huge = new Array(500000).fill(1);
  const p = RP.buildReportPayload({ ...base, urlFeatures: huge });
  assert.equal(p, null);
});
