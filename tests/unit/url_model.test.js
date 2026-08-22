const test = require('node:test');
const assert = require('node:assert');
const um = require('../../engine/url_model');

// Two hand-made trees. Tree 0: if x[0] <= 5 → -1.0 else +1.0. Tree 1: leaf +0.5.
const TINY = {
  version: 2, features: ['a', 'b'], baseline: 0.0,
  trees: [
    { nodes: [[0, 5, 1, 2, 0, 1], [-1, 0, -1, -1, -1.0, 0], [-1, 0, -1, -1, 1.0, 0]] },
    { nodes: [[-1, 0, -1, -1, 0.5, 0]] }
  ]
};
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

test('predictUrlProb sums leaf values + baseline through a sigmoid', () => {
  assert.ok(Math.abs(um.predictUrlProb([3, 0], TINY) - sigmoid(-1.0 + 0.5)) < 1e-9);
  assert.ok(Math.abs(um.predictUrlProb([9, 0], TINY) - sigmoid(1.0 + 0.5)) < 1e-9);
});

test('NaN follows missingLeft', () => {
  assert.ok(Math.abs(um.predictUrlProb([NaN, 0], TINY) - sigmoid(-0.5)) < 1e-9);
});

test('predict() API: null without a model, probability with one', async () => {
  um._resetForTest();
  assert.equal(um.isAvailable(), false);
  assert.equal(await um.predict([1, 2]), null);
  um.setUrlModel(TINY);
  assert.equal(um.isAvailable(), true);
  assert.ok(Math.abs((await um.predict([9, 0])) - sigmoid(1.5)) < 1e-9);
});
