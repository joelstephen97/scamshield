// tests/unit/parity.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractUrlFeatures } = require('../../engine/features');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '../../model/parity.json'), 'utf8'));

for (const c of cases) {
  test(`JS features stable for ${c.url}`, () => {
    assert.deepEqual(Array.from(extractUrlFeatures(c.url)), c.vector);
  });
}
