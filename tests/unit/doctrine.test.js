// tests/unit/doctrine.test.js — the warning doctrine (0.15.0): one pure function decides stop / warn / quiet
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../engine/doctrine.js');

const v = (level, flags = []) => ({ level, flags });
const ctx = (o = {}) => Object.assign({ popular: false, strictMode: false, isTop: true, host: 'example.test' }, o);

const table = [
  // [name, verdict, ctx, expected]
  ['rule 1: safe is quiet', v('safe'), ctx(), 'quiet'],
  ['rule 1: safe + stop flag is still quiet', v('safe', ['clickfix']), ctx(), 'quiet'],
  ['rule 2: feed-block dangerous -> stop', v('dangerous', ['feed-block']), ctx(), 'stop'],
  ['rule 2: popular + feed-block -> stop', v('dangerous', ['feed-block']), ctx({ popular: true }), 'stop'],
  ['rule 2: clickfix dangerous -> stop', v('dangerous', ['clickfix']), ctx(), 'stop'],
  ['rule 2: seed-phrase-harvest -> stop', v('dangerous', ['seed-phrase-harvest']), ctx(), 'stop'],
  ['rule 2: fake-browser-update -> stop', v('dangerous', ['fake-browser-update']), ctx(), 'stop'],
  ['rule 2: delivery-fee-scam -> stop', v('dangerous', ['delivery-fee-scam']), ctx(), 'stop'],
  ['rule 2: stop flag but only suspicious is not stop', v('suspicious', ['clickfix']), ctx(), 'quiet'],
  ['rule 3: popular + brand-impersonation-content -> quiet', v('dangerous', ['brand-impersonation-content']), ctx({ popular: true }), 'quiet'],
  ['rule 3: popular + credential-form-foreign-domain -> quiet', v('dangerous', ['credential-form-foreign-domain']), ctx({ popular: true }), 'quiet'],
  ['rule 3: popular + unflagged dangerous -> quiet', v('dangerous'), ctx({ popular: true }), 'quiet'],
  ['rule 3: popular + unverified feed-warn -> quiet', v('suspicious', ['feed-warn']), ctx({ popular: true }), 'quiet'],
  ['rule 3: popular + feed-warn-unverified -> quiet', v('suspicious', ['feed-warn-unverified']), ctx({ popular: true }), 'quiet'],
  ['rule 3: popular + feed-warn-verified -> warn', v('suspicious', ['feed-warn-verified']), ctx({ popular: true }), 'warn'],
  ['rule 3: popular + feed-warn-corroborated dangerous -> warn', v('dangerous', ['feed-warn-corroborated', 'feed-warn', 'feed-warn-verified']), ctx({ popular: true }), 'warn'],
  ['rule 4: dangerous with a non-listed flag -> warn', v('dangerous', ['wallet-drainer']), ctx(), 'warn'],
  ['rule 4: dangerous no flags -> warn', v('dangerous'), ctx(), 'warn'],
  ['rule 5: suspicious + brand-impersonation-visual -> warn', v('suspicious', ['brand-impersonation-visual']), ctx(), 'warn'],
  ['rule 5: suspicious + tenant -> warn', v('suspicious', ['brand-impersonation-tenant']), ctx(), 'warn'],
  ['rule 5: suspicious + verified feed-warn -> warn', v('suspicious', ['feed-warn', 'feed-warn-verified']), ctx(), 'warn'],
  ['rule 5: suspicious + unverified feed-warn -> quiet', v('suspicious', ['feed-warn-unverified']), ctx(), 'quiet'],
  ['rule 5: unverified feed-warn on a dangerous verdict still warns', v('dangerous', ['feed-warn-unverified']), ctx(), 'warn'],
  ['rule 6: non-popular suspicious no flags -> quiet', v('suspicious'), ctx(), 'quiet'],
  ['rule 6: suspicious with unrelated flag -> quiet', v('suspicious', ['new-domain']), ctx(), 'quiet'],
  ['rule 7: strict + quiet -> quiet', v('suspicious'), ctx({ strictMode: true }), 'quiet'],
  ['rule 7: strict + safe -> quiet', v('safe'), ctx({ strictMode: true }), 'quiet'],
  ['rule 7: strict + warn -> stop', v('dangerous'), ctx({ strictMode: true }), 'stop'],
  ['rule 7: strict + popular guard still quiet', v('dangerous', ['brand-impersonation-content']), ctx({ strictMode: true, popular: true }), 'quiet'],
  ['missing flags array tolerated', { level: 'dangerous' }, ctx(), 'warn'],
  ['null verdict -> quiet', null, ctx(), 'quiet'],
  ['missing ctx tolerated', v('dangerous', ['clickfix']), undefined, 'stop'],
  // user-content hosts: popular guard does not apply
  ['ucd: popular on sites.google.com + brand flag -> warn', v('dangerous', ['brand-impersonation-content']), ctx({ popular: true, host: 'sites.google.com' }), 'warn'],
  ['ucd: popular on foo.sharepoint.com + dangerous -> warn', v('dangerous'), ctx({ popular: true, host: 'foo.sharepoint.com' }), 'warn'],
  ['ucd: www.google.com popular is shielded', v('dangerous', ['brand-impersonation-content']), ctx({ popular: true, host: 'www.google.com' }), 'quiet'],
];
for (const [name, verdict, c, expected] of table) {
  test('surfaceTier: ' + name, () => assert.strictEqual(D.surfaceTier(verdict, c), expected));
}

test('STOP_FLAGS and CONFIDENT_FLAGS are exported with the specified members', () => {
  assert.deepStrictEqual([...D.STOP_FLAGS].sort(), ['clickfix', 'delivery-fee-scam', 'fake-browser-update', 'feed-block', 'seed-phrase-harvest']);
  assert.deepStrictEqual([...D.CONFIDENT_FLAGS].sort(), ['brand-impersonation-content', 'brand-impersonation-tenant', 'brand-impersonation-visual', 'brand-lookalike-credential', 'credential-exfil', 'credential-form-foreign-domain', 'feed-warn-corroborated', 'feed-warn-verified', 'insecure-credential', 'nrd-brand-host', 'nrd-credential', 'tenant-credential']);
});

test('isUserContentHost: exact, subdomain, www, case-insensitive', () => {
  for (const h of ['sites.google.com', 'foo.sharepoint.com', 'WWW.Sites.Google.com', 'a.b.notion.site', 'forms.gle', 'x.wixsite.com', 'my.canva.site', 'foo.dl.dropboxusercontent.com', 'www.dropbox.com']) {
    assert.strictEqual(D.isUserContentHost(h), true, h);
  }
  for (const h of ['www.google.com', 'google.com', 'evilsharepoint.com', 'sharepoint.com.evil.test', 'example.test', '', null, undefined]) {
    assert.strictEqual(D.isUserContentHost(h), false, String(h));
  }
});
test('USER_CONTENT_HOSTS lists the ruled hosts', () => {
  assert.strictEqual(D.USER_CONTENT_HOSTS.length, 43);
  assert.ok(D.USER_CONTENT_HOSTS.includes('firebasestorage.googleapis.com'));
});

// --- credential-backed confident flags (0.15.0 fix round 1) ---
// urlScore 0.2: corroborated (final fix A, I9); the uncorroborated case is covered in final_fix_a.test.js
const cf = (o) => D.credentialFlags(Object.assign({ verdictFlags: [], urlReasons: [], urlScore: 0.2, hasPasswordField: true, popular: false, host: 'example.test' }, o));
test('nrd-credential: new-domain + password, not popular', () => {
  assert.deepStrictEqual(cf({ verdictFlags: ['new-domain'] }), ['nrd-credential']);
  assert.deepStrictEqual(cf({ verdictFlags: ['new-domain'], urlScore: 0 }), []);
});
test('nrd-credential: not without a password field, not on popular, but yes on a user-content host', () => {
  assert.deepStrictEqual(cf({ verdictFlags: ['new-domain'], hasPasswordField: false }), []);
  assert.deepStrictEqual(cf({ verdictFlags: ['new-domain'], popular: true }), []);
  assert.deepStrictEqual(cf({ verdictFlags: ['new-domain'], popular: true, host: 'x.sharepoint.com' }), ['nrd-credential']);
  assert.deepStrictEqual(cf({}), []);
});
test('brand-lookalike-credential: grades and codes', () => {
  const r = (code, grade) => [{ code, grade }];
  assert.deepStrictEqual(cf({ urlReasons: r('brandFuzzyMatch', 'strong') }), ['brand-lookalike-credential']);
  assert.deepStrictEqual(cf({ urlReasons: r('brandFuzzyMatch', 'strongest') }), ['brand-lookalike-credential']);
  assert.deepStrictEqual(cf({ urlReasons: r('brandFuzzyMatch', 'weak') }), []);
  assert.deepStrictEqual(cf({ urlReasons: r('brandFuzzyMatch') }), []);
  for (const c of ['brandLookalike', 'brandForeignSuffix', 'idnHomograph']) assert.deepStrictEqual(cf({ urlReasons: r(c) }), ['brand-lookalike-credential'], c);
  assert.deepStrictEqual(cf({ urlReasons: r('manySubdomains') }), []);
});
test('brand-lookalike-credential: needs password and non-popular', () => {
  const urlReasons = [{ code: 'brandLookalike', kind: 'brand' }];
  assert.deepStrictEqual(cf({ urlReasons, hasPasswordField: false }), []);
  assert.deepStrictEqual(cf({ urlReasons, popular: true }), []);
  assert.deepStrictEqual(cf({ urlReasons, verdictFlags: ['new-domain'] }), ['nrd-credential', 'brand-lookalike-credential']);
});
test('new flags are warn-tier, never stop', () => {
  for (const f of ['nrd-credential', 'brand-lookalike-credential']) {
    assert.ok(D.CONFIDENT_FLAGS.includes(f)); assert.ok(!D.STOP_FLAGS.includes(f));
    assert.strictEqual(D.surfaceTier(v('suspicious', [f]), ctx()), 'warn');
    assert.strictEqual(D.surfaceTier(v('dangerous', [f]), ctx()), 'warn');
    assert.strictEqual(D.surfaceTier(v('suspicious', [f]), ctx({ popular: true })), 'quiet');
  }
});
test('effectivePopular', () => {
  assert.strictEqual(D.effectivePopular(true, 'www.google.com'), true);
  assert.strictEqual(D.effectivePopular(true, 'sites.google.com'), false);
  assert.strictEqual(D.effectivePopular(false, 'a.test'), false);
});

// (0.15.0, after bench Run 8) a new domain carrying a brand as a whole label or hyphen token warns without a form.
test('nrd-brand-host: new domain + strongest brand token warns; every missing piece stays quiet', () => {
  const fin = (verdict, o = {}) => D.finalizeVerdict(verdict, Object.assign({
    urlRules: { score: 0.75, reasons: [{ code: 'brandFuzzyMatch', kind: 'brand', params: ['Vinted'], grade: 'strongest' }, { code: 'riskAbusedTld', kind: 'link' }] },
    domRules: { score: 0, reasons: [] }, signals: {}, popular: false, host: 'vinted-offer.info', isTop: true
  }, o));
  const nrd = { level: 'suspicious', score: 0.95, reasons: [], reasonCodes: [], flags: ['new-domain'] };
  const hit = fin(nrd);
  assert.strictEqual(hit.tier, 'warn');
  assert.ok(hit.verdict.flags.includes('nrd-brand-host'));
  // no new-domain flag (an old site with the same name): quiet
  assert.strictEqual(fin(Object.assign({}, nrd, { flags: [] })).tier, 'quiet');
  // popular host: quiet
  assert.strictEqual(fin(nrd, { popular: true }).tier, 'quiet');
  // a one-edit typo (grade strong) is not enough without a form
  assert.strictEqual(fin(nrd, { urlRules: { score: 0.5, reasons: [{ code: 'brandFuzzyMatch', kind: 'brand', grade: 'strong' }] } }).tier, 'quiet');
  // a safe verdict is never lifted by this flag
  assert.strictEqual(fin(Object.assign({}, nrd, { level: 'safe' })).tier, 'quiet');
  // an IDN homograph counts
  assert.strictEqual(fin(nrd, { urlRules: { score: 0.6, reasons: [{ code: 'idnHomograph', kind: 'brand' }] }, host: 'xn--pypal-4ve.com' }).tier, 'warn');
  // never stop, even in the normal mode
  assert.ok(!D.STOP_FLAGS.includes('nrd-brand-host'));
});

// 0.15.0 tenant shield: a tenant sub-domain of a shared-hosting platform is never shielded by the popular guard.
const tcf = (o) => D.credentialFlags(Object.assign({ verdictFlags: [], urlReasons: [], urlScore: 0.2, hasPasswordField: true, hasLoginPair: true, popular: true, host: 'example.test' }, o));
test('tenant shield: popularMode is none on a tenant sub-domain (defence in depth, popular input forced true)', () => {
  assert.strictEqual(D.popularMode(true, 'daniho.dyn.ddnss.de'), 'none');
  assert.strictEqual(D.popularMode(true, 'storslnea.z15.web.core.windows.net'), 'none');
  assert.strictEqual(D.popularMode(true, 'xmbx1.duckdns.org'), 'none');
  assert.strictEqual(D.popularMode(true, 'www.evil.duckdns.org'), 'none');
  assert.strictEqual(D.popularMode(true, 'mail.google.com'), 'full');
});
test('tenant shield: popularEligible is false for tenants, true for ordinary hosts (the rule isPopularHost calls)', () => {
  const C = require('../../engine/constants.js');
  for (const h of ['daniho.dyn.ddnss.de', 'storslnea.z15.web.core.windows.net', 'x.duckdns.org', 'www.evil.duckdns.org']) assert.strictEqual(C.popularEligible(h), false, h);
  for (const h of ['mail.google.com', 'www.google.com', 'wikipedia.org']) assert.strictEqual(C.popularEligible(h), true, h);
});
test('tenant shield: www.evil.<apex> keeps evil as its tenant label; bare www.<apex> and the apex have none', () => {
  const C = require('../../engine/constants.js');
  assert.strictEqual(C.tenantLabel('www.evil.duckdns.org'), 'evil');
  assert.strictEqual(C.tenantLabel('www.x.web.core.windows.net'), 'x');
  assert.strictEqual(C.tenantLabel('www.duckdns.org'), null);
  assert.strictEqual(C.tenantLabel('ddnss.de'), null);
  assert.strictEqual(C.tenantLabel('www.ddnss.de'), null);
  assert.strictEqual(C.tenantLabel('daniho.dyn.ddnss.de'), 'daniho');
});
test('tenant shield: daniho.dyn.ddnss.de credential-form-foreign-domain (even with popular:true) -> warn; ddnss.de has no tenant label', () => {
  assert.strictEqual(D.surfaceTier(v('dangerous', ['credential-form-foreign-domain']), ctx({ popular: true, host: 'daniho.dyn.ddnss.de' })), 'warn');
});
test('tenant shield: with popular:true (the SW sets it only for set members), mail.google.com stays shielded', () => {
  for (const host of ['mail.google.com'])
    assert.strictEqual(D.surfaceTier(v('dangerous', ['credential-form-foreign-domain']), ctx({ popular: true, host })), 'quiet', host);
});
test('tenant shield: risk-hosting alone on a duckdns tenant stays quiet', () => {
  assert.strictEqual(D.surfaceTier(v('suspicious', ['risk-hosting']), ctx({ popular: true, host: 'xmbx1.duckdns.org' })), 'quiet');
});
test('tenant shield: storage tenant with a login pair -> tenant-credential and warn; dev hosts do not', () => {
  const host = 'storslnea.z15.web.core.windows.net';
  assert.deepStrictEqual(tcf({ host }), ['tenant-credential']);
  assert.strictEqual(D.surfaceTier(v('suspicious', ['tenant-credential']), ctx({ popular: true, host })), 'warn');
  assert.deepStrictEqual(tcf({ host: 'foo.github.io', popular: false }), []);
  assert.deepStrictEqual(tcf({ host: 'foo.pages.dev', popular: false }), []);
  assert.deepStrictEqual(tcf({ host, hasLoginPair: false }), []);
  assert.deepStrictEqual(tcf({ host: 'abc.r2.dev' }), ['tenant-credential']);
  assert.deepStrictEqual(tcf({ host: 'www.web.core.windows.net' }), []);
});
test('tenant shield: new dyn-DNS apexes are tenant platforms; scope is per-tenant', () => {
  const C = require('../../engine/constants.js');
  for (const a of ['ddnss.de', 'ddns.net', 'no-ip.org', 'no-ip.biz', 'hopto.org', 'zapto.org', 'sytes.net', 'servebeer.com', 'serveftp.com', 'myftp.org', 'freeddns.org', 'dynu.net', 'dyndns.org', 'ddnsfree.com', 'myddns.me', 'duckdns.org', 'ooguy.com', 'dns-dynamic.net']) {
    assert.ok(C.TENANT_PLATFORMS.includes(a), a);
    assert.ok(C.isTenantApex(a), a);
    assert.strictEqual(C.tenantLabel('evil.' + a), 'evil');
    assert.strictEqual(C.scopeDomain('evil.' + a), 'evil.' + a);
  }
  assert.strictEqual(C.tenantLabel('www.ddnss.de'), null);
});
test('tenant shield: Azure AD B2C style forms (every action on a known auth host) get no tenant-credential', () => {
  const host = 'bucket.z15.web.core.windows.net';
  assert.deepStrictEqual(tcf({ host, formActions: ['https://contoso.b2clogin.com/contoso.onmicrosoft.com/B2C_1_signin/SelfAsserted'] }), []);
  assert.deepStrictEqual(tcf({ host, formActions: ['https://login.microsoftonline.com/common/login'] }), []);
  assert.deepStrictEqual(tcf({ host, formActions: ['https://login.live.com/ppsecure/post.srf'] }), []);
  assert.deepStrictEqual(tcf({ host, formActions: ['https://evil.example/post', 'https://x.b2clogin.com/a'] }), ['tenant-credential']);
  assert.deepStrictEqual(tcf({ host, formActions: ['https://b2clogin.com.evil.example/a'] }), ['tenant-credential']);
  assert.deepStrictEqual(tcf({ host, formActions: ['/relative'] }), ['tenant-credential']);
  assert.deepStrictEqual(tcf({ host }), ['tenant-credential']);
});
