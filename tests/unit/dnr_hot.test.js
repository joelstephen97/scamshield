// tests/unit/dnr_hot.test.js — hot-list and path redirect builders (0.13.0)
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../engine/dnr_rules.js');
const target = 'chrome-extension://abc/blocked.html';

test('id ranges do not overlap', () => {
  assert.strictEqual(D.ALLOW_BASE, 300000);
  assert.strictEqual(D.HOT_BASE, 400000);
  assert.strictEqual(D.PATH_BASE, 500000);
  assert.ok(D.HOT_BASE >= D.ALLOW_BASE + D.RANGE);
  assert.ok(D.PATH_BASE >= D.HOT_BASE + D.RANGE);
});

test('buildRedirectRules with a base: ids start at the base, shape identical to the feed rules', () => {
  const hosts = Array.from({ length: 2600 }, (_, i) => `h${i}.example`);
  const r = D.buildRedirectRules(hosts, target, D.HOT_BASE);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map((x) => x.id), [400000, 400001]);
  assert.strictEqual(r[0].priority, 2);
  assert.strictEqual(r[0].condition.requestDomains.length, 2500);
  assert.deepStrictEqual(r[0].condition.resourceTypes, ['main_frame']);
  assert.strictEqual(r[0].action.redirect.regexSubstitution, target + '#\\0');
  // default base unchanged for the feed path
  assert.strictEqual(D.buildRedirectRules(['a.example'], target)[0].id, 200000);
});

test('buildPathRedirectRules: one anchored regex rule per entry, capped, host-scoped', () => {
  const r = D.buildPathRedirectRules([{ h: 'rb.gy', p: '/88c5r3' }, { h: 'sites.google.com', p: '/view/verified-badge' }], target);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], {
    id: 500000, priority: 2,
    action: { type: 'redirect', redirect: { regexSubstitution: target + '#\\0' } },
    condition: { regexFilter: '^https?://rb\\.gy/88c5r3(?:[/?#]|$)', requestDomains: ['rb.gy'], resourceTypes: ['main_frame'] }
  });
  assert.strictEqual(r[1].condition.regexFilter, '^https?://sites\\.google\\.com/view/verified-badge(?:[/?#]|$)');
  const many = D.buildPathRedirectRules(Array.from({ length: 500 }, (_, i) => ({ h: 'x.example', p: '/p' + i })), target);
  assert.strictEqual(many.length, D.MAX_PATH_RULES);
});

test('buildPathRedirectRules: rejects junk (no leading slash, empty host, path > 200 chars)', () => {
  const r = D.buildPathRedirectRules([{ h: '', p: '/a' }, { h: 'x.example', p: 'a' }, { h: 'x.example', p: '/' + 'a'.repeat(201) }, { h: 'X.Example', p: '/ok' }], target);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].condition.requestDomains, ['x.example']);
});

// One invalid requestDomains entry makes Chrome reject the WHOLE
// updateDynamicRules batch, so a malformed hot-list row must never reach it.
test('buildPathRedirectRules: rejects malformed host labels', () => {
  const junk = ['foo-.com', '-foo.com', 'a..b', '.', '---', 'foo'];
  for (const h of junk) {
    assert.deepStrictEqual(D.buildPathRedirectRules([{ h, p: '/a' }], target), [], h);
  }
  const ok = D.buildPathRedirectRules([{ h: 'a-b.c-d.example', p: '/a' }], target);
  assert.deepStrictEqual(ok[0].condition.requestDomains, ['a-b.c-d.example']);
});

test('escapeRegex escapes RE2 metacharacters', () => {
  assert.strictEqual(D.escapeRegex('a.b/c?d=1&e[2]'), 'a\\.b/c\\?d=1&e\\[2\\]');
});
