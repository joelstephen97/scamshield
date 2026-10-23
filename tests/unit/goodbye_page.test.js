// tests/unit/goodbye_page.test.js — the static uninstall page (0.15.0, Task 19).
// goodbye.html lives on GitHub Pages and runs after the extension is gone: its dictionary is generated from _locales
// (scripts/gen-goodbye-i18n.js) and the page must stay static (no network, no relay post).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const gen = require(path.join(root, 'scripts', 'gen-goodbye-i18n.js'));
const html = fs.readFileSync(path.join(root, 'goodbye.html'), 'utf8').replace(/\r\n/g, '\n');
const EXPECTED = ['en', 'zh-CN', 'hi', 'es', 'ar', 'fr', 'bn', 'pt-BR', 'ru', 'ur', 'id', 'de', 'ja', 'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'it'];

test('goodbye.html inline dictionary is in sync with _locales (run scripts/gen-goodbye-i18n.js)', () => {
  assert.strictEqual(gen.inject(html), html);
});

test('the dictionary covers all 20 locales and every key the page uses', () => {
  const d = gen.dictionary();
  assert.deepStrictEqual(Object.keys(d).sort(), [...EXPECTED].sort());
  for (const tag of EXPECTED) for (const k of gen.KEYS) assert.ok(d[tag][k] && d[tag][k].length, tag + ': ' + k);
  for (const tag of EXPECTED) assert.ok(d[tag].gbUninstalledV.includes('{version}'), tag + ' keeps the {version} placeholder');
  // Every data-i18n key in the page is in the dictionary.
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(gen.KEYS.includes(m[1]), 'page uses an ungenerated key: ' + m[1]);
});

test('goodbye.html stays static: no fetch / XHR / beacon / socket / form, and no extension API', () => {
  const script = html.slice(html.indexOf('<script>'));
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image\b/);
  assert.doesNotMatch(script, /\bchrome\.|\bbrowser\./);
  assert.doesNotMatch(html, /<form\b|<img\b[^>]*src=["']https?:|<script[^>]*\ssrc=/i);
  assert.doesNotMatch(html, /\.relay|workers\.dev/);
});

test('goodbye.html: reason picker, clipboard note, English fallback, RTL, version from ?v=', () => {
  assert.strictEqual((html.match(/data-r="/g) || []).length, 5);
  assert.match(html, /ScamShield uninstall reason: ' \+ b\.getAttribute\('data-r'\) \+ ', version '/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /RTL = \{ ar: 1, ur: 1/);
  assert.match(html, /qs\.get\('v'\)/);
  assert.match(html, /<html lang="en" dir="ltr">/);
});

test('the service worker still opens goodbye.html with ?v=<version>', () => {
  const sw = fs.readFileSync(path.join(root, 'background', 'service_worker.js'), 'utf8');
  assert.match(sw, /setUninstallURL\('https:\/\/joelstephen97\.github\.io\/scamshield\/goodbye\.html\?v=' \+ manifestVersion\(\)\)/);
});

test('goodbye.html is not packaged into the extension zips (Pages-only), demo.html is', () => {
  const { SHARED } = require(path.join(root, 'scripts', 'build.js'));
  assert.ok(!SHARED.includes('goodbye.html'));
  assert.ok(SHARED.includes('demo.html') && SHARED.includes('onboarding.html') && SHARED.includes('blocked.html'));
});

test('the service worker sends escalated pages to blocked.html?r=escalated#<url> (Task 19)', () => {
  const sw = fs.readFileSync(path.join(root, 'background', 'service_worker.js'), 'utf8');
  assert.match(sw, /getURL\('blocked\.html'\) \+ '\?r=escalated#' \+ url/);
  const js = fs.readFileSync(path.join(root, 'ui', 'blocked.js'), 'utf8');
  assert.match(js, /if \(!target \|\| escalated\) return;/); // the escalated form never reports a dnrBlocked catch
});

test('manifest.firefox.json declares Firefox for Android at 142 with no new permissions', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.firefox.json'), 'utf8'));
  assert.deepStrictEqual(m.browser_specific_settings.gecko_android, { strict_min_version: '142.0' });
  assert.deepStrictEqual(m.permissions, ['storage', 'declarativeNetRequest', 'alarms']);
  const c = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(!c.browser_specific_settings || !c.browser_specific_settings.gecko_android);
  assert.ok(!c.web_accessible_resources && !m.web_accessible_resources);
});
