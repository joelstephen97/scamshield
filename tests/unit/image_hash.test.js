const test = require('node:test');
const assert = require('node:assert');
const IH = require('../../engine/image_hash');

// 9x8 horizontal gradient (left dark → right bright): every "right > left" bit = 1
const grad = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) grad.push(x * 20);
const flat = new Array(72).fill(100);

test('dHash of a left→right gradient is all ones; flat image is all zeros', () => {
  assert.equal(IH.dHashFromGray(grad), 'ffffffffffffffff');
  assert.equal(IH.dHashFromGray(flat), '0000000000000000');
});
test('hamming distance counts differing bits', () => {
  assert.equal(IH.hamming('ffffffffffffffff', '0000000000000000'), 64);
  assert.equal(IH.hamming('00000000000000ff', '00000000000000f0'), 4);
  assert.equal(IH.hamming('abcdef0123456789', 'abcdef0123456789'), 0);
});
test('matchBrand returns the closest brand within maxDist, else null', () => {
  const table = [{ key: 'paypal', hashes: ['ffffffffffffffff'] }, { key: 'apple', hashes: ['0000000000000000'] }];
  assert.deepEqual(IH.matchBrand('fffffffffffffff0', table, 6), { brand: 'paypal', distance: 4 });
  assert.equal(IH.matchBrand('ffffffff00000000', table, 6), null);
});
test('grayFromRGBA uses luma weights', () => {
  const g = IH.grayFromRGBA(Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
  assert.ok(Math.abs(g[0] - 76.245) < 0.01 && Math.abs(g[1] - 149.685) < 0.01);
});
test('hashImageBlob returns null outside a browser', async () => {
  assert.equal(await IH.hashImageBlob({}), null);
});
