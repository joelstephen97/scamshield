const test = require('node:test'); const assert = require('node:assert');
const handler = require('../api/export');
function mock(auth, query) {
  const chunks = []; const res = { code: 0, status(c) { this.code = c; return this; }, setHeader() {}, write(c) { chunks.push(c); }, end(c) { if (c) chunks.push(c); }, json(b) { chunks.push(JSON.stringify(b)); return this; }, chunks };
  return [{ method: 'GET', headers: { authorization: auth }, query: query || {} }, res];
}
test('rejects missing/wrong token', async () => { process.env.EXPORT_TOKEN = 't'; const [req, res] = mock('Bearer nope'); await handler(req, res); assert.equal(res.code, 401); });
test('streams NDJSON rows', async () => {
  process.env.EXPORT_TOKEN = 't'; handler._setSql(async () => [{ id: 1, received_at: '2026-08-22T00:00:00Z', payload: { v: 1 } }]);
  const [req, res] = mock('Bearer t', { since: '2026-01-01' }); await handler(req, res);
  assert.equal(res.code, 200); assert.equal(res.chunks.join('').trim().split('\n').length, 1);
});
test('invalid since → 400', async () => {
  process.env.EXPORT_TOKEN = 't';
  const [req, res] = mock('Bearer t', { since: 'not-a-date' });
  await handler(req, res);
  assert.equal(res.code, 400);
});
test('invalid limit → 400', async () => {
  process.env.EXPORT_TOKEN = 't';
  const [req, res] = mock('Bearer t', { limit: 'abc' });
  await handler(req, res);
  assert.equal(res.code, 400);
});
test('out-of-range limit → 400', async () => {
  process.env.EXPORT_TOKEN = 't';
  const [req, res] = mock('Bearer t', { limit: '20001' });
  await handler(req, res);
  assert.equal(res.code, 400);
});
test('db error → 500', async () => {
  process.env.EXPORT_TOKEN = 't';
  handler._setSql(async () => { throw new Error('boom'); });
  const [req, res] = mock('Bearer t', { since: '2026-01-01' });
  await handler(req, res);
  assert.equal(res.code, 500);
});
