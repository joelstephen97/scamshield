// tests/unit/linkguard_rules.test.js — pure helpers behind the live link guard (0.15.0, Task 15).
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../engine/constants.js');
const L = require('../../engine/linkguard_rules.js');

const BASE = 'https://social.example/feed';

test('unwrap table: Google /url, l.facebook.com, l.instagram.com and Outlook safelinks resolve to the destination', () => {
  const dest = 'https://evil.example/path?x=1';
  const enc = encodeURIComponent(dest);
  assert.strictEqual(C.unwrapSerpRedirect('https://www.google.com/url?q=' + enc, BASE), dest);
  assert.strictEqual(C.unwrapSerpRedirect('https://l.facebook.com/l.php?u=' + enc + '&h=abc', BASE), dest);
  assert.strictEqual(C.unwrapSerpRedirect('https://lm.facebook.com/l.php?u=' + enc, BASE), dest);
  assert.strictEqual(C.unwrapSerpRedirect('https://l.instagram.com/?u=' + enc + '&e=x', BASE), dest);
  assert.strictEqual(C.unwrapSerpRedirect('https://eur01.safelinks.protection.outlook.com/?url=' + enc + '&data=x', BASE), dest);
  // Not a redirect endpoint: left alone.
  assert.strictEqual(C.unwrapSerpRedirect('https://www.facebook.com/?u=' + enc, BASE), 'https://www.facebook.com/?u=' + enc);
});

test('destination(): unwraps, lowercases, and drops non-http(s), same-site and malformed links', () => {
  assert.deepStrictEqual(L.destination('https://l.facebook.com/l.php?u=' + encodeURIComponent('http://Evil.Example/a'), BASE, 'social.example'),
    { url: 'http://evil.example/a', host: 'evil.example' });
  assert.strictEqual(L.destination('mailto:a@b.example', BASE, 'social.example'), null);
  assert.strictEqual(L.destination('javascript:void(0)', BASE, 'social.example'), null);
  assert.strictEqual(L.destination('#top', BASE, 'social.example'), null);
  assert.strictEqual(L.destination('/relative/path', BASE, 'social.example'), null, 'same host');
  assert.strictEqual(L.destination('https://cdn.social.example/x', BASE, 'social.example'), null, 'same registrable domain');
  assert.strictEqual(L.destination('', BASE, 'social.example'), null);
  assert.strictEqual(L.destination('http://[bad', BASE, 'social.example'), null);
  assert.strictEqual(L.destination('https://other.example/', BASE, 'social.example').host, 'other.example');
});

test('levelFor(): block/warn pass through, popular never marks, a lookalike alone is warn', () => {
  assert.strictEqual(L.levelFor({ level: 'block', popular: false, lookalike: false }), 'block');
  assert.strictEqual(L.levelFor({ level: 'warn', popular: false, lookalike: false }), 'warn');
  assert.strictEqual(L.levelFor({ level: null, popular: false, lookalike: true }), 'warn');
  assert.strictEqual(L.levelFor({ level: 'block', popular: true, lookalike: false }), null, 'popular host is never marked');
  assert.strictEqual(L.levelFor({ level: null, popular: false, lookalike: false }), null);
  assert.strictEqual(L.levelFor(null), null);
  assert.strictEqual(L.levelFor('block'), null, 'legacy string shape is not trusted');
  assert.strictEqual(L.levelFor({ level: 'block', lookalike: true }), 'block', 'block outranks lookalike');
});

test('planBatch(): skips cached/pending hosts, caps the batch, and spends the per-minute budget only on new hosts', () => {
  const cache = new Map([['seen.example', null]]);
  const budget = L.newHostBudget(5, 60000);
  const first = L.planBatch(['seen.example', 'a.example', 'b.example', 'a.example'], cache, budget, 1000, 50);
  assert.deepStrictEqual(first, ['a.example', 'b.example']);
  // 3 left in this window.
  const second = L.planBatch(['c.example', 'd.example', 'e.example', 'f.example', 'g.example'], cache, budget, 2000, 50);
  assert.deepStrictEqual(second, ['c.example', 'd.example', 'e.example']);
  // Window rolls over: allowance is back.
  const third = L.planBatch(['f.example', 'g.example'], cache, budget, 62000, 50);
  assert.deepStrictEqual(third, ['f.example', 'g.example']);
});

test('planBatch(): maxBatch caps one lookup', () => {
  const hosts = Array.from({ length: 80 }, (_, i) => 'h' + i + '.example');
  const out = L.planBatch(hosts, new Map(), L.newHostBudget(200, 60000), 0, 50);
  assert.strictEqual(out.length, 50);
});

test('shouldIntercept(): ctrl/meta/shift/middle clicks still count; untrusted and right-click never', () => {
  assert.strictEqual(L.shouldIntercept({ type: 'click', isTrusted: true, button: 0 }), true);
  assert.strictEqual(L.shouldIntercept({ type: 'click', isTrusted: true, button: 0, ctrlKey: true }), true);
  assert.strictEqual(L.shouldIntercept({ type: 'click', isTrusted: true, button: 0, metaKey: true }), true);
  assert.strictEqual(L.shouldIntercept({ type: 'auxclick', isTrusted: true, button: 1 }), true);
  assert.strictEqual(L.shouldIntercept({ type: 'auxclick', isTrusted: true, button: 2 }), false, 'right-click is a context menu');
  assert.strictEqual(L.shouldIntercept({ type: 'keydown', isTrusted: true, key: 'Enter' }), true);
  assert.strictEqual(L.shouldIntercept({ type: 'keydown', isTrusted: true, key: 'a' }), false);
  assert.strictEqual(L.shouldIntercept({ type: 'click', isTrusted: false, button: 0 }), false);
  assert.strictEqual(L.shouldIntercept(null), false);
});
