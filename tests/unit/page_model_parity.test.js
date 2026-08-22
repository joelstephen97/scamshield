const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const PM = require('../../engine/page_model');
const MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, '../../model/page-content.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '../../model/page_parity.json'), 'utf8'));

test('page-content.json shape', () => {
  assert.equal(MODEL.version, 1); assert.equal(MODEL.buckets, 32768);
  assert.equal(MODEL.denseNames.length, 16); assert.equal(MODEL.wDense.length, 16);
  assert.ok(MODEL.thresholds.suspicious > 0.5 && MODEL.thresholds.suspicious < 1);
});
test('JS evaluator matches Python on 200 held-out rows (tol 1e-3)', () => {
  assert.equal(cases.length, 200);
  for (const c of cases) {
    const p = PM.scorePageContent(c.features, MODEL).prob;
    assert.ok(Math.abs(p - c.prob) < 1e-3, `js=${p} py=${c.prob}`);
  }
});
