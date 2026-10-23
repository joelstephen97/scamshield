// tests/unit/popular.test.js — 0.15.0 popular-site set (Tranco top-50k as
// 40-bit hashes): builder core + shipped-file size contract.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const B = require('../../engine/blockset');
const { buildPopular, parseCsv } = require('../../scripts/build-popular');

const root = path.join(__dirname, '..', '..');
const h40 = (d) => B.hash40FromBytes(crypto.createHash('sha256').update(d).digest());
const rows = parseCsv(fs.readFileSync(path.join(__dirname, 'fixtures', 'tranco-mini.csv'), 'utf8'));
const out = buildPopular(rows, { listId: 'TEST', generatedAt: '2026-10-23T00:00:00.000Z', blockedApexes: ['blocked-apex.example'] });
const set = B.open(out.bin.buffer.slice(out.bin.byteOffset, out.bin.byteOffset + out.bin.byteLength));

test('parseCsv reads rank,domain rows in order', () => {
  assert.deepEqual(rows.slice(0, 2), ['google.com', 'www.google.com.sa']);
});

test('registrable collapse: www.google.com.sa -> google.com.sa, subdomains dedupe', () => {
  assert.ok(B.has(set, h40('google.com.sa')));
  assert.ok(!B.has(set, h40('www.google.com.sa')));
  assert.ok(B.has(set, h40('wikipedia.org')));
  assert.ok(B.has(set, h40('bbc.co.uk')));
  assert.deepEqual(out.kept.filter((d) => d === 'wikipedia.org').length, 1);
});

test('hosting-platform apexes and their tenants never enter the set', () => {
  for (const d of ['github.io', 'pages.dev', 'blogspot.com', 'vercel.app', 'myshopify.com', 'blocked-apex.example']) {
    assert.ok(!B.has(set, h40(d)), d + ' must be excluded');
    assert.ok(out.meta.excludedPlatforms.includes(d) || d === 'blocked-apex.example', d);
  }
  assert.ok(out.meta.excludedPlatforms.includes('github.io'));
});

test('bytes are sorted 5-byte records and metadata is recorded', () => {
  assert.strictEqual(out.bin.length % 5, 0);
  const v = B.values(set);
  assert.deepEqual(v, [...v].sort((a, b) => a - b));
  assert.strictEqual(out.meta.count, v.length);
  assert.strictEqual(out.meta.source, 'Tranco');
  assert.strictEqual(out.meta.listId, 'TEST');
});

test('shipped rules/popular40.bin: 5-byte records, >= 45k entries, <= 300 KB, no tenant apex', () => {
  const buf = fs.readFileSync(path.join(root, 'rules', 'popular40.bin'));
  assert.strictEqual(buf.length % 5, 0);
  assert.ok(buf.length / 5 >= 45000, 'count ' + buf.length / 5);
  assert.ok(buf.length <= 300 * 1024, 'size ' + buf.length);
  const s = B.open(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(B.has(s, h40('wikipedia.org')));
  assert.ok(B.has(s, h40('google.com')));
  const C = require('../../engine/constants');
  for (const a of C.TENANT_PLATFORMS) assert.ok(!B.has(s, h40(a)), a);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'rules', 'popular.meta.json'), 'utf8'));
  assert.strictEqual(meta.count, s.count);
});
