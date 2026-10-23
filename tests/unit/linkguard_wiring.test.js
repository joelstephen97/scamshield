// tests/unit/linkguard_wiring.test.js — Task 15 wiring that has no browser-free behaviour to call:
// loader lists, surface-log kinds, the SW result shape and the two carried-over Task 13 fixes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SL = require('../../engine/surface_log.js');

test('both manifests load linkguard_rules.js and linkguard.js before content_script.js', () => {
  for (const f of ['manifest.json', 'manifest.firefox.json']) {
    const js = JSON.parse(read(f)).content_scripts[0].js;
    const i = (n) => js.indexOf(n);
    assert.ok(i('engine/linkguard_rules.js') > i('engine/constants.js') && i('engine/linkguard_rules.js') !== -1, f + ' rules');
    assert.ok(i('content/linkguard.js') > i('content/actions.js') && i('content/linkguard.js') < i('content/content_script.js'), f + ' linkguard.js');
  }
});

test('brand_match.js is loaded by every service-worker loader (checkFeedBatchHosts needs fuzzyBrandMatch)', () => {
  assert.ok(/engine\/brand_match\.js/.test(read('background/sw.js')));
  assert.ok(JSON.parse(read('manifest.firefox.json')).background.scripts.includes('engine/brand_match.js'));
  assert.ok(/'\.\.\/engine\/brand_match\.js'/.test(read('background/service_worker.js')));
});

test('surface log accepts the link kinds and popup-block', () => {
  for (const kind of ['link-block', 'link-warn', 'link-confirm', 'popup-block']) {
    assert.strictEqual(SL.appendRow([], { kind, host: 'example.com' }, 1).length, 1, kind);
  }
});

test('checkFeedBatchHosts documents and returns { level, popular, lookalike } per host', () => {
  const src = read('background/service_worker.js');
  assert.ok(/out\[raw\] = \{ level, popular, lookalike \}/.test(src));
  assert.ok(/fuzzyBrandMatch\(normalized, riskTlds\)/.test(src), 'riskTlds reach fuzzyBrandMatch');
});

test('relayToTop ignores the top frame; the top-frame listener shows the frame-form toast once', () => {
  const sw = read('background/service_worker.js');
  const relay = sw.slice(sw.indexOf("case 'relayToTop'"), sw.indexOf("case 'escalateBlocked'"));
  assert.ok(/sender\.frameId === 0/.test(relay));
  assert.ok(/frameFormToastShown/.test(read('content/content_script.js')));
});

test('every new locale key exists in all 20 locales with a non-English value', () => {
  const keys = ['linkPillBlock', 'linkPillWarn', 'linkConfirmBlock', 'linkConfirmWarn', 'linkGoBack', 'linkOpenAnyway', 'linkBlockedToast'];
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const loc of fs.readdirSync(path.join(root, '_locales'))) {
    const p = path.join('_locales', loc, 'messages.json');
    if (!fs.existsSync(path.join(root, p))) continue;
    const m = JSON.parse(read(p));
    for (const k of keys) {
      assert.ok(m[k], loc + ' missing ' + k);
      if (loc !== 'en') assert.notStrictEqual(m[k].message, en[k].message, loc + ' ' + k + ' equals English');
    }
  }
});
