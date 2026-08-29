// tests/unit/heuristics-url.test.js
const test = require('node:test');
const assert = require('node:assert');
const { scoreUrl } = require('../../engine/heuristics');

test('clean URL scores low with no reasons', () => {
  const r = scoreUrl('https://www.wikipedia.org/');
  assert.ok(r.score < 0.3);
  assert.deepEqual(r.reasons, []);
});

test('IP + @ + http scores high with reasons', () => {
  const r = scoreUrl('http://good.com@192.168.1.5/login');
  assert.ok(r.score >= 0.8);
  assert.ok(r.reasons.some((x) => x.code === 'ipHost'));
  assert.ok(r.reasons.some((x) => x.code === 'atSymbol'));
});

test('brand lookalike is reported', () => {
  const r = scoreUrl('https://paypa1-login.tk/');
  assert.ok(r.reasons.some((x) => x.code === 'brandLookalike'));
  assert.ok(r.score >= 0.5);
});

test('score is clamped to [0,1]', () => {
  const r = scoreUrl('http://secure-verify-login-account-bank@1.2.3.4/win-prize.tk');
  assert.ok(r.score >= 0 && r.score <= 1);
});

// ---- 0.9.0 Task B3: fuzzy brand matcher, allowlist short-circuit -----------

test('a lone fuzzy brand hit (strongest grade, no other URL evidence) reaches suspicious but never dangerous', () => {
  // "talabat" (not in the frozen brandLookalike's fixed 19-brand list) as a
  // bare subdomain label — isolates the NEW signal from every other rule.
  const r = scoreUrl('https://talabat.abc-shop.com/');
  assert.deepEqual(r.reasons, [{ code: 'brandFuzzyMatch', kind: 'brand', params: ['Talabat'] }]);
  assert.ok(r.score >= 0.5, 'expected at least suspicious');
  assert.ok(r.score < 0.8, 'a lone fuzzy hit must not reach dangerous on its own');
});

test('a lone fuzzy brand hit (strong grade: TLD-swap) also stays isolated and sub-dangerous', () => {
  const r = scoreUrl('https://talabat.info/');
  assert.deepEqual(r.reasons, [{ code: 'brandFuzzyMatch', kind: 'brand', params: ['Talabat'] }]);
  assert.ok(r.score >= 0.5 && r.score < 0.8);
});

test('a real brand domain never gets brandFuzzyMatch evidence (allowlist short-circuit)', () => {
  const r = scoreUrl('https://accounts.google.com/signin');
  assert.ok(!r.reasons.some((x) => x.code === 'brandFuzzyMatch'), JSON.stringify(r.reasons));
});

test('a subdomain of a real brand domain never gets brandFuzzyMatch evidence', () => {
  const r = scoreUrl('https://www.paypal.com/us/home');
  assert.ok(!r.reasons.some((x) => x.code === 'brandFuzzyMatch'), JSON.stringify(r.reasons));
});

// ---- 0.9.0 Task B3: suspicious-site-reporter structural signals -----------

test('deep subdomain chain and long-label evidence surface through scoreUrl', () => {
  const r = scoreUrl('https://a.b.c.d.example.com/');
  assert.ok(r.reasons.some((x) => x.code === 'deepSubdomainChain'));
});

test('a link-shortener host surfaces shortenerHost evidence through scoreUrl', () => {
  const r = scoreUrl('https://bit.ly/3xample');
  assert.ok(r.reasons.some((x) => x.code === 'shortenerHost'));
});

test('a deep-but-legit subdomain under a multi-label suffix (a.b.c.co.uk) triggers no new B3 evidence', () => {
  const r = scoreUrl('https://a.b.c.co.uk/');
  assert.ok(!r.reasons.some((x) => x.code === 'deepSubdomainChain'), JSON.stringify(r.reasons));
  assert.ok(!r.reasons.some((x) => x.code === 'brandFuzzyMatch'), JSON.stringify(r.reasons));
});

// ---- 0.9.0 Task B3: risk.json abused-TLD table -----------------------------

test('risk.json abused-TLD weight table is scored only when supplied', () => {
  const withoutTable = scoreUrl('https://example.top/');
  assert.ok(!withoutTable.reasons.some((x) => x.code === 'riskAbusedTld'));
  const withTable = scoreUrl('https://example.top/', { '.top': 8 });
  assert.ok(withTable.reasons.some((x) => x.code === 'riskAbusedTld'));
  assert.ok(withTable.score > withoutTable.score);
});
