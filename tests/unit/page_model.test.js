const test = require('node:test');
const assert = require('node:assert');
const PM = require('../../engine/page_model');

function b64Int8(arr) { return Buffer.from(Int8Array.from(arr).buffer).toString('base64'); }
const w = new Array(32768).fill(0); w[7] = 100; w[9] = -50; // bucket 7 pushes phish, 9 pushes legit
const MODEL = { version: 1, buckets: 32768, denseNames: ['d0', 'd1'], w: b64Int8(w), wScale: 0.02,
  wDense: [1.5, -1.0], bias: -1.0, thresholds: { suspicious: 0.9 } };
const sig = (z) => 1 / (1 + Math.exp(-z));

test('linear model over log1p token counts + dense, sigmoid output', () => {
  // bucket7 count 2 → log1p(2)*100*0.02 = 2.197 ; dense [1,0] → +1.5 ; bias -1
  const r = PM.scorePageContent({ tokens: { 7: 2 }, dense: [1, 0] }, MODEL);
  assert.ok(Math.abs(r.prob - sig(Math.log1p(2) * 2 + 1.5 - 1)) < 1e-9);
  assert.deepEqual(r.top, ['d0']);
});

test('negative weights reduce the probability', () => {
  const a = PM.scorePageContent({ tokens: {}, dense: [0, 0] }, MODEL).prob;
  const b = PM.scorePageContent({ tokens: { 9: 5 }, dense: [0, 0] }, MODEL).prob;
  assert.ok(b < a);
});

test('unavailable model → prob NaN, top empty; setPageModel enables it', () => {
  PM._resetForTest();
  assert.equal(PM.isPageModelAvailable(), false);
  assert.ok(Number.isNaN(PM.scorePageContent({ tokens: {}, dense: [] }).prob));
  PM.setPageModel(MODEL);
  assert.equal(PM.isPageModelAvailable(), true);
  assert.ok(!Number.isNaN(PM.scorePageContent({ tokens: {}, dense: [0, 0] }).prob));
});

test('decoded weight length equals 32768 (full model test via edge case)', () => {
  // Ensure decoding doesn't truncate: a model with only bucket 32767 set should affect prob
  const w2 = new Array(32768).fill(0); w2[32767] = 100; // set ONLY the last bucket
  const MODEL2 = { version: 1, buckets: 32768, denseNames: ['d0'], w: b64Int8(w2), wScale: 0.02,
    wDense: [0], bias: -1.0, thresholds: { suspicious: 0.9 } };
  const r1 = PM.scorePageContent({ tokens: {}, dense: [] }, MODEL2).prob;
  const r2 = PM.scorePageContent({ tokens: { 32767: 1 }, dense: [] }, MODEL2).prob;
  assert.ok(r2 !== r1, 'last weight bucket should affect prob when present');
});

test('lazy bundle pickup: ScamShield.PAGE_MODEL available on first call', () => {
  PM._resetForTest();
  globalThis.ScamShield = Object.assign(globalThis.ScamShield || {}, { PAGE_MODEL: MODEL });
  const r = PM.scorePageContent({ tokens: {}, dense: [0, 0] });
  assert.ok(!Number.isNaN(r.prob), 'should pick up lazily-set PAGE_MODEL on first call');
  delete globalThis.ScamShield.PAGE_MODEL;
  PM._resetForTest();
});

test('inline model without w property degrades gracefully to NaN', () => {
  const modelNoW = { version: 1 };
  const r = PM.scorePageContent({ tokens: {}, dense: [] }, modelNoW);
  assert.ok(Number.isNaN(r.prob), 'model without w should return NaN, not throw');
});
