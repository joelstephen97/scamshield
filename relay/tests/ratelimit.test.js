const test = require('node:test'); const assert = require('node:assert');
const { clientIp, allow, _reset } = require('../lib/ratelimit');
test('prefers x-real-ip over x-forwarded-for', () => {
  assert.equal(clientIp({ 'x-real-ip': '5.5.5.5', 'x-forwarded-for': 'spoofed, 9.9.9.9' }), '5.5.5.5');
});
test('falls back to the last x-forwarded-for element, ignoring spoofable earlier hops', () => {
  assert.equal(clientIp({ 'x-forwarded-for': 'spoofed, 9.9.9.9' }), '9.9.9.9');
});
test('falls back to unknown when no IP headers are present', () => {
  assert.equal(clientIp({}), 'unknown');
});
test('truncates an oversized IP string to 64 chars so the bucket key stays bounded', () => {
  const long = 'a'.repeat(500);
  const ip = clientIp({ 'x-forwarded-for': long });
  assert.equal(ip.length, 64);
});
test('spoofed x-forwarded-for buckets under the trusted (last) IP', () => {
  _reset();
  const spoofedIp = clientIp({ 'x-forwarded-for': 'spoofed, 9.9.9.9' });
  const directIp = clientIp({ 'x-forwarded-for': '9.9.9.9' });
  assert.equal(spoofedIp, directIp);
  assert.equal(allow(spoofedIp, 1), true);
  assert.equal(allow(directIp, 1), false, 'shares the same bucket as the trusted IP');
});
