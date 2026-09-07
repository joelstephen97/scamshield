// tests/unit/gateway.test.js — unlisted gateway → foreign landing (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path');
const S = require('../../engine/site_signals.js');
test('gatewaySignal fires on cross-registrable redirect from a short random path', () => {
  const r = S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://mgpxq.com/jvNbNyJf', landingHost: 'kit.example' });
  assert.deepStrictEqual(r, { score: 0.25, reasons: [{ code: 'gatewayRedirect', kind: 'link', params: ['mgpxq.com'] }] });
});
test('gatewaySignal is silent for same-domain, no-redirect, descriptive paths, and safe origins', () => {
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://kit.example/x1y2z3', landingHost: 'www.kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 0, originalUrl: 'https://mgpxq.com/jvNbNyJf', landingHost: 'kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://news.example/2026/09/article-title', landingHost: 'kit.example' }).score, 0);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://t.co/abc123', landingHost: 'kit.example' }).score, 0.25);
  assert.strictEqual(S.gatewaySignal({ redirectCount: 1, originalUrl: 'https://www.google.com/url?q=x', landingHost: 'kit.example' }).score, 0);
});

// review round 1: lastNavigation (background/service_worker.js) is keyed by
// tabId, so it only ever holds the TOP page's pre-redirect URL. A sub-frame
// with its own redirectCount > 0 (ad iframes commonly have one) must never
// run this block — it would compare the top page's original host against
// the sub-frame's own hostname and could inject a false gatewayRedirect
// reason into a sub-frame verdict, which frameVerdicts' merge in
// background/service_worker.js can promote to the tab's effective verdict.
test('content script gates the gateway-signal block on IS_TOP (top frame only)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../content/content_script.js'), 'utf8');
  const navBlock = /if \(IS_TOP\) \{\s*\n\s*const navEntry = performance\.getEntriesByType\('navigation'\)\[0\];\s*\n\s*if \(navEntry && navEntry\.redirectCount > 0\) \{[\s\S]*?SS\.gatewaySignal\(/;
  assert.ok(navBlock.test(src), 'gatewaySignal call is not nested inside an IS_TOP gate in content/content_script.js');
});
