// tests/unit/recall_run5.test.js — recall recovery (R1-R4) from the run5 bench analysis, through the real pipeline.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('../../engine/constants.js');
const D = require('../../engine/doctrine.js');
const B = require('../../engine/blockset.js');
const { runPipeline } = require('./helpers/pipeline.js');

const PW = { hasVisiblePasswordField: true };
const tier = (o) => runPipeline(o).tier;

// ---- R1 insecure-credential ----------------------------------------------------------------
test('R1: plain-http public page with a visible password warns', () => {
  const r = runPipeline({ url: 'http://busardoh.com/login', signals: PW });
  assert.strictEqual(r.tier, 'warn');
  assert.ok(r.verdict.flags.includes('insecure-credential'));
  assert.notStrictEqual(r.verdict.level, 'safe');
  assert.strictEqual(tier({ url: 'http://flintlyra.digital/', signals: { hasVisibleCardInput: true } }), 'warn');
});
test('R1: https + password gets no R1', () => {
  const r = runPipeline({ url: 'https://busardoh.com/login', signals: PW });
  assert.ok(!r.verdict.flags.includes('insecure-credential'));
  assert.strictEqual(r.tier, 'quiet');
});
test('R1: http with no visible credential field is quiet', () => {
  assert.strictEqual(tier({ url: 'http://busardoh.com/' }), 'quiet');
  assert.strictEqual(tier({ url: 'http://busardoh.com/', signals: { hasPasswordField: true, hasVisiblePasswordField: false } }), 'quiet');
});
test('R1: IPs, localhost, intranet suffixes, single labels and popular hosts never fire', () => {
  for (const h of ['192.168.1.1', '10.0.0.5', '127.0.0.1', '8.8.8.8', '[::1]', 'localhost', 'router.local', 'nas.lan', 'db.internal', 'gw.home.arpa', 'app.test', 'demo.example', 'intranet', 'x.localhost'])
    assert.ok(!runPipeline({ url: 'http://' + h + '/', signals: PW }).verdict.flags.includes('insecure-credential'), h);
  assert.strictEqual(tier({ url: 'http://192.168.1.1/', signals: PW }), 'quiet');
  assert.strictEqual(tier({ url: 'http://router.local/', signals: PW }), 'quiet');
  assert.strictEqual(tier({ url: 'http://busardoh.com/login', signals: PW, popular: true }), 'quiet');
  assert.strictEqual(D.isLocalOrIpHost('shop.example.com'), false);
});

// ---- R2 brand-keyword-host -----------------------------------------------------------------
test('R2: brand token + hyphen + phishing keyword host warns with no DOM', () => {
  for (const h of ['vinted-offer.info', 'paypal-login.us', 'secure-paypal.net', 'account-paypal.info']) {
    const r = runPipeline({ url: 'https://' + h + '/', riskTlds: {} });
    assert.ok(r.verdict.flags.includes('brand-keyword-host'), h);
    assert.strictEqual(r.tier, 'warn', h);
  }
});
test('R2: popular, brand-owned and non-matching shapes stay quiet', () => {
  assert.strictEqual(tier({ url: 'https://apple-support-group.org/', popular: true }), 'quiet'); // popular registrables are shielded
  assert.strictEqual(tier({ url: 'https://amazon-value-service.com/', popular: true }), 'quiet');
  for (const h of ['www.paypal.com', 'support.paypal.com', 'paypal-community.com', 'my-account-page.com', 'login.example.org', 'vinted.com'])
    assert.ok(!runPipeline({ url: 'https://' + h + '/' }).verdict.flags.includes('brand-keyword-host'), h);
});
test('R2: the engagement-suppressed verdict is not re-lifted', () => {
  const urlRules = require('../../engine/heuristics.js').scoreUrl('https://vinted-offer.info/');
  const out = D.finalizeVerdict({ level: 'safe', score: 0, reasons: [], reasonCodes: [], flags: [], suppressed: 'engagement' }, { urlRules, host: 'vinted-offer.info' });
  assert.strictEqual(out.tier, 'quiet');
});

// ---- R3 tenant-credential + elementor.cloud ------------------------------------------------
test('R3: a visible login on a no-code builder tenant warns', () => {
  for (const h of ['db2156.craftum.io', 'fun-aim-894716.framer.app', 'yhgwyqom.elementor.cloud', 'x.typedream.app']) {
    const r = runPipeline({ url: 'https://' + h + '/', signals: PW });
    assert.ok(r.verdict.flags.includes('tenant-credential'), h);
    assert.strictEqual(r.tier, 'warn', h);
  }
});
test('R3: no credential field, a password-only gate (hasLoginPair false), dev hosts and apexes stay quiet', () => {
  assert.strictEqual(tier({ url: 'https://db2156.craftum.io/' }), 'quiet');
  assert.strictEqual(tier({ url: 'https://db2156.craftum.io/', signals: Object.assign({ hasLoginPair: false }, PW) }), 'quiet');
  assert.strictEqual(tier({ url: 'https://twbs.github.io/', signals: PW }), 'quiet');
  assert.strictEqual(tier({ url: 'https://demo.vercel.app/', signals: PW }), 'quiet');
  assert.strictEqual(tier({ url: 'https://craftum.io/', signals: PW, popular: true }), 'quiet');
});
test('R4: elementor.cloud (and the other builder apexes) are tenant platforms and absent from the shipped popular set', () => {
  const bin = fs.readFileSync(path.join(__dirname, '..', '..', 'rules', 'popular40.bin'));
  const s = B.open(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const h40 = (d) => B.hash40FromBytes(crypto.createHash('sha256').update(d).digest());
  for (const a of ['elementor.cloud', 'b12sites.com', 'kleap.io', 'teleporthq.app', 'framer.media', 'framer.ai', 'relumesite.ai', 'created.app', 'grigora.app']) {
    assert.ok(C.TENANT_PLATFORMS.includes(a), a);
    assert.ok(!B.has(s, h40(a)), a + ' must not be popular');
  }
  assert.ok(C.BUILDER_TENANT_PLATFORMS.every((a) => C.TENANT_PLATFORMS.includes(a)));
  assert.ok(!C.TENANT_PLATFORMS.includes('edgeone.dev')); // statically blocked as a whole platform in rules/blocklist.json
});
