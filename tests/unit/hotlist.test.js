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

test('parseHot: caps at MAX_DOMAINS (12,000) newest-first', () => {
  assert.strictEqual(H.MAX_DOMAINS, 12000);
  // Offsets must stay inside the 48 h (2880-minute) window or the window
  // filter — not the cap — would be what trims the list; dividing `i` by 5
  // keeps all 12,500 entries within the window (max offset 2499 min) while
  // preserving newest-first order.
  const g = good(); g.domains = Array.from({ length: 12500 }, (_, i) => ({ h: `h${i}.example`, s: 'pd', t: MIN(NOW) - Math.floor(i / 5) }));
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
  assert.deepStrictEqual(out.dropped, { apex: 0, exempt: 2, safe: 1, brand: 1, verified: 1, expired: 0 });
});

test('guardHot: a path entry on an exempt host is dropped too; stale file yields nothing', () => {
  const hot = H.parseHot(good(), NOW);
  assert.deepStrictEqual(H.guardHot(hot, { allowlist: ['rb.gy'] }, NOW).paths, []);
  assert.deepStrictEqual(H.guardHot(hot, {}, NOW + 7 * 3600000), { domains: [], paths: [], dropped: { apex: 0, exempt: 0, safe: 0, brand: 0, verified: 0, expired: 2 } });
});

// 0.13.0 final review (C1): a feed row naming a whole namespace rather than a
// host would install ONE redirect rule that blocks every site under it.
test('guardHot: apexes, tenant platforms and bare public suffixes are dropped as `apex`', () => {
  const g = good();
  const bad = ['com', 'co.uk', 'vercel.app', 'duckdns.org', 'app'];
  g.domains = bad.map((h) => ({ h, s: 'pd', t: MIN(NOW) })).concat([{ h: 'foo.vercel.app', s: 'pd', t: MIN(NOW) }]);
  g.paths = [{ h: 'pages.dev', p: '/x', s: 'pd', t: MIN(NOW) }];
  const out = H.guardHot(H.parseHot(g, NOW), {}, NOW);
  assert.deepStrictEqual(out.domains, ['foo.vercel.app']);   // a real tenant stays blockable
  assert.deepStrictEqual(out.paths, []);
  assert.strictEqual(out.dropped.apex, bad.length + 1);      // 5 domains + 1 path host
  assert.strictEqual(out.dropped.safe + out.dropped.brand + out.dropped.verified + out.dropped.exempt, 0);
});

test('hotRules + hotRuleIds: HOT_BASE redirect chunks then PATH_BASE regex rules', () => {
  const target = 'chrome-extension://abc/blocked.html';
  const rules = H.hotRules({ domains: ['a.example', 'b.example'], paths: [{ h: 'rb.gy', p: '/x' }] }, target);
  assert.deepStrictEqual(rules.map((r) => r.id), [D.HOT_BASE, D.PATH_BASE]);
  assert.deepStrictEqual(rules[0].condition.requestDomains, ['a.example', 'b.example']);
  assert.deepStrictEqual(H.hotRuleIds([{ id: 100000 }, { id: 400003 }, { id: 500010 }, { id: 300000 }]), [400003, 500010]);
});
