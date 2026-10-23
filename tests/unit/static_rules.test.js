// tests/unit/static_rules.test.js — the bundled static DNR ruleset must never
// block a whole hosting platform or a popular site (0.15.0): one framer.website
// rule sent every Framer tenant to the block page.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('../../engine/constants');
const B = require('../../engine/blockset');
const { EXTRA_PLATFORMS } = require('../../scripts/build-popular');

const root = path.join(__dirname, '..', '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'rules', 'blocklist.json'), 'utf8'));
const bin = fs.readFileSync(path.join(root, 'rules', 'popular40.bin'));
const popular = B.open(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const h40 = (d) => B.hash40FromBytes(crypto.createHash('sha256').update(d).digest());

function domainsOf(rule) {
  const c = rule.condition || {};
  const out = [...(c.requestDomains || [])];
  const m = /^\|\|([a-z0-9.-]+)\^?$/i.exec(c.urlFilter || '');
  if (m) out.push(m[1]);
  return out.map((d) => d.toLowerCase());
}

test('every rule has a parseable domain and a unique id', () => {
  const ids = new Set();
  for (const r of rules) {
    assert.ok(!ids.has(r.id), 'duplicate id ' + r.id);
    ids.add(r.id);
    assert.ok(domainsOf(r).length > 0, 'rule ' + r.id + ' has no parseable domain');
  }
});

test('no rule blocks a tenant-platform apex or a hosting-platform apex', () => {
  const platforms = new Set([...C.TENANT_PLATFORMS, ...EXTRA_PLATFORMS].map((s) => s.toLowerCase()));
  for (const r of rules) for (const d of domainsOf(r)) assert.ok(!platforms.has(d), d + ' (rule ' + r.id + ') is a platform apex');
});

// Regression guard only (0.15.0): build-popular excludes blocked apexes from the bin by
// construction, so this cannot catch a blocked popular apex; the Tranco top-100k pass did.
test('no rule blocks a popular registrable domain (bundled Tranco top-50k set)', () => {
  for (const r of rules) for (const d of domainsOf(r)) assert.ok(!B.has(popular, h40(d)), d + ' (rule ' + r.id + ') is a popular site');
});

test('named whole-platform rules are gone; the test sentinel and tenant sub-domains stay', () => {
  const all = new Set(rules.flatMap(domainsOf));
  for (const d of ['framer.website', 'framer.app', 'weeblysite.com', 'qrco.de', 'goo.su', 'bt.cn', 'dothome.co.kr']) assert.ok(!all.has(d), d);
  assert.ok(all.has('scamshield-test-blocked.example'));
});
