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
  assert.deepStrictEqual([...D.CONFIDENT_FLAGS].sort(), ['brand-impersonation-content', 'brand-impersonation-tenant', 'brand-impersonation-visual', 'brand-keyword-host', 'brand-lookalike-credential', 'credential-form-foreign-domain', 'feed-warn-corroborated', 'feed-warn-verified', 'insecure-credential', 'nrd-credential', 'tenant-credential']);
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
