// tests/unit/adguard_wiring.test.js — Task 17a wiring with no browser-free behaviour to call:
// loader lists (both manifests), locale keys in all 20 locales, the CSS hooks, the SW-free settings gate.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('both manifests load ad_rules.js after linkguard_rules.js and adguard.js after linkguard.js, all in the all-frames entry', () => {
  for (const f of ['manifest.json', 'manifest.firefox.json']) {
    const entry = JSON.parse(read(f)).content_scripts[0];
    assert.strictEqual(entry.all_frames, true, f);
    const js = entry.js, i = (n) => js.indexOf(n);
    assert.ok(i('engine/ad_rules.js') > i('engine/linkguard_rules.js') && i('engine/linkguard_rules.js') !== -1, f + ' ad_rules');
    assert.ok(i('content/adguard.js') > i('content/linkguard.js') && i('content/adguard.js') < i('content/content_script.js'), f + ' adguard.js');
  }
});

test('the ad guard is gated on its own tolerant setting and the sub-frame hook is wired', () => {
  const src = read('content/content_script.js');
  assert.ok(/settings\.adGuard !== false/.test(src));
  assert.ok(/SS\.adGuard\.startFrame\(/.test(src));
  assert.ok(/passive: true/.test(src), 'passive lookup when the link guard is off');
});

test('adHiddenTag and adHiddenShow exist in all 20 locales, translated', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  let n = 0;
  for (const loc of fs.readdirSync(path.join(root, '_locales'))) {
    const p = path.join('_locales', loc, 'messages.json');
    if (!fs.existsSync(path.join(root, p))) continue;
    n++;
    const m = JSON.parse(read(p));
    for (const k of ['adHiddenTag', 'adHiddenShow']) {
      assert.ok(m[k] && m[k].message, loc + ' ' + k);
      if (loc !== 'en') assert.notStrictEqual(m[k].message, en[k].message, loc + ' ' + k + ' is not English');
    }
  }
  assert.strictEqual(n, 20);
});

test('content.css carries the ad tag classes with logical properties only', () => {
  const css = read('content/content.css');
  const block = css.slice(css.indexOf('Scam-ad tag'));
  for (const c of ['.scamshield-ad-hidden', '.scamshield-ad-collapsed', '.scamshield-ad-tile']) assert.ok(block.includes(c), c);
  assert.ok(!/(^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/.test(block), 'no physical properties');
});

test('adguard.js never calls getComputedStyle (batch stays cheap)', () => {
  assert.ok(!/getComputedStyle\(/.test(read('content/adguard.js').replace(/\/\/.*$/gm, '')));
});
