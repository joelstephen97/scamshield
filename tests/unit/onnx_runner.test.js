// tests/unit/onnx_runner.test.js
const test = require('node:test');
const assert = require('node:assert');
const runner = require('../../engine/onnx_runner');

test('predict returns null when ort runtime is absent', async () => {
  const out = await runner.predict(Float32Array.from([0, 0, 0]));
  assert.equal(out, null);
});

test('isAvailable reflects runtime presence', () => {
  assert.equal(runner.isAvailable(), false);
});
