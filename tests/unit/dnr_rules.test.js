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

test('buildBlockRules: ids from BLOCK_BASE, block main_frame + sub_frame + script (0.15.0 adds script)', () => {
  const r = D.buildBlockRules(['||a.example^', '||b.example^']);
  assert.deepStrictEqual(r, [
    { id: 100000, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||a.example^', resourceTypes: ['main_frame', 'sub_frame', 'script'] } },
    { id: 100001, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||b.example^', resourceTypes: ['main_frame', 'sub_frame', 'script'] } }
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
    { id: 300000, priority: 3, action: { type: 'allow' }, condition: { urlFilter: '||paused.example^', resourceTypes: ['main_frame', 'sub_frame', 'script'] } },
    { id: 300001, priority: 3, action: { type: 'allow' }, condition: { urlFilter: '||trusted.example^', resourceTypes: ['main_frame', 'sub_frame', 'script'] } }
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

test('buildAllowRules: never emits a rule for a bare tenant-platform apex (0.14.1)', () => {
  const stats = {};
  const r = D.buildAllowRules(['pages.dev', 'x.pages.dev', 'example.com', 'windows.net'], stats);
  const filters = r.map((x) => x.condition.urlFilter);
  assert.deepStrictEqual(filters, ['||x.pages.dev^', '||example.com^']);
  assert.strictEqual(stats.skipped, 2);
});

// ---- 0.15.0 (Task 17a): scam iframes and scripts from listed hosts do not load inside legit pages ----
test('buildSubresourceBlockRules: SUB_BASE range, priority 1 block of sub_frame + script, chunked requestDomains', () => {
  assert.strictEqual(D.SUB_BASE, 600000);
  assert.ok(D.SUB_BASE >= D.PATH_BASE + D.RANGE);
  const r = D.buildSubresourceBlockRules(['a.example', 'B.example', 'a.example', null], D.SUB_BASE);
  assert.deepStrictEqual(r, [{
    id: 600000, priority: 1, action: { type: 'block' },
    condition: { requestDomains: ['a.example', 'b.example'], resourceTypes: ['sub_frame', 'script'] }
  }]);
  const many = Array.from({ length: D.CHUNK + 1 }, (_, i) => 'h' + i + '.example');
  const big = D.buildSubresourceBlockRules(many);
  assert.strictEqual(big.length, 2);
  assert.deepStrictEqual(big.map((x) => x.id), [600000, 600001]);
  assert.ok(big.every((x) => x.condition.requestDomains.length <= D.CHUNK));
  assert.deepStrictEqual(D.buildSubresourceBlockRules([]), []);
});

test('allow rules (priority 3) outrank every block rule (priority 1) and cover the block types', () => {
  const allow = D.buildAllowRules(['trusted.example'])[0];
  const block = D.buildBlockRules(['||trusted.example^'])[0];
  const sub = D.buildSubresourceBlockRules(['trusted.example'])[0];
  assert.ok(allow.priority > block.priority && allow.priority > sub.priority);
  for (const t of sub.condition.resourceTypes) assert.ok(allow.condition.resourceTypes.includes(t), t + ' is allowed on a trusted host');
  for (const t of block.condition.resourceTypes) assert.ok(allow.condition.resourceTypes.includes(t), t);
});
