// tests/unit/surfaces.test.js — shadow-host primitive (0.15.0, Task 11). Pure parts only; the DOM
// behaviour (shadow root, re-attach, theme, touch sizes) is covered by tests/e2e/surfaces-host.spec.js.
const test = require('node:test');
const assert = require('node:assert');
require('../../content/surfaces/styles.js');
require('../../content/surfaces/primitives.js');
const S = globalThis.ScamShield.surfaces;
const CSS = globalThis.ScamShield.surfaceCss;

const r = (left, top, right, bottom) => ({ left, top, right, bottom });

test('insideCard: geometry table with 1px tolerance', () => {
  const card = r(100, 100, 400, 200);
  const rows = [
    [r(110, 110, 150, 140), true, 'well inside'],
    [r(100, 100, 400, 200), true, 'exactly the card'],
    [r(99, 99, 401, 201), true, 'on the 1px tolerance edge'],
    [r(98, 110, 150, 140), false, 'starts 2px left of the card'],
    [r(110, 110, 150, 202), false, 'ends 2px below the card'],
    [r(110, 50, 150, 80), false, 'wholly above (page-positioned decoy)'],
    [r(0, 0, 1000, 1000), false, 'a button covering the viewport'],
    [r(0, 0, 0, 0), false, 'zero rect outside the card']
  ];
  for (const [btn, want, why] of rows) {
    assert.equal(S.insideCard({ getBoundingClientRect: () => btn }, { getBoundingClientRect: () => card }), want, why);
  }
  assert.equal(S.insideCard(null, { getBoundingClientRect: () => card }), false);
  assert.equal(S.insideCard({ getBoundingClientRect: () => card }, null), false);
});

test('surface API shape', () => {
  assert.deepEqual(Object.keys(S).sort(), ['insideCard', 'isMounted', 'mount', 'onTrustedClick', 'unmount']);
  assert.equal(S.isMounted('toast'), false);
});

test('surfaceCss: base, banner, dialog, toast strings; theme tokens; logical properties only', () => {
  for (const k of ['base', 'banner', 'dialog', 'toast']) assert.equal(typeof CSS[k], 'string', k);
  assert.match(CSS.base, /:host\{/);
  assert.match(CSS.base, /:host\(\[data-theme=dark\]\)/);
  assert.match(CSS.base, /@media \(prefers-color-scheme:\s*dark\)\s*\{\s*:host\(\[data-theme=auto\]\)/);
  assert.match(CSS.toast, /prefers-reduced-motion:\s*reduce/);
  assert.match(CSS.base, /pointer:\s*coarse/);
  for (const k of ['base', 'toast']) {
    assert.doesNotMatch(CSS[k], /(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/, k + ' uses a physical property');
    assert.doesNotMatch(CSS[k], /text-align:\s*(left|right)/, k);
  }
});
