const test = require('node:test'); const assert = require('node:assert');
const handler = require('../api/purge');
function mock(auth, cronHeader) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  const headers = {};
  if (auth !== undefined) headers.authorization = auth;
  if (cronHeader !== undefined) headers['x-vercel-cron'] = cronHeader;
  return [{ method: 'GET', headers }, res];
}
test('rejects missing bearer even with cron header', async () => {
  process.env.CRON_SECRET = 'c';
  const [req, res] = mock(undefined, '1');
  await handler(req, res);
  assert.equal(res.code, 401);
});
test('bearer OK but no cron header → 401', async () => {
  process.env.CRON_SECRET = 'c';
  const [req, res] = mock('Bearer c');
  await handler(req, res);
  assert.equal(res.code, 401);
});
test('bearer + cron header → 200, deletes rows', async () => {
  process.env.CRON_SECRET = 'c';
  handler._setSql(async () => ([{ id: 1 }, { id: 2 }]));
  const [req, res] = mock('Bearer c', '1');
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.deleted, 2);
});
test('db error → 500', async () => {
  process.env.CRON_SECRET = 'c';
  handler._setSql(async () => { throw new Error('boom'); });
  const [req, res] = mock('Bearer c', '1');
  await handler(req, res);
  assert.equal(res.code, 500);
});
