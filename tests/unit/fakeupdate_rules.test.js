// tests/unit/fakeupdate_rules.test.js — 0.6.0 fake browser-update guard
const test = require('node:test');
const assert = require('node:assert');
const { scoreFakeUpdate } = require('../../engine/fakeupdate_rules');

test('browser-update wording + non-vendor download is dangerous', () => {
  const r = scoreFakeUpdate({
    text: 'Your Chrome browser is out of date. A critical update is required to continue.',
    updateAnchorHosts: ['cdn-updates.example'],
    hasBlobDownload: false
  });
  assert.equal(r.level, 'dangerous');
  assert.ok(r.flags.includes('fake-browser-update'));
  assert.equal(r.reasons[0].code, 'fakeUpdatePrompt');
});

test('blob/data download attribute counts as a bad download', () => {
  const r = scoreFakeUpdate({
    text: 'Firefox update available — install now.',
    updateAnchorHosts: [],
    hasBlobDownload: true
  });
  assert.equal(r.level, 'dangerous');
});

test('legit old-browser notice linking to the real vendor is NOT flagged', () => {
  const r = scoreFakeUpdate({
    text: 'Your browser is out of date. Please update your browser for the best experience.',
    updateAnchorHosts: ['google.com', 'mozilla.org'],
    hasBlobDownload: false
  });
  assert.equal(r.level, 'none');
});

test('update wording with no download at all stays quiet', () => {
  const r = scoreFakeUpdate({ text: 'We updated our privacy policy. Chrome users may notice new settings.', updateAnchorHosts: [], hasBlobDownload: false });
  assert.equal(r.level, 'none');
});

test('pages that never mention a browser are ignored', () => {
  const r = scoreFakeUpdate({ text: 'Download our latest catalogue update as PDF.', updateAnchorHosts: ['files.example'], hasBlobDownload: true });
  assert.equal(r.level, 'none');
});

// --- 0.15.0: own-site links are not "non-vendor"; need update wording + an off-site/blob download ---
test('news article about a Chrome update linking to its own site stays clean (0.15.0)', () => {
  const r = scoreFakeUpdate({
    text: 'Chrome update available: how to download the latest version. Your browser may be out of date.',
    updateAnchorHosts: ['news-site.example', 'news-site.example'],
    pageRegistrable: 'news-site.example',
    hasBlobDownload: false
  });
  assert.equal(r.level, 'none');
  assert.deepEqual(r.flags, []);
});
test('off-site non-vendor download on another registrable still fires (0.15.0)', () => {
  const r = scoreFakeUpdate({
    text: 'Your Chrome browser is out of date. A critical update is required.',
    updateAnchorHosts: ['news-site.example', 'cdn-updates.example'],
    pageRegistrable: 'news-site.example'
  });
  assert.equal(r.level, 'dangerous');
});
test('browser mention + download wording without update-required wording does not fire (0.15.0)', () => {
  const r = scoreFakeUpdate({ text: 'Download Chrome extensions for your workflow', updateAnchorHosts: ['files.example'], hasBlobDownload: true });
  assert.equal(r.level, 'none');
});
