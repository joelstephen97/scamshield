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

test('regional brand storefront login is not flagged (amazon.ae)', () => {
  const r = scoreDom({
    pageHost: 'www.amazon.ae', hasPasswordField: true,
    passwordFormActions: ['https://www.amazon.ae/ap/signin'],
    titleBrand: 'amazon sign-in', ogSiteName: '', faviconHost: '', logoAltBrands: ['amazon']
  });
  assert.ok(!r.flags.includes('brand-impersonation-content'), JSON.stringify(r));
  assert.ok(r.score < 0.5, String(r.score));
});

test('multi-label-suffix brand storefront login is not flagged (amazon.co.uk)', () => {
  const r = scoreDom({
    pageHost: 'www.amazon.co.uk', hasPasswordField: true,
    passwordFormActions: ['https://www.amazon.co.uk/ap/signin'],
    titleBrand: 'amazon sign-in', logoAltBrands: ['amazon']
  });
  assert.ok(!r.flags.includes('brand-impersonation-content'), JSON.stringify(r));
});

test('exact brand SLD on a high-abuse TLD still flags impersonation', () => {
  const r = scoreDom({
    pageHost: 'amazon.tk', hasPasswordField: true,
    passwordFormActions: ['https://amazon.tk/login'],
    titleBrand: 'amazon', logoAltBrands: []
  });
  assert.ok(r.flags.includes('brand-impersonation-content'), JSON.stringify(r.flags));
});

test('exact brand SLD on a generic gTLD with password form still flags', () => {
  const r = scoreDom({
    pageHost: 'amazon.pizza', hasPasswordField: true,
    passwordFormActions: ['https://amazon.pizza/login'],
    titleBrand: 'amazon', logoAltBrands: []
  });
  assert.ok(r.flags.includes('brand-impersonation-content'), JSON.stringify(r.flags));
});
