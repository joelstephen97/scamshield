'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { scoreDom } = require('../../engine/heuristics');

test('brand named in content + password form on off-brand domain flags impersonation', () => {
  const r = scoreDom({
    pageHost: 'paypal-secure-login.xyz', hasPasswordField: true,
    passwordFormActions: ['https://paypal-secure-login.xyz/go'],
    titleBrand: 'paypal', ogSiteName: '', faviconHost: '', logoAltBrands: []
  });
  assert.ok(r.flags.includes('brand-impersonation-content'), JSON.stringify(r.flags));
  assert.ok(r.score >= 0.8);
});

test('real brand site is not flagged', () => {
  const r = scoreDom({
    pageHost: 'paypal.com', hasPasswordField: true,
    passwordFormActions: ['https://paypal.com/go'],
    titleBrand: 'paypal', faviconHost: 'paypal.com', logoAltBrands: ['paypal']
  });
  assert.ok(!r.flags.includes('brand-impersonation-content'), JSON.stringify(r.flags));
});

test('seed-phrase harvesting form flags dangerous', () => {
  const r = scoreDom({ pageHost: 'free-airdrop.xyz', seedPhraseForm: true });
  assert.ok(r.flags.includes('seed-phrase-harvest'));
  assert.ok(r.score >= 0.8);
});

test('brand mention without password field does not flag', () => {
  const r = scoreDom({ pageHost: 'news.example.com', hasPasswordField: false, titleBrand: 'paypal' });
  assert.ok(!r.flags.includes('brand-impersonation-content'));
});
