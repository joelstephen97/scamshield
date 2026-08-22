'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { resolveCollisions } = require('../../tools/lib/brand_hash_guard');

// google's known domains are a superset of gmail's -> gmail is the sub-brand.
const DOMAINS = {
  google: ['google.com', 'gmail.com', 'youtube.com', 'googleapis.com', 'gstatic.com'],
  gmail: ['gmail.com', 'google.com'],
  brandA: ['a.example'],
  brandB: ['b.example'],
  far1: ['far1.example'],
  far2: ['far2.example']
};

const H = '0e0f1f1f1f3f1c1c';       // shared hash for google/gmail case
const ONE_BIT_A = '0000000000000000';
const ONE_BIT_B = '0000000000000001'; // differs from ONE_BIT_A by exactly 1 bit
const FAR_1 = '0000000000000000';
const FAR_2 = 'ffffffffffffffff';    // maximally far (64 bits) — must survive

test('sub-brand: google keeps the shared hash, gmail loses it', () => {
  const { brands, dropped } = resolveCollisions(
    [{ key: 'google', hashes: [H] }, { key: 'gmail', hashes: [H] }],
    DOMAINS
  );
  const byKey = Object.fromEntries(brands.map((b) => [b.key, b.hashes]));
  assert.deepEqual(byKey.google, [H]);
  assert.equal(byKey.gmail, undefined); // gmail has 0 hashes left -> dropped entirely
  assert.ok(dropped.some((d) => d.brand === 'gmail' && d.hash === H && d.reason === 'sub-brand' && d.other === 'google'));
});

test('ambiguous: two unrelated brands with hashes 1 bit apart both lose the hash', () => {
  const { brands, dropped } = resolveCollisions(
    [{ key: 'brandA', hashes: [ONE_BIT_A] }, { key: 'brandB', hashes: [ONE_BIT_B] }],
    DOMAINS
  );
  assert.equal(brands.find((b) => b.key === 'brandA'), undefined);
  assert.equal(brands.find((b) => b.key === 'brandB'), undefined);
  assert.ok(dropped.some((d) => d.brand === 'brandA' && d.reason === 'ambiguous' && d.other === 'brandB'));
  assert.ok(dropped.some((d) => d.brand === 'brandB' && d.reason === 'ambiguous' && d.other === 'brandA'));
});

test('order independence: result is identical regardless of input order', () => {
  const input = [
    { key: 'google', hashes: [H] },
    { key: 'gmail', hashes: [H] },
    { key: 'brandA', hashes: [ONE_BIT_A] },
    { key: 'brandB', hashes: [ONE_BIT_B] },
    { key: 'far1', hashes: [FAR_1] },
    { key: 'far2', hashes: [FAR_2] }
  ];
  const sortByKey = (arr) => [...arr].sort((a, b) => a.key.localeCompare(b.key)).map((b) => ({ key: b.key, hashes: [...b.hashes].sort() }));
  const forward = resolveCollisions(input, DOMAINS);
  const backward = resolveCollisions([...input].reverse(), DOMAINS);
  assert.deepEqual(sortByKey(forward.brands), sortByKey(backward.brands));
});

test('non-colliding hashes (>= 12 bits apart) are untouched', () => {
  const { brands, dropped } = resolveCollisions(
    [{ key: 'far1', hashes: [FAR_1] }, { key: 'far2', hashes: [FAR_2] }],
    DOMAINS
  );
  const byKey = Object.fromEntries(brands.map((b) => [b.key, b.hashes]));
  assert.deepEqual(byKey.far1, [FAR_1]);
  assert.deepEqual(byKey.far2, [FAR_2]);
  assert.equal(dropped.length, 0);
});
