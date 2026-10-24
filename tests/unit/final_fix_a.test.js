// tests/unit/final_fix_a.test.js — 0.15.0 final-review precision/recall fixes (items 1-9).
// Recall tests go through the REAL pipeline (tests/unit/helpers/pipeline.js), never a hand-built verdict.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../engine/constants.js');
const H = require('../../engine/heuristics.js');
const BM = require('../../engine/brand_match.js');
const D = require('../../engine/doctrine.js');
const FU = require('../../engine/fakeupdate_rules.js');
const { runPipeline } = require('./helpers/pipeline.js');

const PW = { hasVisiblePasswordField: true };
const tier = (o) => runPipeline(o).tier;

// ---- 1. one-edit brand typosquats with a visible login --------------------------------------
test('C1: one-edit typosquats + visible password + generic title warn', () => {
  for (const url of ['https://paypla.com/signin', 'https://micorsoft.com/signin']) {
    const r = runPipeline({ url, signals: PW });
    assert.strictEqual(r.tier, 'warn', url);
    assert.ok(r.verdict.level !== 'safe', url);
    assert.ok(r.verdict.flags.includes('brand-lookalike-credential'), url);
  }
});
test('C1: the same hosts with NO password field stay quiet', () => {
  for (const url of ['https://paypla.com/signin', 'https://micorsoft.com/signin']) assert.strictEqual(tier({ url }), 'quiet', url);
});
test('C1: a hidden login modal (no VISIBLE password) stays quiet', () => {
  assert.strictEqual(tier({ url: 'https://paypla.com/signin', signals: { hasPasswordField: true, hasVisiblePasswordField: false } }), 'quiet');
});
test('C1: real brand and regional storefronts with a password stay quiet/safe', () => {
  for (const url of ['https://paypal.com/signin', 'https://www.google.com.sa/', 'https://www.paypal.co.uk/signin', 'https://www.amazon.ae/ap/signin']) {
    const r = runPipeline({ url, signals: PW });
    assert.strictEqual(r.tier, 'quiet', url);
    assert.strictEqual(r.verdict.level, 'safe', url);
  }
});
test('C1: a popular registrable is never lifted', () => {
  assert.strictEqual(tier({ url: 'https://paypla.com/signin', signals: PW, popular: true }), 'quiet');
});
test('C1: an engagement-suppressed verdict is not re-lifted', () => {
  const urlRules = H.scoreUrl('https://paypla.com/signin');
  const v = { level: 'safe', score: 0.45, reasons: [], reasonCodes: [], flags: [], suppressed: 'engagement' };
  const out = D.finalizeVerdict(v, { urlRules, signals: PW, popular: false, host: 'paypla.com' });
  assert.strictEqual(out.tier, 'quiet');
});

// ---- 2. stop-tier flags on popular pages -----------------------------------------------------
const fakeUpdateSignals = (host) => ({
  fakeUpdate: FU.scoreFakeUpdate({ text: 'Chrome update available now. Download the installer.', updateAnchorHosts: ['cdn-installer.net'], pageRegistrable: host })
});
test('I2: fake-browser-update on a popular page is quiet; on an unpopular host it is stop', () => {
  const url = 'https://www.bleepingcomputer.com/news/security/chrome-update/';
  const s = fakeUpdateSignals('bleepingcomputer.com');
  assert.deepStrictEqual(s.fakeUpdate.flags, ['fake-browser-update']);
  const pop = runPipeline({ url, signals: s, popular: true });
  assert.strictEqual(pop.tier, 'quiet');
  assert.ok(pop.verdict.flags.includes('fake-browser-update'), 'the finding stays in the verdict for the popup');
  assert.strictEqual(runPipeline({ url: 'https://updates-now.example/', signals: s, popular: false }).tier, 'stop');
});
test('I3: seed-phrase-harvest on a popular page (proton.me-shaped) is quiet; unpopular is stop', () => {
  const s = { seedPhraseForm: true };
  assert.strictEqual(tier({ url: 'https://proton.me/support/recover', signals: s, popular: true }), 'quiet');
  assert.strictEqual(tier({ url: 'https://walet-restore.example/', signals: s, popular: false }), 'stop');
});
test('I3: delivery-fee-scam on a popular page is quiet; unpopular is stop', () => {
  const s = { titleBrand: 'DHL Express', hasCardInput: true, deliveryFeeText: true };
  assert.strictEqual(tier({ url: 'https://news.example.com/dhl', signals: s, popular: true }), 'quiet');
  assert.strictEqual(tier({ url: 'https://dhl-parcel-fee.example/', signals: s, popular: false }), 'stop');
});
test('I2/I3: feed-block and clickfix stay stop even on a popular host', () => {
  assert.strictEqual(D.surfaceTier({ level: 'dangerous', flags: ['feed-block'] }, { popular: true, host: 'example.com' }), 'stop');
  assert.strictEqual(D.surfaceTier({ level: 'dangerous', flags: ['clickfix'] }, { popular: true, host: 'example.com' }), 'stop');
});

// ---- 4. popular user-content hosts ---------------------------------------------------------
const BRAND_PW = { titleBrand: 'PayPal - Log in', hasVisiblePasswordField: true };
test('I5: all 25 hosts are in USER_CONTENT_HOSTS', () => {
  const want = 'gitbook.io linktr.ee beacons.ai squarespace.com substack.com medium.com airtable.com bubble.io zendesk.com freshdesk.com hubspot.com mailchi.mp list-manage.com sendgrid.net jimdofree.com webnode.page site123.me replit.dev telegra.ph codepen.io stackblitz.com codesandbox.io mega.nz mediafire.com wetransfer.com'.split(' ');
  assert.strictEqual(want.length, 25);
  for (const h of want) assert.ok(C.USER_CONTENT_HOSTS.includes(h), h);
});
test('I5: evil.gitbook.io + brand impersonation + visible password warns even when the registrable is popular', () => {
  assert.strictEqual(tier({ url: 'https://evil.gitbook.io/login', signals: BRAND_PW, popular: true }), 'warn');
});
test('I5: gitbook.com docs and the gitbook.io apex stay quiet', () => {
  assert.strictEqual(tier({ url: 'https://docs.gitbook.com/', signals: BRAND_PW, popular: true }), 'quiet');
  assert.strictEqual(tier({ url: 'https://gitbook.io/', signals: BRAND_PW, popular: true }), 'quiet');
  assert.strictEqual(tier({ url: 'https://www.gitbook.io/', signals: BRAND_PW, popular: true }), 'quiet');
});
test('I5: subdomain platforms: tenants lose the shield, the vendor apex and own sub-sites keep it', () => {
  for (const h of ['acme.zendesk.com', 'shop.squarespace.com', 'evil.substack.com', 'x.freshdesk.com', 'evil.hubspot.com'])
    assert.strictEqual(tier({ url: `https://${h}/`, signals: BRAND_PW, popular: true }), 'warn', h);
  for (const h of ['www.zendesk.com', 'zendesk.com', 'www.hubspot.com', 'app.hubspot.com', 'blog.hubspot.com', 'support.zendesk.com'])
    assert.strictEqual(tier({ url: `https://${h}/`, signals: BRAND_PW, popular: true }), 'quiet', h);
});
test('I5: path-based hosts (medium.com/@evil): popular guard is off for credential-form flags only', () => {
  for (const h of ['medium.com', 'telegra.ph', 'codepen.io', 'linktr.ee', 'mega.nz'])
    assert.strictEqual(tier({ url: `https://${h}/@evil`, signals: BRAND_PW, popular: true }), 'warn', h);
  // heuristics alone (a dangerous verdict with no credential flag) never warns there
  assert.strictEqual(D.surfaceTier({ level: 'dangerous', flags: [] }, { popular: true, host: 'medium.com' }), 'quiet');
  assert.strictEqual(D.surfaceTier({ level: 'dangerous', flags: ['wallet-drainer'] }, { popular: true, host: 'codepen.io' }), 'quiet');
});
test('I5: pre-existing user-content hosts behave as before (apex included)', () => {
  assert.strictEqual(D.isUserContentHost('dropbox.com'), true);
  assert.strictEqual(D.isUserContentHost('sites.google.com'), true);
  assert.strictEqual(D.isUserContentHost('www.google.com'), false);
});

// ---- 5. de-listed apexes join TENANT_PLATFORMS ------------------------------------------------
test('I6: de-listed free-host apexes are tenant platforms; shorteners are not', () => {
  for (const a of ['framer.website', 'framer.app', 'weeblysite.com', 'typedream.app', 'webcindario.com', 'dynv6.net', 'us.cc', 'ct.ws', 'za.com', 'happysrv.de', 'my.id', 'dothome.co.kr', 'wasmer.app', 'craftum.io', 'contabostorage.com', 'replit.app'])
    assert.ok(C.TENANT_PLATFORMS.includes(a), a);
  for (const a of ['goo.su', 'qrco.de', 'bt.cn']) assert.ok(!C.TENANT_PLATFORMS.includes(a), a);
});
test('I6: tenant scoring on x.framer.website with a brand + visible password warns', () => {
  const r = runPipeline({ url: 'https://paypal-secure.framer.website/', signals: PW });
  assert.strictEqual(r.tier, 'warn');
  assert.ok(r.verdict.flags.includes('brand-impersonation-tenant'));
  assert.strictEqual(C.tenantLabel('x.my.id'), 'x');
  assert.strictEqual(C.tenantLabel('framer.website'), null);
});

// ---- 6. isRegionalSite static abused-ccTLD list ----------------------------------------------
test('I7: isRegionalSite never treats an abused ccTLD as regional (riskTlds not needed)', () => {
  for (const sfx of ['su', 'ru', 'com.ru', 'cn', 'tk', 'ml', 'ga', 'cf', 'gq', 'tv', 'to', 'ly', 'gl', 'la', 'im', 'sx', 'ws', 'cc', 'pw', 'co', 'cm', 'nu'])
    assert.strictEqual(BM.isRegionalSite('paypal', sfx, {}), false, sfx);
  for (const sfx of ['co.uk', 'de', 'fr', 'it', 'es', 'nl', 'ae', 'sa', 'in', 'jp', 'com.au', 'com.br', 'com.mx', 'ca', 'com.sa', 'com.co', 'ph', 'com.ph'])
    assert.strictEqual(BM.isRegionalSite('paypal', sfx, {}), true, sfx);
  assert.strictEqual(BM.isRegionalSite('roblox', 'de', {}), false); // closed brand
});
test('I7: paypal.su / paypal.ru with riskTlds={} and a visible password reach warn', () => {
  for (const url of ['https://paypal.su/signin', 'https://paypal.ru/signin']) {
    const r = runPipeline({ url, signals: PW, riskTlds: {} });
    assert.ok(r.urlRules.reasons.some((x) => x.code === 'brandFuzzyMatch'), url);
    assert.ok(r.verdict.level === 'suspicious' || r.verdict.level === 'dangerous', url);
    assert.strictEqual(r.tier, 'warn', url);
  }
});
test('I7: real regional storefronts stay safe', () => {
  for (const url of ['https://paypal.co.uk/signin', 'https://www.amazon.ae/ap/signin', 'https://www.google.com.sa/'])
    assert.strictEqual(runPipeline({ url, signals: PW, riskTlds: {} }).verdict.level, 'safe', url);
});
test('I7: content impersonation on an abused ccTLD is not trusted as "on brand"', () => {
  const r = runPipeline({ url: 'https://paypal.su/', signals: BRAND_PW });
  assert.ok(r.domRules.flags.includes('brand-impersonation-content'));
});

// ---- 7. challenge suppression ----------------------------------------------------------------
test('I8: challenge suppression is skipped when the URL reasons include a lookalike', () => {
  const lookalike = runPipeline({ url: 'https://paypal-login-secure.com/', challenge: true });
  assert.ok(lookalike.urlRules.reasons.some(D.isLookalikeReason));
  assert.notStrictEqual(lookalike.verdict.suppressed, 'challenge');
  assert.notStrictEqual(lookalike.verdict.level, 'safe');
  const withPw = runPipeline({ url: 'https://paypal-login-secure.com/', challenge: true, signals: PW });
  assert.strictEqual(withPw.tier, 'warn');
});
test('I8: a flag-less non-lookalike verdict on a challenge page is still suppressed', () => {
  const sig = { scamPhrases: ['act now', 'you won'], hiddenIframeCount: 1 };
  const url = 'http://verify-account-urgent-update.example.net/';
  const noChallenge = runPipeline({ url, signals: sig });
  assert.notStrictEqual(noChallenge.verdict.level, 'safe', 'precondition: suspicious without the challenge');
  const r = runPipeline({ url, challenge: true, signals: sig });
  assert.strictEqual(r.verdict.level, 'safe');
  assert.strictEqual(r.verdict.suppressed, 'challenge');
});

// ---- 8. nrd-credential needs corroboration ---------------------------------------------------
test('I9: NRD + password with no corroboration is quiet', () => {
  const r = runPipeline({ url: 'https://some-quiet-site.com/login', signals: PW, nrd: true });
  assert.ok(r.verdict.flags.includes('new-domain'));
  assert.ok(!r.verdict.flags.includes('nrd-credential'));
  assert.strictEqual(r.tier, 'quiet');
});
test('I9: NRD + password corroborated by URL score >= 0.15 warns', () => {
  const r = runPipeline({ url: 'http://some-quiet-site.com/login', signals: PW, nrd: true }); // noHttps = 0.15
  assert.ok(r.urlRules.score >= 0.15);
  assert.ok(r.verdict.flags.includes('nrd-credential'));
  assert.strictEqual(r.tier, 'warn');
});
test('I9: credentialFlags corroboration combinations (unit)', () => {
  const base = { verdictFlags: ['new-domain'], hasPasswordField: true, popular: false, host: 'x.test', urlScore: 0, urlReasons: [], domReasons: [] };
  assert.deepStrictEqual(D.credentialFlags(base), []);
  assert.deepStrictEqual(D.credentialFlags(Object.assign({}, base, { urlScore: 0.15 })), ['nrd-credential']);
  assert.deepStrictEqual(D.credentialFlags(Object.assign({}, base, { domReasons: [{ code: 'brandIconMismatch', kind: 'brand' }] })), ['nrd-credential']);
  assert.deepStrictEqual(D.credentialFlags(Object.assign({}, base, { domReasons: [{ code: 'credentialFormForeignDomain', kind: 'page' }] })), ['nrd-credential']);
  assert.deepStrictEqual(D.credentialFlags(Object.assign({}, base, { urlReasons: [{ code: 'brandFuzzyMatch', kind: 'brand', grade: 'weak' }] })), ['nrd-credential']);
});

// ---- 9. tenant branch uses the visible-password signal ---------------------------------------
test('minor 10: a hidden password field on a tenant host is not a credential ask', () => {
  const hidden = H.scoreDom({ pageHost: 'demo-app.vercel.app', hasPasswordField: true, hasVisiblePasswordField: false });
  assert.ok(!hidden.reasons.some((r) => r.code === 'credentialFormOnTenantHost'));
  const shown = H.scoreDom({ pageHost: 'demo-app.vercel.app', hasPasswordField: true, hasVisiblePasswordField: true });
  assert.ok(shown.reasons.some((r) => r.code === 'credentialFormOnTenantHost'));
});
