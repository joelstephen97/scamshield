// tests/unit/verdict.test.js
const test = require('node:test');
const assert = require('node:assert');
const { fuse } = require('../../engine/verdict');

test('low everything -> safe', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0.1, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'safe');
});

test('mid rules -> suspicious', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: ['x'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'suspicious');
});

test('foreign credential form hard-overrides to dangerous', () => {
  const r = fuse({ modelProb: 0.0, urlRules: { score: 0.1, reasons: [] },
    domRules: { score: 0.9, reasons: ['form'], flags: ['credential-form-foreign-domain'] } });
  assert.equal(r.level, 'dangerous');
});

test('model raises borderline rules', () => {
  const r = fuse({ modelProb: 0.95, urlRules: { score: 0.4, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.ok(r.score > 0.4);
});

test('null model falls back to rules only', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.85, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'dangerous');
  assert.equal(r.modelUsed, false);
});

test('fuse returns the dom flags', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0, reasons: [] },
    domRules: { score: 0.6, reasons: ['x'], flags: ['credential-form-foreign-domain', 'brand-impersonation-visual'] } });
  assert.deepEqual(r.flags, ['credential-form-foreign-domain', 'brand-impersonation-visual']);
});

test('fuse defaults flags to an empty array when domRules omits them', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.1, reasons: [] }, domRules: { score: 0, reasons: [] } });
  assert.deepEqual(r.flags, []);
});

test('reasons are merged and de-duplicated by code + params, in order', () => {
  const same = { code: 'ipHost', kind: 'link' };
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [same] },
    domRules: { score: 0.6, reasons: [{ code: 'ipHost', kind: 'link' }, { code: 'hiddenIframes', kind: 'page' }], flags: [] } });
  assert.deepEqual(r.reasons.map((x) => x.code), ['ipHost', 'hiddenIframes']);
});

test('same code with different params is kept as two reasons', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [{ code: 'scamPhrase', kind: 'page', params: ['you won'] }] },
    domRules: { score: 0.6, reasons: [{ code: 'scamPhrase', kind: 'page', params: ['you won'] }, { code: 'scamPhrase', kind: 'page', params: ['claim your prize'] }], flags: [] } });
  assert.deepEqual(r.reasons.map((x) => x.params[0]), ['you won', 'claim your prize']);
});

test('reasonCodes mirror the de-duplicated reasons', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [{ code: 'ipHost', kind: 'link' }] },
    domRules: { score: 0.6, reasons: [{ code: 'hiddenIframes', kind: 'page' }, { code: 'ipHost', kind: 'link' }], flags: [] } });
  assert.deepEqual(r.reasonCodes, ['ipHost', 'hiddenIframes']);
});

test('high model with near-zero rules cannot reach dangerous (rules anchor model)', () => {
  // modelProb 0.99 with zero rules -> score = (0 + 0.99) / 2 = 0.495, which sits
  // just under the 0.5 suspicious threshold; the key invariant is it never reaches
  // dangerous (0.8). A tiny-dataset model cannot trigger a "dangerous" banner alone.
  const r = fuse({ modelProb: 0.99, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.notEqual(r.level, 'dangerous');
  assert.ok(r.score < 0.8);
});

test('content alone caps at suspicious', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.99 });
  assert.equal(r.level, 'suspicious');
  assert.ok(r.reasons.some((x) => x.code === 'contentPhishingPattern' && x.kind === 'page'));
  assert.equal(r.contentUsed, true);
});
test('content below threshold changes nothing', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.6 });
  assert.equal(r.level, 'safe');
});
test('content + rule corroboration → dangerous', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.35, reasons: ['tld'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'dangerous');
});
test('content + URL model corroboration → dangerous (requires a URL rule hit too)', () => {
  // v0.5.0 fix-wave: the URL model alone (urlRules.score below
  // contentCorroborateModelMinRule) is no longer enough to corroborate —
  // some rule must also have fired, since the URL model's syntactic
  // features can't reliably separate legit deep links from phishing shape.
  const r = fuse({ modelProb: 0.75, urlRules: { score: 0.2, reasons: ['x'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'dangerous');
});
test('content + URL model alone (no URL rule hit) does not corroborate → stays suspicious', () => {
  const r = fuse({ modelProb: 0.75, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'suspicious');
});
test('content + icon match → dangerous', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95, iconMatch: true });
  assert.equal(r.level, 'dangerous');
});
test('existing behaviour unchanged when contentProb is null', () => {
  const r = fuse({ modelProb: 0.95, urlRules: { score: 0.4, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: null });
  assert.equal(r.contentUsed, false);
  assert.ok(r.score > 0.4 && r.level !== 'dangerous');
});
