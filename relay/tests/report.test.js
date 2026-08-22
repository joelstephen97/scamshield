const test = require('node:test'); const assert = require('node:assert');
const handler = require('../api/report');
function mock(method, body, ip) {
  const res = { code: 0, headers: {}, body: null, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return [{ method, body, headers: { 'x-forwarded-for': ip || '1.2.3.4', 'content-type': 'application/json' } }, res];
}
const valid = { v: 1, kind: 'user', label: 'scam', host: 'b.example', regDomain: 'b.example', level: 'safe', score: 0, flags: [], reasonCodes: [], urlFeatures: new Array(17).fill(0), pageFeatures: null, iconMatches: [], detectors: ['page'], extVersion: '0.5.0', ts: 1 };
test('valid report → 204 and one insert; no IP in the stored row', async () => {
  const inserted = []; handler._setSql(async (strings, ...vals) => { inserted.push(vals); return []; });
  const [req, res] = mock('POST', valid); await handler(req, res);
  assert.equal(res.code, 204); assert.equal(inserted.length, 1); assert.ok(!JSON.stringify(inserted).includes('1.2.3.4'));
});
test('invalid → 400; GET → 405; too many from one IP → 429', async () => {
  handler._setSql(async () => []); handler._resetLimiter();
  let [req, res] = mock('POST', { v: 1 }); await handler(req, res); assert.equal(res.code, 400);
  [req, res] = mock('GET'); await handler(req, res); assert.equal(res.code, 405);
  for (let i = 0; i < 60; i++) { [req, res] = mock('POST', valid, '9.9.9.9'); await handler(req, res); }
  [req, res] = mock('POST', valid, '9.9.9.9'); await handler(req, res); assert.equal(res.code, 429);
});
test('oversized content-length header → 413 before parsing body, no sql call', async () => {
  const inserted = []; handler._setSql(async (strings, ...vals) => { inserted.push(vals); return []; }); handler._resetLimiter();
  const [req, res] = mock('POST', valid, '4.4.4.4');
  req.headers['content-length'] = '40000';
  await handler(req, res);
  assert.equal(res.code, 413); assert.equal(inserted.length, 0);
});
