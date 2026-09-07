// tests/unit/hotlist.test.js — hourly hot list (0.13.0)
const test = require('node:test');
const assert = require('node:assert');
const H = require('../../engine/hotlist.js');
const D = require('../../engine/dnr_rules.js');
const NOW = 1789000000000; const MIN = (ms) => Math.floor(ms / 60000);
const good = () => ({ v: 1, generatedAt: NOW - 60000, ttlMinutes: 360,
  domains: [{ h: 'Signin-ATT-Verifier.webflow.io', s: 'pd', t: MIN(NOW) - 30 }, { h: 'old.example', s: 'pd', t: MIN(NOW) - 49 * 60 }],
  paths: [{ h: 'rb.gy', p: '/88c5r3', s: 'pdb', t: MIN(NOW) - 10 }], removed: ['gone.example'] });

test('parseHot: rejects bad shapes, lower-cases hosts, drops entries outside the 48 h window', () => {
  assert.strictEqual(H.parseHot(null, NOW), null);
  assert.strictEqual(H.parseHot({ v: 2 }, NOW), null);
  assert.strictEqual(H.parseHot({ v: 1, generatedAt: 'x', domains: [] }, NOW), null);
  const hot = H.parseHot(good(), NOW);
  assert.deepStrictEqual(hot.domains.map((d) => d.h), ['signin-att-verifier.webflow.io']);
  assert.deepStrictEqual(hot.paths, [{ h: 'rb.gy', p: '/88c5r3', s: 'pdb', t: MIN(NOW) - 10 }]);
  assert.deepStrictEqual(hot.removed, ['gone.example']);
});

test('parseHot: caps at MAX_DOMAINS newest-first', () => {
  // Offsets must stay inside the 48 h (2880-minute) window or the window
  // filter — not the cap — would be what trims the list; halving `i` keeps
  // all 5000 entries within the window while preserving newest-first order.
  const g = good(); g.domains = Array.from({ length: 5000 }, (_, i) => ({ h: `h${i}.example`, s: 'pd', t: MIN(NOW) - Math.floor(i / 2) }));
  const hot = H.parseHot(g, NOW);
  assert.strictEqual(hot.domains.length, H.MAX_DOMAINS);
  assert.strictEqual(hot.domains[0].h, 'h0.example');
});

test('isStale: generatedAt older than ttlMinutes', () => {
  assert.strictEqual(H.isStale(H.parseHot(good(), NOW), NOW), false);
  assert.strictEqual(H.isStale(H.parseHot(good(), NOW), NOW + 7 * 3600000), true);
});

test('guardHot: drops user exemptions, SAFE_DOMAINS, known brand registrables, verified namespaces', () => {
  // status.cloudflare.com is SAFE_DOMAINS-only, secure.chase.com is
  // KNOWN_BRAND_REGISTRABLES-only (neither list holds the other's entry),
  // so each exercises exactly one drop reason. www.google.com/pay.paypal.com
  // would not work here: both google.com and paypal.com sit in BOTH lists,
  // so they can never disambiguate which guard caught them.
  const g = good(); g.domains.push({ h: 'status.cloudflare.com', s: 'pd', t: MIN(NOW) }, { h: 'secure.chase.com', s: 'pd', t: MIN(NOW) },
    { h: 'hdfc.bank.in', s: 'pd', t: MIN(NOW) }, { h: 'paused.example', s: 'pd', t: MIN(NOW) }, { h: 'trusted.example', s: 'pd', t: MIN(NOW) });
  const hot = H.parseHot(g, NOW);
  const out = H.guardHot(hot, { allowlist: ['trusted.example'], pausedSites: { 'paused.example': NOW + 3600000 } }, NOW);
  assert.deepStrictEqual(out.domains, ['signin-att-verifier.webflow.io']);
  assert.deepStrictEqual(out.paths, [{ h: 'rb.gy', p: '/88c5r3' }]);
  assert.deepStrictEqual(out.dropped, { exempt: 2, safe: 1, brand: 1, verified: 1, expired: 0 });
});

test('guardHot: a path entry on an exempt host is dropped too; stale file yields nothing', () => {
  const hot = H.parseHot(good(), NOW);
  assert.deepStrictEqual(H.guardHot(hot, { allowlist: ['rb.gy'] }, NOW).paths, []);
  assert.deepStrictEqual(H.guardHot(hot, {}, NOW + 7 * 3600000), { domains: [], paths: [], dropped: { exempt: 0, safe: 0, brand: 0, verified: 0, expired: 2 } });
});

test('hotRules + hotRuleIds: HOT_BASE redirect chunks then PATH_BASE regex rules', () => {
  const target = 'chrome-extension://abc/blocked.html';
  const rules = H.hotRules({ domains: ['a.example', 'b.example'], paths: [{ h: 'rb.gy', p: '/x' }] }, target);
  assert.deepStrictEqual(rules.map((r) => r.id), [D.HOT_BASE, D.PATH_BASE]);
  assert.deepStrictEqual(rules[0].condition.requestDomains, ['a.example', 'b.example']);
  assert.deepStrictEqual(H.hotRuleIds([{ id: 100000 }, { id: 400003 }, { id: 500010 }, { id: 300000 }]), [400003, 500010]);
});
