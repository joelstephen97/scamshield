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
