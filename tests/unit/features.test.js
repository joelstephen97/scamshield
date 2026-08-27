// tests/unit/features.test.js
const test = require('node:test');
const assert = require('node:assert');
const { extractUrlFeatures, parseHost } = require('../../engine/features');
const { FEATURE_NAMES } = require('../../engine/constants');

test('returns a vector matching FEATURE_NAMES length', () => {
  const v = extractUrlFeatures('https://example.com/');
  assert.equal(v.length, FEATURE_NAMES.length);
});

test('flags raw IP host', () => {
  const v = extractUrlFeatures('http://192.168.0.1/login');
  const idx = FEATURE_NAMES.indexOf('has_ip_host');
  assert.equal(v[idx], 1);
});

test('flags @ symbol and non-https', () => {
  const v = extractUrlFeatures('http://good.com@evil.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('has_at_symbol')], 1);
  assert.equal(v[FEATURE_NAMES.indexOf('is_https')], 0);
});

test('flags punycode host', () => {
  const v = extractUrlFeatures('https://xn--pple-43d.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('has_punycode')], 1);
});

test('counts subdomains', () => {
  const v = extractUrlFeatures('https://a.b.c.example.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('num_subdomains')], 3);
});

test('detects brand lookalike (paypa1)', () => {
  const v = extractUrlFeatures('https://paypa1-secure.com/login');
  assert.equal(v[FEATURE_NAMES.indexOf('brand_lookalike')], 1);
});

test('clean popular domain is not a lookalike', () => {
  const v = extractUrlFeatures('https://www.paypal.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('brand_lookalike')], 0);
});

test('parseHost handles malformed input without throwing', () => {
  assert.doesNotThrow(() => extractUrlFeatures('not a url'));
});

test('legit words containing short brand names are not lookalikes', () => {
  assert.equal(extractUrlFeatures('https://otherwise.com/')[FEATURE_NAMES.indexOf('brand_lookalike')], 0);
  assert.equal(extractUrlFeatures('https://jdbscripts.com/')[FEATURE_NAMES.indexOf('brand_lookalike')], 0);
});

test('raw IP host has zero subdomains', () => {
  assert.equal(extractUrlFeatures('http://192.168.0.1/login')[FEATURE_NAMES.indexOf('num_subdomains')], 0);
});

test('empty string input does not throw and returns full-length vector', () => {
  let v;
  assert.doesNotThrow(() => { v = extractUrlFeatures(''); });
  assert.equal(v.length, FEATURE_NAMES.length);
});

const lookalike = (u) => extractUrlFeatures(u)[FEATURE_NAMES.indexOf('brand_lookalike')];
const tokens = (u) => extractUrlFeatures(u)[FEATURE_NAMES.indexOf('suspicious_token_count')];

test('regional brand ccTLD domains are not lookalikes', () => {
  assert.equal(lookalike('https://www.amazon.co.uk/'), 0);
  assert.equal(lookalike('https://amazon.ae/'), 0);
  assert.equal(lookalike('https://www.paypal.co.uk/'), 0);
  assert.equal(lookalike('https://www.google.com.sg/'), 0);
  assert.equal(lookalike('https://www.netflix.co.jp/'), 0);
});

test('brand infrastructure subdomains are not lookalikes', () => {
  assert.equal(lookalike('https://login.microsoftonline.com/'), 0);
  assert.equal(lookalike('https://accounts.google.com/'), 0);
});

test('exact brand SLD on a high-abuse TLD IS a lookalike', () => {
  assert.equal(lookalike('http://amazon.tk/'), 1);
  assert.equal(lookalike('http://paypal.ml/'), 1);
});

test('typosquats and embedded brands are still detected', () => {
  assert.equal(lookalike('https://paypa1-secure.tk/login'), 1);
  assert.equal(lookalike('http://amaz0n.xyz/login'), 1);
  assert.equal(lookalike('http://secure-paypal.com-verify.tk/'), 1);
});

test('suspicious tokens require word boundaries', () => {
  assert.equal(tokens('https://www.microsoft.com/windows'), 0);
  assert.equal(tokens('https://accountant-services.example.org/'), 0);
  assert.equal(tokens('https://freelance.example.org/'), 0);
});

test('token count matches distinct boundary-delimited tokens', () => {
  assert.equal(tokens('http://free-gift-win.tk/claim'), 4);
  assert.equal(tokens('https://example.com/win-a-prize'), 2);
});

// --- 0.6.0: IDN homograph / Unicode confusables skeleton ---
// Deliberately a SEPARATE signal from the brand_lookalike model feature
// (frozen + parity-locked); homographs surface via idnHomographBrand and a
// hand rule in heuristics.scoreUrl.
const { skeleton, punyDecode, deglyph, idnHomographBrand } = require('../../engine/features');

test('punyDecode decodes IDN labels and rejects garbage', () => {
  assert.equal(punyDecode('pple-43d'), '\u0430pple');                        // Cyrillic a + pple
  assert.equal(punyDecode('80ak6aa92e'), '\u0430\u0440\u0440\u04cf\u0435');  // all-Cyrillic apple
  assert.equal(punyDecode('!!!'), null);
});

test('skeleton collapses confusables to Latin (post-deglyph normalised)', () => {
  assert.equal(skeleton('\u0430\u0440\u0440\u04cf\u0435'), deglyph('apple'));
  assert.equal(skeleton('paypal'), deglyph('paypal'));
});

test('idnHomographBrand attributes full and partial homographs', () => {
  assert.equal(idnHomographBrand('xn--80ak6aa92e.com'), 'apple');   // all-Cyrillic
  assert.equal(idnHomographBrand('xn--pple-43d.com'), 'apple');     // one confusable char
  assert.equal(idnHomographBrand('xn--mnchen-3ya.de'), null);       // münchen.de — legit IDN
  assert.equal(idnHomographBrand('plain-ascii.com'), null);         // no punycode at all
});

test('brand_lookalike model feature semantics are unchanged for IDN hosts (parity lock)', () => {
  const v = extractUrlFeatures('https://xn--pple-43d.com/');
  assert.equal(v[FEATURE_NAMES.indexOf('has_punycode')], 1);
  assert.equal(v[FEATURE_NAMES.indexOf('brand_lookalike')], 0);
});

test('scoreUrl escalates an IDN brand homograph to dangerous', () => {
  const { scoreUrl } = require('../../engine/heuristics');
  const r = scoreUrl('https://xn--80ak6aa92e.com/login');
  assert.ok(r.score >= 0.8, 'homograph + punycode should reach dangerous, got ' + r.score);
  const idn = r.reasons.find((x) => x.code === 'idnHomograph');
  assert.ok(idn, 'expected an idnHomograph reason'); assert.equal(idn.kind, 'brand'); assert.ok(idn.params[0]);
  const clean = scoreUrl('https://xn--mnchen-3ya.de/');
  assert.ok(clean.score < 0.5, 'legit IDN must stay below suspicious, got ' + clean.score);
});
