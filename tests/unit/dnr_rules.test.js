// tests/unit/dnr_rules.test.js — declarativeNetRequest rule builders (0.12.0)
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../engine/dnr_rules.js');

test('domainOfFilter: ||host^ filters only', () => {
  assert.strictEqual(D.domainOfFilter('||criptomixer.io^'), 'criptomixer.io');
  assert.strictEqual(D.domainOfFilter('||Sub.Example.COM^'), 'sub.example.com');
  assert.strictEqual(D.domainOfFilter('||120.46.12.14^'), '120.46.12.14');
  assert.strictEqual(D.domainOfFilter('||example.com/path^'), null);
  assert.strictEqual(D.domainOfFilter('example.com'), null);
  assert.strictEqual(D.domainOfFilter('||*.example.com^'), null);
  assert.strictEqual(D.domainOfFilter(''), null);
  assert.strictEqual(D.domainOfFilter(null), null);
});

test('buildBlockRules: ids from BLOCK_BASE, block main_frame + sub_frame (pre-0.12 shape)', () => {
  const r = D.buildBlockRules(['||a.example^', '||b.example^']);
  assert.deepStrictEqual(r, [
    { id: 100000, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||a.example^', resourceTypes: ['main_frame', 'sub_frame'] } },
    { id: 100001, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||b.example^', resourceTypes: ['main_frame', 'sub_frame'] } }
  ]);
});

test('buildRedirectRules: main_frame only, priority 2, forwards the whole URL in the fragment, chunks by CHUNK', () => {
  const target = 'chrome-extension://abc/blocked.html';
  const r = D.buildRedirectRules(['A.example', 'b.example', null, 'a.example'], target);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0], {
    id: 200000, priority: 2,
    action: { type: 'redirect', redirect: { regexSubstitution: target + '#\\0' } },
    condition: { regexFilter: '^https?://.*', requestDomains: ['a.example', 'b.example'], resourceTypes: ['main_frame'] }
  });
  const many = []; for (let i = 0; i < D.CHUNK * 2 + 1; i++) many.push('d' + i + '.example');
  const rr = D.buildRedirectRules(many, target);
  assert.strictEqual(rr.length, 3);
  assert.deepStrictEqual(rr.map((x) => x.id), [200000, 200001, 200002]);
  assert.strictEqual(rr[0].condition.requestDomains.length, D.CHUNK);
  assert.strictEqual(rr[2].condition.requestDomains.length, 1);
  assert.deepStrictEqual(D.buildRedirectRules([], target), []);
});

test('buildAllowRules: priority 3 beats block (1) and redirect (2); capped at MAX_ALLOW', () => {
  const r = D.buildAllowRules(['Paused.example', 'paused.example', 'trusted.example']);
  assert.deepStrictEqual(r, [
    { id: 300000, priority: 3, action: { type: 'allow' }, condition: { urlFilter: '||paused.example^', resourceTypes: ['main_frame', 'sub_frame'] } },
    { id: 300001, priority: 3, action: { type: 'allow' }, condition: { urlFilter: '||trusted.example^', resourceTypes: ['main_frame', 'sub_frame'] } }
  ]);
  const many = []; for (let i = 0; i < D.MAX_ALLOW + 5; i++) many.push('x' + i + '.example');
  assert.strictEqual(D.buildAllowRules(many).length, D.MAX_ALLOW);
});

test('exemptDomains: allowlist + unexpired pauses only', () => {
  const now = 1000000;
  const s = { allowlist: ['Trusted.example'], pausedSites: { 'live.example': now + 5000, 'expired.example': now - 1, 'junk.example': 'nope' } };
  assert.deepStrictEqual(D.exemptDomains(s, now), ['trusted.example', 'live.example']);
  assert.deepStrictEqual(D.exemptDomains({}, now), []);
  assert.deepStrictEqual(D.exemptDomains(null, now), []);
});

test('the three id ranges never overlap', () => {
  assert.ok(D.inRange(D.BLOCK_BASE + D.RANGE - 1, D.BLOCK_BASE));
  assert.ok(!D.inRange(D.REDIRECT_BASE, D.BLOCK_BASE));
  assert.ok(D.inRange(D.REDIRECT_BASE, D.REDIRECT_BASE));
  assert.ok(D.inRange(D.ALLOW_BASE + 3, D.ALLOW_BASE));
  assert.ok(!D.inRange(D.ALLOW_BASE, D.REDIRECT_BASE));
});
