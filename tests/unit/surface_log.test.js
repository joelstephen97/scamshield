// tests/unit/surface_log.test.js — surface log ring + diagnostics formatter (0.15.0).
const test = require('node:test');
const assert = require('node:assert');
const L = require('../../engine/surface_log');
const D = require('../../engine/doctrine');

test('appendRow prepends, caps at 300, rejects bad kind and non-host', () => {
  let list = [];
  for (let i = 0; i < 305; i++) list = L.appendRow(list, { kind: 'banner', host: 'a' + i + '.example' }, 1000 + i);
  assert.equal(list.length, 300);
  assert.equal(list[0].host, 'a304.example');
  assert.deepEqual(Object.keys(list[0]).sort(), ['host', 'kind', 'ts']);
  assert.equal(L.appendRow(list, { kind: 'nope', host: 'x.example' }), list);
  assert.equal(L.appendRow(list, { kind: 'banner', host: 'https://x.example/p?q=1' }), list);
  assert.equal(L.appendRow(null, { kind: 'serp-dot', host: 'www.google.com' }, 5)[0].kind, 'serp-dot');
});

test('formatDiagnostics: booleans + version + 100 rows only, no lists/strings/urls', () => {
  const rows = [];
  for (let i = 0; i < 150; i++) rows.push({ ts: 1_800_000_000_000 + i, host: 'h' + i + '.example', kind: 'toast-leak' });
  const out = L.formatDiagnostics({
    version: '0.15.0', rows,
    settings: { enabled: true, strictMode: false, allowlist: ['secret-bank.example'], otaUrl: 'https://evil.example/feed.json', reportUrl: 'https://r.example', uiLang: 'de', n: 3 }
  });
  assert.match(out, /Version: 0\.15\.0/);
  assert.match(out, /enabled: true/);
  assert.match(out, /strictMode: false/);
  assert.doesNotMatch(out, /secret-bank|evil\.example|r\.example|uiLang|\bde\b|allowlist|otaUrl|n: 3/);
  assert.equal(out.split('\n').filter((l) => /^\d{4}-\d\d-\d\dT/.test(l)).length, 100);
  assert.match(out, /2027-|2026-|2027/);
  assert.doesNotMatch(out, /https?:|[A-Z]:[\\]/);
});

test('formatDiagnostics tolerates garbage', () => {
  assert.match(L.formatDiagnostics(null), /Version: unknown/);
  assert.doesNotThrow(() => L.formatDiagnostics({ rows: [null, { ts: 'x' }], settings: 5 }));
});

test('isSerpPage: only real results pages of search engines', () => {
  const y = [['www.google.com', '/search', ''], ['www.google.com.sa', '/search', '?q=a'], ['www.bing.com', '/search', '?q=a'],
    ['duckduckgo.com', '/', '?q=cats'], ['search.brave.com', '/search', '?q=a'], ['www.ecosia.org', '/search', '?q=a']];
  for (const [h, p, s] of y) assert.equal(D.isSerpPage(h, p, s), true, h + p + s);
  const n = [['mail.google.com', '/mail/u/0/', ''], ['docs.google.com', '/document/d/1', ''], ['maps.google.com', '/', ''],
    ['news.google.com', '/home', ''], ['www.google.com', '/', ''], ['www.google.com', '/maps/search/x', ''], ['duckduckgo.com', '/', ''],
    ['duckduckgo.com', '/', '?ia=web'], ['www.bing.com', '/', ''], ['example.com', '/search', '?q=a']];
  for (const [h, p, s] of n) assert.equal(D.isSerpPage(h, p, s), false, h + p + s);
});
