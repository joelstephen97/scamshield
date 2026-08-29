// tests/unit/site_signals.test.js — suspicious-site-reporter-inspired
// structural URL warn-tier signals (0.9.0, Task B3). See /NOTICE.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Sig = require('../../engine/site_signals');

// ---- (a) labels below the registrable domain --------------------------------

test('labelsBelowRegistrable counts only true subdomains, not the SLD or suffix', () => {
  assert.deepEqual(Sig.labelsBelowRegistrable('www.example.com'), ['www']);
  assert.deepEqual(Sig.labelsBelowRegistrable('example.com'), []);
});

test('labelsBelowRegistrable respects multi-label ccTLD suffixes (FP guard: a.b.c.co.uk)', () => {
  // Registrable domain is "c.co.uk" — only "a" and "b" are true subdomains.
  assert.deepEqual(Sig.labelsBelowRegistrable('a.b.c.co.uk'), ['a', 'b']);
});

test('deep subdomain chain (>=4 labels below the registrable domain) triggers evidence', () => {
  const r = Sig.scoreSiteSignals('a.b.c.d.example.com');
  assert.ok(r.reasons.some((x) => x.code === 'deepSubdomainChain'));
  assert.ok(r.score > 0);
});

test('3 labels below the registrable domain does not trigger the deep-chain signal', () => {
  const r = Sig.scoreSiteSignals('a.b.c.example.com');
  assert.ok(!r.reasons.some((x) => x.code === 'deepSubdomainChain'));
});

test('FP guard: a.b.c.co.uk (2 true subdomains under a multi-label suffix) never triggers deep-chain', () => {
  const r = Sig.scoreSiteSignals('a.b.c.co.uk');
  assert.ok(!r.reasons.some((x) => x.code === 'deepSubdomainChain'), JSON.stringify(r));
});

// ---- (b) long label ----------------------------------------------------------

test('a label >= 22 chars triggers the long-label signal', () => {
  const longLabel = 'paypal-account-verification-secure'; // 35 chars
  const r = Sig.scoreSiteSignals(longLabel + '.example.com');
  assert.ok(r.reasons.some((x) => x.code === 'longHostLabel'));
});

test('ordinary short labels do not trigger the long-label signal', () => {
  const r = Sig.scoreSiteSignals('www.example.com');
  assert.ok(!r.reasons.some((x) => x.code === 'longHostLabel'));
});

test('a label of exactly 21 chars does not trigger; 22 does (boundary)', () => {
  const l21 = 'a'.repeat(21);
  const l22 = 'a'.repeat(22);
  assert.equal(Sig.hasLongLabel(l21 + '.com'), false);
  assert.equal(Sig.hasLongLabel(l22 + '.com'), true);
});

// ---- (d) shortener/redirect hosts --------------------------------------------

test('known shortener hosts are detected exactly and by subdomain', () => {
  for (const h of Sig.SHORTENER_HOSTS) {
    assert.equal(Sig.shortenerHost(h), h);
    assert.equal(Sig.shortenerHost('www.' + h), h);
  }
});

test('shortener host evidence carries the matched host as a param', () => {
  const r = Sig.scoreSiteSignals('bit.ly');
  const reason = r.reasons.find((x) => x.code === 'shortenerHost');
  assert.ok(reason);
  assert.deepEqual(reason.params, ['bit.ly']);
});

test('an unrelated host is never mistaken for a shortener', () => {
  assert.equal(Sig.shortenerHost('example.com'), null);
  assert.equal(Sig.shortenerHost('notbit.ly.example.com'), null);
});

// ---- combined scoring ---------------------------------------------------------

test('a clean, ordinary URL host produces no site-signal evidence at all', () => {
  const r = Sig.scoreSiteSignals('www.wikipedia.org');
  assert.deepEqual(r.reasons, []);
  assert.equal(r.score, 0);
});

test('score is clamped to [0,1] even when every signal fires at once', () => {
  const r = Sig.scoreSiteSignals('a.b.c.d.paypal-account-verification-secure-login.bit.ly');
  assert.ok(r.score >= 0 && r.score <= 1);
});
