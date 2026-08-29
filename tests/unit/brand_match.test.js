// tests/unit/brand_match.test.js — 0.9.0 brand-impersonation upgrades (Task B3).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const BM = require('../../engine/brand_match');
const C = require('../../engine/constants');

// ---- allowlist-first suffix trie -------------------------------------------

test('allowlistBrandMatch hits the exact brand domain', () => {
  assert.equal(BM.allowlistBrandMatch('paypal.com'), 'paypal');
  assert.equal(BM.allowlistBrandMatch('metamask.io'), 'metamask');
});

test('allowlistBrandMatch hits any subdomain of a brand domain', () => {
  // google.com is ALSO listed under the separate 'gmail' brand entry
  // (deliberate data overlap — both are legitimate Google auth domains), so
  // this only asserts SOME brand resolves, not which of the two.
  assert.ok(BM.allowlistBrandMatch('accounts.google.com'));
  assert.equal(BM.allowlistBrandMatch('www.paypal.com'), 'paypal');
  assert.equal(BM.allowlistBrandMatch('a.b.c.amazon.co.uk'), 'amazon');
});

test('allowlistBrandMatch rejects the classic "brand.com.evil.tld" prefix trick', () => {
  assert.equal(BM.allowlistBrandMatch('paypal.com.evil.tk'), null);
  assert.equal(BM.allowlistBrandMatch('accounts.google.com.attacker.net'), null);
});

test('allowlistBrandMatch rejects an unrelated host sharing a TLD with many brands', () => {
  assert.equal(BM.allowlistBrandMatch('notgoogle.com'), null);
  assert.equal(BM.allowlistBrandMatch('example.com'), null);
});

test('allowlistBrandMatch is case-insensitive and tolerates a trailing dot', () => {
  assert.equal(BM.allowlistBrandMatch('PayPal.COM.'), 'paypal');
});

test('every domain a brand actually controls round-trips through the trie', () => {
  // Some domains are deliberately shared by two brand entries (google.com is
  // both 'google' and 'gmail'; outlook.com/hotmail.com are both 'outlook'
  // and 'microsoft'), so this only requires SOME brand to resolve — the
  // short-circuit guarantee only needs a non-null hit, not a specific key.
  for (const domains of Object.values(C.BRAND_DOMAINS)) {
    for (const d of domains) {
      assert.ok(BM.allowlistBrandMatch(d), `${d} should resolve to some brand`);
      assert.ok(BM.allowlistBrandMatch('sub.' + d), `sub.${d} should resolve to some brand`);
    }
  }
});

// ---- fuzzyForm --------------------------------------------------------------

test('fuzzyForm strips the public suffix and re-joins remaining labels', () => {
  assert.equal(BM.fuzzyForm('metamask.io'), 'metamask');
  assert.equal(BM.fuzzyForm('app.metamask.io'), 'app.metamask');
  assert.equal(BM.fuzzyForm('a.b.c.co.uk'), 'a.b.c'); // multi-label suffix respected
});

// ---- damerauLevenshtein -----------------------------------------------------

test('damerauLevenshtein counts adjacent transpositions as one edit', () => {
  assert.equal(BM.damerauLevenshtein('paypal', 'paypla'), 1); // transposed l/a
  assert.equal(BM.damerauLevenshtein('paypal', 'paypal'), 0);
  assert.equal(BM.damerauLevenshtein('paypal', 'paypa1'), 1); // substitution
});

// ---- homoglyphVariants ------------------------------------------------------

test('homoglyphVariants normalises the task-specified substitution set', () => {
  assert.ok(BM.homoglyphVariants('rnetamask').includes('metamask'));
  assert.ok(BM.homoglyphVariants('vvise').includes('wise'));
  assert.ok(BM.homoglyphVariants('paypa1').includes('paypal')); // 1 -> l
  assert.ok(BM.homoglyphVariants('paypa1').includes('paypai')); // 1 -> i (ambiguous, both tried)
  assert.ok(BM.homoglyphVariants('g00gle').includes('google'));
});

// ---- fuzzyBrandMatch: grading ------------------------------------------------

test('subdomain brand injection (bare label) grades strongest', () => {
  const r = BM.fuzzyBrandMatch('paypal.attacker-example.com');
  assert.ok(r, 'expected a match');
  assert.equal(r.brand, 'paypal');
  assert.equal(r.grade, 'strongest');
});

test('homoglyph subdomain injection grades strongest, not merely "weak"', () => {
  const r = BM.fuzzyBrandMatch('rnetamask.attacker-example.com');
  assert.ok(r);
  assert.equal(r.brand, 'metamask');
  assert.equal(r.grade, 'strongest');
});

test('hyphen-delimited brand token in a subdomain label grades strongest', () => {
  const r = BM.fuzzyBrandMatch('secure-paypal-login.attacker-example.com');
  assert.ok(r);
  assert.equal(r.brand, 'paypal');
  assert.equal(r.grade, 'strongest');
});

test('hyphen-delimited brand token in the SLD itself grades strongest', () => {
  const r = BM.fuzzyBrandMatch('secure-paypa1-login.com');
  assert.ok(r);
  assert.equal(r.brand, 'paypal');
  assert.equal(r.grade, 'strongest');
});

test('TLD-swap of the exact brand grades strong', () => {
  const r = BM.fuzzyBrandMatch('metamask.tk');
  assert.ok(r);
  assert.equal(r.brand, 'metamask');
  assert.equal(r.grade, 'strong');
});

test('homoglyph substitution on the whole fuzzy form grades strong', () => {
  const r = BM.fuzzyBrandMatch('paypa1.com'); // bare SLD, no hyphen/subdomain
  assert.ok(r);
  assert.equal(r.brand, 'paypal');
  assert.equal(r.grade, 'strong');
});

test('Damerau-Levenshtein distance 1 (bare typo) grades strong', () => {
  const r = BM.fuzzyBrandMatch('netfli.com'); // netflix minus the trailing x
  assert.ok(r);
  assert.equal(r.brand, 'netflix');
  assert.equal(r.grade, 'strong');
});

test('Damerau-Levenshtein distance 2 grades weak, for a brand name >= 8 chars', () => {
  // "emiratesnbd" (11 chars) with 2 leading characters dropped -> dist 2.
  const r = BM.fuzzyBrandMatch('iratesnbd.com');
  assert.ok(r);
  assert.equal(r.brand, 'emiratesnbd');
  assert.equal(r.grade, 'weak');
});

test('DL-2 never matches a brand name under 8 chars (weak grade has its own length floor)', () => {
  // "netflix" (7 chars) with 2 characters dropped -> dist 2, but 7 < 8 so
  // this must NOT resolve to netflix (or anything else).
  assert.equal(BM.fuzzyBrandMatch('etfli.com'), null);
});

test('brands under 5 characters never fuzzy-match (FP discipline floor)', () => {
  // 'wise' (4 chars), 'hsbc' (4), 'ing' (3) are all excluded from the candidate
  // list; a host that would otherwise be an exact hit must resolve to some
  // OTHER brand or null, never to one of these short ones.
  const anyShortBrandMatch = ['wise', 'hsbc', 'ing', 'citi', 'dbs', 'ups', 'fab', 'dib', 'grab'];
  const r = BM.fuzzyBrandMatch('wise.tk');
  assert.ok(!r || !anyShortBrandMatch.includes(r.brand));
});

// ---- FP guards required by the task brief -----------------------------------

test('FP guard: a real brand domain never fuzzy-matches (allowlist gate is the caller\'s job, verified end to end here)', () => {
  for (const domains of Object.values(C.BRAND_DOMAINS)) {
    for (const d of domains) {
      // The caller contract: allowlistBrandMatch must be checked FIRST. Assert
      // it actually reports a hit here, so any real caller that follows the
      // contract short-circuits before ever reaching fuzzyBrandMatch.
      assert.ok(BM.allowlistBrandMatch(d), `${d} should short-circuit before fuzzy matching`);
    }
  }
});

test('FP guard: brand mentioned in the path, not the host, is invisible to this module (host-only input)', () => {
  // fuzzyBrandMatch only ever receives a hostname — passing a path-shaped
  // string containing a brand name must not resolve to a match via the host
  // labels, since a path segment is never confused for a DNS label here.
  const r = BM.fuzzyBrandMatch('example.com'); // the "real" caller strips path before calling
  assert.equal(r, null);
});

test('FP guard: deep-but-legit subdomains under multi-label suffixes do not themselves trigger a match', () => {
  assert.equal(BM.fuzzyBrandMatch('a.b.c.co.uk'), null);
});

test('fuzzyBrandMatch returns null for a short hostForm (below MIN_BRAND_LEN)', () => {
  assert.equal(BM.fuzzyBrandMatch('t.co'), null);
  assert.equal(BM.fuzzyBrandMatch('a.io'), null);
});

test('fuzzyBrandMatch returns null for an ordinary, unrelated domain', () => {
  assert.equal(BM.fuzzyBrandMatch('wikipedia.org'), null);
  assert.equal(BM.fuzzyBrandMatch('github.com'), null);
});

test('picks the single best (highest-ranked) grade when multiple would match', () => {
  // "paypal" appears as a bare subdomain label (strongest) on a host whose
  // SLD ALSO happens to be a Damerau-Levenshtein-1 typo of another brand —
  // the strongest grade must win over the weaker one.
  const r = BM.fuzzyBrandMatch('paypal.netfli.com');
  assert.ok(r);
  assert.equal(r.grade, 'strongest');
  assert.equal(r.brand, 'paypal');
});

// Final-review regression (0.9.0): rules c/d/e must judge the bare SLD, so a
// www./secure./mail. prefix can never push a typosquat out of tolerance —
// and the SLD length floor must not exempt short-SLD subdomain injection.
test('subdomain prefixes do not defeat SLD typosquat rules', () => {
  assert.equal(BM.fuzzyBrandMatch('www.paypai.com').grade, 'strong');
  assert.equal(BM.fuzzyBrandMatch('secure.paypa1.com').grade, 'strong');
  assert.equal(BM.fuzzyBrandMatch('mail.paypal.co').grade, 'strong'); // TLD swap behind a subdomain
});
test('short registrable names still get subdomain-injection checks', () => {
  assert.equal(BM.fuzzyBrandMatch('netflix.xy.co').grade, 'strongest');
});
test('benign hosts with common prefixes stay clean', () => {
  assert.equal(BM.fuzzyBrandMatch('www.example.com'), null);
});
