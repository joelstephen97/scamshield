const test = require('node:test'); const assert = require('node:assert');
const { tokenOk } = require('../lib/auth');
test('rejects a wrong-length token', () => {
  assert.equal(tokenOk('Bearer abc', 'muchlongersecret'), false);
});
test('rejects a same-length wrong token', () => {
  assert.equal(tokenOk('Bearer xxxxxxxxxx', 'thesecret1'), false);
});
test('accepts the correct token', () => {
  assert.equal(tokenOk('Bearer thesecret', 'thesecret'), true);
});
test('rejects when no secret is configured', () => {
  assert.equal(tokenOk('Bearer anything', undefined), false);
  assert.equal(tokenOk('Bearer anything', ''), false);
});
