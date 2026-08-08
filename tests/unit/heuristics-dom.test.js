// tests/unit/heuristics-dom.test.js
const test = require('node:test');
const assert = require('node:assert');
const { scoreDom } = require('../../engine/heuristics');

const clean = { pageHost: 'shop.example.com', hasPasswordField: false,
  passwordFormActions: [], hiddenIframeCount: 0, scamPhrases: [] };

test('clean page scores 0', () => {
  const r = scoreDom(clean);
  assert.equal(r.score, 0);
  assert.deepEqual(r.reasons, []);
});

test('password form posting to foreign domain is dangerous', () => {
  const r = scoreDom({ ...clean, hasPasswordField: true,
    passwordFormActions: ['https://evil-collector.tk/grab'] });
  assert.ok(r.score >= 0.9);
  assert.ok(r.reasons.some((x) => /different (site|domain)/i.test(x)));
  assert.ok(r.flags.includes('credential-form-foreign-domain'));
});

test('same-domain password form is fine', () => {
  const r = scoreDom({ ...clean, hasPasswordField: true,
    passwordFormActions: ['https://shop.example.com/login'] });
  assert.ok(r.score < 0.5);
});

test('password form posting to a known auth provider is not foreign (SSO)', () => {
  const r = scoreDom({ ...clean, hasPasswordField: true,
    passwordFormActions: ['https://accounts.google.com/o/oauth2/auth'] });
  assert.ok(!r.flags.includes('credential-form-foreign-domain'), JSON.stringify(r.flags));
  assert.ok(r.score < 0.5, String(r.score));
});

test('password form posting to microsoftonline is not foreign (SSO)', () => {
  const r = scoreDom({ ...clean, hasPasswordField: true,
    passwordFormActions: ['https://login.microsoftonline.com/common/oauth2'] });
  assert.ok(!r.flags.includes('credential-form-foreign-domain'), JSON.stringify(r.flags));
});

test('multi-label-suffix page posting to a different same-suffix domain IS foreign', () => {
  const r = scoreDom({ ...clean, pageHost: 'www.dbs.com.sg', hasPasswordField: true,
    passwordFormActions: ['https://evil.com.sg/grab'] });
  assert.ok(r.flags.includes('credential-form-foreign-domain'), JSON.stringify(r.flags));
  assert.ok(r.score >= 0.9);
});

test('scam phrases add score and reasons', () => {
  const r = scoreDom({ ...clean, scamPhrases: ['you won', 'claim your prize'] });
  assert.ok(r.score > 0);
  assert.ok(r.reasons.some((x) => /prize|won|giveaway/i.test(x)));
});
