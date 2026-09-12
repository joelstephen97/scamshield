'use strict';
const test = require('node:test'); const assert = require('node:assert');
const D = require('../../engine/decisions');
test('kinds are fixed', () => { assert.deepStrictEqual(D.WARNING_KINDS, ['clipboard', 'leak', 'notify', 'credpost']); });
test('withMute/isMuted/withoutMute round trip, immutable', () => {
  const a = {}; const b = D.withMute(a, 'Ollama.com', 'clipboard', 'clipboard-toast', 1000);
  assert.deepStrictEqual(a, {}); assert.ok(D.isMuted(b, 'ollama.com', 'clipboard')); assert.ok(!D.isMuted(b, 'ollama.com', 'leak'));
  assert.deepStrictEqual(b['ollama.com'].clipboard, { via: 'clipboard-toast', at: 1000 });
  const c = D.withoutMute(b, 'ollama.com', 'clipboard'); assert.ok(!D.isMuted(c, 'ollama.com', 'clipboard')); assert.ok(!('ollama.com' in c));
});
test('unknown kind is never muted and never stored', () => { const b = D.withMute({}, 'x.com', 'bogus', 'v', 1); assert.deepStrictEqual(b, {}); assert.ok(!D.isMuted(b, 'x.com', 'bogus')); });
test('sanitizeMuted drops junk and caps at 2000 domains', () => {
  const out = D.sanitizeMuted({ 'a.com': { clipboard: { via: 'x', at: 5 }, nope: {}, leak: 'str' }, 7: {}, 'b.com': null });
  assert.deepStrictEqual(out, { 'a.com': { clipboard: { via: 'x', at: 5 } } });
  assert.deepStrictEqual(D.sanitizeMuted(null), {}); assert.deepStrictEqual(D.sanitizeMuted([]), {});
  const big = {}; for (let i = 0; i < 2100; i++) big['d' + i + '.com'] = { leak: { via: 'v', at: i } };
  assert.strictEqual(Object.keys(D.sanitizeMuted(big)).length, 2000);
});
test('listMuted flattens newest first', () => {
  const m = D.withMute(D.withMute({}, 'a.com', 'leak', 'v', 1), 'b.com', 'notify', 'v', 2);
  assert.deepStrictEqual(D.listMuted(m).map((r) => r.domain + ':' + r.kind), ['b.com:notify', 'a.com:leak']);
});
