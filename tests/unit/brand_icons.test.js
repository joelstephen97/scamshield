const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path');
const { hamming } = require('../../engine/image_hash');
const C = require('../../engine/constants');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '../../engine/brand_icons.json'), 'utf8'));

test('every table brand exists in BRANDS and has 1–4 valid hashes', () => {
  const keys = new Set(C.BRANDS.map((b) => b.key));
  for (const b of T.brands) { assert.ok(keys.has(b.key), b.key); assert.ok(b.hashes.length >= 1 && b.hashes.length <= 4); for (const h of b.hashes) assert.match(h, /^[0-9a-f]{16}$/); }
});
test('no two brands have hashes closer than 12 bits (ambiguity guard)', () => {
  for (let i = 0; i < T.brands.length; i++) for (let j = i + 1; j < T.brands.length; j++)
    for (const a of T.brands[i].hashes) for (const b of T.brands[j].hashes)
      assert.ok(hamming(a, b) >= 12, `${T.brands[i].key} vs ${T.brands[j].key}: ${hamming(a, b)}`);
});
test('at least 45 brands have icon hashes', () => { assert.ok(T.brands.length >= 45); });

test('table is version 2 with per-hash provenance entries', () => {
  assert.equal(T.version, 2);
  for (const b of T.brands) {
    assert.ok(Array.isArray(b.entries) && b.entries.length >= 1, b.key + ' has entries');
    for (const e of b.entries) {
      assert.ok(['icon', 'logo'].includes(e.kind), `${b.key} entry kind: ${e.kind}`);
      assert.match(e.src, /^https?:\/\//, `${b.key} entry src: ${e.src}`);
      assert.match(e.hash, /^[0-9a-f]{16}$/, `${b.key} entry hash: ${e.hash}`);
    }
    const entryHashes = new Set(b.entries.map((e) => e.hash));
    assert.deepEqual(new Set(b.hashes), entryHashes, `${b.key}: hashes must equal unique entry hashes`);
  }
});
