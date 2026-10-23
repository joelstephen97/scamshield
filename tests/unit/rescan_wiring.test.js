// tests/unit/rescan_wiring.test.js — Task 17b wiring that needs no browser: the heavy modules stay out of
// sub-frames, and the mid-scroll rescan keeps its limits and its escalate-only guard.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const HEAVY = ['model/url-model.js', 'model/page-content.js', 'engine/qr.js'];

test('both manifests load jsQR and the two models in a TOP-FRAME-ONLY entry, never in the all-frames entry', () => {
  for (const f of ['manifest.json', 'manifest.firefox.json']) {
    const scripts = JSON.parse(read(f)).content_scripts.filter((c) => c.world !== 'MAIN');
    const allFrames = scripts.filter((c) => c.all_frames === true);
    const topOnly = scripts.filter((c) => c.all_frames !== true);
    assert.strictEqual(allFrames.length, 1, f);
    for (const h of HEAVY) {
      assert.ok(!allFrames[0].js.includes(h), f + ' ' + h + ' must not load in sub-frames');
      assert.ok(topOnly.some((c) => c.js.includes(h)), f + ' ' + h + ' still loads in the top frame');
    }
    assert.ok(allFrames[0].js.includes('content/content_script.js'), f);
  }
});

test('the rescan keeps its limits (500 ms debounce, 1 per 3 s, 5 per page) and may only escalate', () => {
  const src = read('content/content_script.js');
  assert.ok(/RESCAN_MAX = 5, RESCAN_GAP = 3000, RESCAN_DEBOUNCE = 500/.test(src));
  assert.ok(/if \(rescan && tierRank\(tier\) <= tierRank\(pageTier\)\) return;/.test(src), 'no downgrade, no repeat');
  assert.ok(/if \(rescan && pageDismissed && tier !== 'stop'\)/.test(src), 'a dismissed warning stays dismissed, but a jump to stop still shows');
  assert.ok(/if \(rescan\) return;[^\n]*never report 'safe'/.test(src), 'a paused/trusted site returns silently on a rescan (no safe report over the badge)');
  assert.ok(/RESCAN_IFRAME_MAX = 2/.test(src), 'iframe-only triggers have their own cap');
  assert.ok(/rescanMo\.disconnect\(\)/.test(src), 'the observer is disconnected once the budget is spent');
  assert.ok(!/querySelectorAll\('\*'\)/.test(src.slice(src.indexOf('function deepQueryAll'), src.indexOf('function deepQueryAll') + 900)), 'deepQueryAll does not build a NodeList of every element');
  assert.ok(/rescanCount = 0;/.test(src), 'an SPA navigation resets the counter');
  assert.ok(/localName === 'scamshield-surface'/.test(src), 'our own surface hosts are skipped');
});
