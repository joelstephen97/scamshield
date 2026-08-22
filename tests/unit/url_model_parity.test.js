// tests/unit/url_model_parity.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractUrlFeatures } = require('../../engine/features');
const { predictUrlProb } = require('../../engine/url_model');

const MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, '../../model/url-model.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '../../model/url_parity.json'), 'utf8'));

test('url-model.json has the expected shape', () => {
  assert.equal(MODEL.version, 2);
  assert.equal(MODEL.features.length, 17);
  assert.ok(MODEL.trees.length >= 20);
});

test('JS evaluator matches Python probabilities on all parity URLs (tol 1e-4)', () => {
  assert.equal(cases.length, 200);
  for (const c of cases) {
    const p = predictUrlProb(Array.from(extractUrlFeatures(c.url)), MODEL);
    assert.ok(Math.abs(p - c.prob) < 1e-4, `${c.url}: js=${p} py=${c.prob}`);
  }
});
