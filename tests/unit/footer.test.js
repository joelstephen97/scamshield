// tests/unit/footer.test.js — rotating popup footer slot (0.8.0)
const test = require('node:test');
const assert = require('node:assert');
const F = require('../../ui/footer');

test('ROTATION exposes the two non-review slots, trust first', () => {
  assert.deepEqual(F.ROTATION, ['trust', 'support']);
});

test('nextVariant defaults to the first slot on a fresh install (nothing persisted yet)', () => {
  assert.equal(F.nextVariant(undefined), 'trust');
  assert.equal(F.nextVariant(null), 'trust');
  assert.equal(F.nextVariant(''), 'trust');
});

test('nextVariant alternates trust <-> support', () => {
  assert.equal(F.nextVariant('trust'), 'support');
  assert.equal(F.nextVariant('support'), 'trust');
});

test('nextVariant resets to the first slot on a stray/corrupt stored value', () => {
  assert.equal(F.nextVariant('bogus'), 'trust');
  assert.equal(F.nextVariant('review'), 'trust'); // review is never a persisted rotation value
});
