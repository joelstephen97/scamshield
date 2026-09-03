// tests/unit/firefox_consent.test.js — Firefox built-in data-collection consent (0.11.1)
//
// AMO requires every NEW extension to declare Firefox's built-in
// data-collection consent in the manifest (extensionworkshop.com/documentation/
// develop/firefox-builtin-data-consent/); web-ext lint flags its absence as
// MISSING_DATA_COLLECTION_PERMISSIONS and the first AMO upload would be
// refused. ScamShield collects nothing by default, so `required` is ["none"];
// the off-by-default community reporting is declared as an OPTIONAL
// 'websiteActivity' grant that options.js requests from Firefox 140+ the
// moment the switch is turned on.
//
// Chrome's manifest must NOT carry the key: ui/review.js's
// isChromeFromManifest() keys off browser_specific_settings being absent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

test('manifest.firefox.json declares built-in data-collection consent (none required, reporting optional)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.firefox.json'), 'utf8'));
  const dcp = m.browser_specific_settings.gecko.data_collection_permissions;
  assert.deepStrictEqual(dcp, { required: ['none'], optional: ['websiteActivity'] });
});

test('manifest.json (Chrome) carries no browser_specific_settings', () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.strictEqual(c.browser_specific_settings, undefined);
});

test('options.js gates the reporting switch behind requestReportingConsent()', () => {
  const src = fs.readFileSync(path.join(ROOT, 'options.js'), 'utf8');
  assert.ok(/async function requestReportingConsent\(/.test(src), 'requestReportingConsent() missing');
  assert.ok(/key === 'reportingOptIn'/.test(src), 'bindSwitch does not special-case reportingOptIn');
  assert.ok(/data_collection: \['websiteActivity'\]/.test(src), 'must request the websiteActivity grant declared in manifest.firefox.json');
});
