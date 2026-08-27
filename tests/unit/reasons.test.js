// tests/unit/reasons.test.js — structured reason codes and their resolver.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../ui/reasons');

const ROOT = path.join(__dirname, '../..');
const MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales/en/messages.json'), 'utf8'));
const KINDS = ['link', 'brand', 'page', 'wallet', 'clipboard', 'techscam', 'shop', 'message'];
const engineFiles = fs.readdirSync(path.join(ROOT, 'engine'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: 'engine/' + f, src: fs.readFileSync(path.join(ROOT, 'engine', f), 'utf8') }));

// _locales messages use named placeholders ($BRAND$) declared with positional
// content ("$1"); the EN table uses the positional form directly.
function toPositional(entry) {
  let m = entry.message;
  for (const [name, def] of Object.entries(entry.placeholders || {})) {
    m = m.replace(new RegExp('\\$' + name + '\\$', 'gi'), def.content);
  }
  return m;
}

test('every EN reason has an en message, and every reason_* message has an EN entry', () => {
  for (const code of Object.keys(R.EN)) {
    assert.ok(MESSAGES['reason_' + code], 'missing _locales/en message: reason_' + code);
  }
  for (const key of Object.keys(MESSAGES)) {
    if (!key.startsWith('reason_')) continue;
    assert.ok(R.EN[key.slice('reason_'.length)] != null, 'orphan message with no EN entry: ' + key);
  }
});

test('en messages match the EN table once placeholders are made positional', () => {
  for (const [code, text] of Object.entries(R.EN)) {
    assert.equal(toPositional(MESSAGES['reason_' + code]), text, 'text drift for reason_' + code);
  }
});

test('every chip kind has an en label', () => {
  for (const kind of KINDS) {
    const key = 'chip' + kind.charAt(0).toUpperCase() + kind.slice(1);
    assert.ok(MESSAGES[key] && MESSAGES[key].message, 'missing chip label: ' + key);
  }
});

test('resolveReason falls back to EN when no extension API is present', () => {
  assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
  assert.equal(R.resolveReason({ code: 'shop_offPlatformPay' }), R.EN.shop_offPlatformPay);
});

test('resolveReason prefers chrome.i18n when it is available', () => {
  const calls = [];
  globalThis.chrome = { i18n: { getMessage: (key, subs) => { calls.push([key, subs]); return 'localizado: ' + subs[0]; } } };
  try {
    assert.equal(R.resolveReason({ code: 'idnHomograph', kind: 'brand', params: ['paypal.com'] }), 'localizado: paypal.com');
    assert.deepEqual(calls, [['reason_idnHomograph', ['paypal.com']]]);
    // An empty getMessage (missing key) still falls back to English.
    globalThis.chrome.i18n.getMessage = () => '';
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
    // A throwing API never breaks rendering.
    globalThis.chrome.i18n.getMessage = () => { throw new Error('no such context'); };
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
  } finally { delete globalThis.chrome; }
});

test('params are substituted positionally, repeats included', () => {
  assert.equal(R.resolveReason({ code: 'idnHomograph', kind: 'brand', params: ['paypal.com'] }),
    'This domain imitates "paypal.com" using look-alike foreign characters.');
  assert.equal(R.resolveReason({ code: 'brandIconMismatch', kind: 'brand', params: ['PayPal'] }),
    "This page uses PayPal's icon but is not PayPal's website.");
  // A missing param resolves to an empty string rather than a literal "$1".
  assert.equal(R.resolveReason({ code: 'scamPhrase', kind: 'page' }), 'Page shows classic scam/giveaway language ("").');
});

test('legacy string reasons pass through unchanged', () => {
  assert.equal(R.resolveReason('Uses a raw IP address instead of a domain name.'), 'Uses a raw IP address instead of a domain name.');
  assert.equal(R.reasonToEnglish('an old cached sentence'), 'an old cached sentence');
  assert.equal(R.reasonKind('an old cached sentence'), 'page');
});

test('reasonToEnglish ignores the UI locale', () => {
  globalThis.chrome = { i18n: { getMessage: () => 'localizado' } };
  try {
    assert.equal(R.reasonToEnglish({ code: 'msgDangerousLink', kind: 'message', params: ['http://bad.tk/x'] }),
      'Contains a dangerous-looking link (http://bad.tk/x).');
  } finally { delete globalThis.chrome; }
});

test('reasonKind defaults to page; unknown codes degrade to the code itself', () => {
  assert.equal(R.reasonKind({ code: 'ipHost', kind: 'link' }), 'link');
  assert.equal(R.reasonKind({ code: 'ipHost' }), 'page');
  assert.equal(R.reasonKind(null), 'page');
  assert.equal(R.resolveReason({ code: 'notARealCode' }), 'notARealCode');
  assert.equal(R.resolveReason(null), '');
});

test('isRTL reads the argument, and is false with no browser API', () => {
  assert.equal(R.isRTL('ar'), true);
  assert.equal(R.isRTL('ur-PK'), true);
  assert.equal(R.isRTL('en-US'), false);
  assert.equal(R.isRTL(''), false);
  assert.equal(R.isRTL(), false);
  globalThis.chrome = { i18n: { getUILanguage: () => 'he' } };
  try { assert.equal(R.isRTL(), true); } finally { delete globalThis.chrome; }
});

// --- regression guards: the engine stays text-free and chrome-free ---

test('no engine module pushes an English reason sentence', () => {
  for (const { name, src } of engineFiles) {
    assert.ok(!/reasons\.push\(['`]/.test(src), name + ' still pushes a literal reason string');
  }
});

test('no engine module touches chrome.i18n', () => {
  for (const { name, src } of engineFiles) {
    assert.ok(!/chrome\.i18n|browser\.i18n/.test(src), name + ' references an i18n API');
  }
});

// The reported reasonCodes field must stay single-vocabulary (engine codes), so
// any hand-built verdict the content script reports has to carry its own codes
// instead of falling through to report_payload's flag-name fallback. There is no
// DOM harness for content_script.js, so this is a source-level guard.
test('every content-script verdict with reasons also reports reasonCodes', () => {
  const src = fs.readFileSync(path.join(ROOT, 'content/content_script.js'), 'utf8');
  const calls = src.split('\n').filter((l) => l.includes("send('reportVerdict'"));
  assert.ok(calls.length >= 3, 'expected the content script to report verdicts');
  for (const line of calls) {
    if (!/reasons:/.test(line) || /reasons: \[\]/.test(line)) continue;
    assert.ok(/reasonCodes:/.test(line), 'reportVerdict without reasonCodes: ' + line.trim());
  }
});

test('every reason code emitted by the engine is in the EN table with a valid kind', () => {
  let found = 0;
  for (const { name, src } of engineFiles) {
    for (const m of src.matchAll(/\{ code: '([A-Za-z0-9_]+)', kind: '([a-z]+)'/g)) {
      found++;
      assert.ok(R.EN[m[1]], name + ': code ' + m[1] + ' has no EN entry');
      assert.ok(KINDS.includes(m[2]), name + ': code ' + m[1] + ' has unknown kind ' + m[2]);
    }
  }
  assert.ok(found >= 40, 'expected the engine to emit 40+ coded reasons, found ' + found);
});
