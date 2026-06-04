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

test('scam phrases add score and reasons', () => {
  const r = scoreDom({ ...clean, scamPhrases: ['you won', 'claim your prize'] });
  assert.ok(r.score > 0);
  assert.ok(r.reasons.some((x) => /prize|won|giveaway/i.test(x)));
});
