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

test('icon match + password + off-brand → dangerous visual impersonation with brand', () => {
  const r = scoreDom({ ...clean, pageHost: 'secure-login.example', hasPasswordField: true, passwordFormActions: ['https://secure-login.example/post'], iconMatches: [{ brand: 'paypal', distance: 3 }] });
  assert.ok(r.score >= 0.85); assert.ok(r.flags.includes('brand-impersonation-visual')); assert.equal(r.brand, 'paypal');
  assert.ok(r.reasons.some((x) => /PayPal.*icon/i.test(x)));
});
test('icon match without password → suspicious bump only', () => {
  const r = scoreDom({ ...clean, pageHost: 'fan-site.example', iconMatches: [{ brand: 'paypal', distance: 2 }] });
  assert.ok(r.score >= 0.35 && r.score < 0.5); assert.ok(!r.flags.includes('brand-impersonation-visual'));
});
test('icon match on the brand’s own domain is ignored', () => {
  const r = scoreDom({ ...clean, pageHost: 'www.paypal.com', hasPasswordField: true, passwordFormActions: ['https://www.paypal.com/signin'], iconMatches: [{ brand: 'paypal', distance: 0 }] });
  assert.equal(r.score, 0);
});
test('hotlinked brand favicon no longer exempts a named impersonation', () => {
  const r = scoreDom({ ...clean, pageHost: 'paypal-help.example', hasPasswordField: true, passwordFormActions: ['https://paypal-help.example/x'], titleBrand: 'paypal login', faviconHost: 'www.paypal.com' });
  assert.ok(r.flags.includes('brand-impersonation-content'));
});
test('short icon-only brand names are not matched by text ("du" in "products")', () => {
  const r = scoreDom({ ...clean, pageHost: 'shop.example', hasPasswordField: true, passwordFormActions: ['https://shop.example/login'], titleBrand: 'our products - sign in' });
  assert.ok(!r.flags.includes('brand-impersonation-content'));
});
test('logo-kind icon match + password → no visual flag, only the +0.35 corroboration bump', () => {
  const r = scoreDom({ ...clean, pageHost: 'secure-login.example', hasPasswordField: true, passwordFormActions: ['https://secure-login.example/post'], iconMatches: [{ brand: 'paypal', distance: 3, kind: 'logo' }] });
  assert.ok(!r.flags.includes('brand-impersonation-visual'), JSON.stringify(r.flags));
  assert.ok(r.score >= 0.35, String(r.score));
});
test('icon-kind (favicon-derived) match + password → visual impersonation flag', () => {
  const r = scoreDom({ ...clean, pageHost: 'secure-login.example', hasPasswordField: true, passwordFormActions: ['https://secure-login.example/post'], iconMatches: [{ brand: 'paypal', distance: 3, kind: 'icon' }] });
  assert.ok(r.flags.includes('brand-impersonation-visual'), JSON.stringify(r.flags));
  assert.ok(r.score >= 0.85);
});
