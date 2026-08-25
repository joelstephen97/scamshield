const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SHARED, manifestReferencedFiles } = require('../../scripts/build.js');

const ROOT = path.join(__dirname, '../..');

function isCoveredBySHARED(relPath) {
  return SHARED.some((item) => relPath === item || relPath.startsWith(item + '/'));
}

for (const manifestFile of ['manifest.json', 'manifest.firefox.json']) {
  test(`${manifestFile}: every referenced file exists and is covered by SHARED`, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestFile), 'utf8'));
    const files = manifestReferencedFiles(manifest);
    assert.ok(files.length > 0, 'manifest should reference at least one file');
    for (const f of files) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `${manifestFile}: ${f} does not exist in repo`);
      assert.ok(isCoveredBySHARED(f), `${manifestFile}: ${f} is not covered by scripts/build.js SHARED`);
    }
  });
}

function htmlAssetRefs(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const refs = [];
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/<link[^>]*\shref="([^"]+)"/g)) refs.push(m[1]);
  return refs.filter((r) => !/^https?:\/\//.test(r));
}

for (const htmlFile of ['popup.html', 'options.html', 'onboarding.html']) {
  test(`${htmlFile}: script/link targets exist and are covered by SHARED`, () => {
    const refs = htmlAssetRefs(path.join(ROOT, htmlFile));
    for (const r of refs) {
      assert.ok(fs.existsSync(path.join(ROOT, r)), `${htmlFile}: ${r} does not exist in repo`);
      assert.ok(isCoveredBySHARED(r), `${htmlFile}: ${r} is not covered by scripts/build.js SHARED`);
    }
  });
}

// Upgrade-safety guard: adding a permission disables the extension for every
// existing store user until they re-approve it. Both manifests must keep the
// exact permission set that 0.3.1 shipped with (see README "Upgrade safety").
// 0.6.0 platform base: isolated content scripts must reach sub-frames
// (iframe-hosted phishing forms were invisible to 0.5.0), while the MAIN-world
// hooks stay top-frame only to keep ad-iframe cost at zero. Chrome runs the
// ES-module service worker and declares its version floor.
test('manifest.json: platform base (all_frames, module SW, minimum_chrome_version)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.minimum_chrome_version, '121');
  assert.strictEqual(m.background.type, 'module');
  assert.strictEqual(m.background.service_worker, 'background/sw.js');
  const iso = m.content_scripts.find((c) => c.world !== 'MAIN');
  assert.strictEqual(iso.all_frames, true);
  assert.strictEqual(iso.match_origin_as_fallback, true);
  const main = m.content_scripts.find((c) => c.world === 'MAIN');
  assert.notStrictEqual(main.all_frames, true, 'MAIN world stays top-frame only');
});
test('manifest.firefox.json: platform base (all_frames on isolated scripts)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8'));
  const iso = m.content_scripts.find((c) => c.world !== 'MAIN');
  assert.strictEqual(iso.all_frames, true);
  assert.strictEqual(iso.match_about_blank, true);
  const main = m.content_scripts.find((c) => c.world === 'MAIN');
  assert.notStrictEqual(main.all_frames, true, 'MAIN world stays top-frame only');
});

const FROZEN_PERMISSIONS = ['storage', 'declarativeNetRequest', 'alarms'];
const FROZEN_HOSTS = ['http://*/*', 'https://*/*'];
for (const manifestFile of ['manifest.json', 'manifest.firefox.json']) {
  test(`${manifestFile}: permission set is frozen (no new permissions since 0.3.1)`, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestFile), 'utf8'));
    assert.deepStrictEqual([...manifest.permissions].sort(), [...FROZEN_PERMISSIONS].sort());
    assert.deepStrictEqual([...manifest.host_permissions].sort(), [...FROZEN_HOSTS].sort());
    assert.strictEqual(manifest.optional_permissions, undefined, 'no optional permissions');
    assert.strictEqual(manifest.optional_host_permissions, undefined, 'no optional host permissions');
    assert.strictEqual(manifest.web_accessible_resources, undefined, 'no web_accessible_resources (removed in 0.5.0)');
  });
}
