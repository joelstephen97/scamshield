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
    // Params passed to chrome.i18n.getMessage are bidi-isolated (RTL safety)
    // before substitution, so a right-to-left translation never gets its
    // punctuation order scrambled by an embedded LTR hostname/brand/URL.
    assert.equal(R.resolveReason({ code: 'idnHomograph', kind: 'brand', params: ['paypal.com'] }), 'localizado: ' + R.bidiWrap('paypal.com'));
    assert.deepEqual(calls, [['reason_idnHomograph', [R.bidiWrap('paypal.com')]]]);
    // An empty getMessage (missing key) still falls back to English.
    globalThis.chrome.i18n.getMessage = () => '';
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
    // A throwing API never breaks rendering.
    globalThis.chrome.i18n.getMessage = () => { throw new Error('no such context'); };
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
  } finally { delete globalThis.chrome; }
});

test('params are substituted positionally and bidi-isolated, repeats included', () => {
  assert.equal(R.resolveReason({ code: 'idnHomograph', kind: 'brand', params: ['paypal.com'] }),
    `This domain imitates "${R.bidiWrap('paypal.com')}" using look-alike foreign characters.`);
  assert.equal(R.resolveReason({ code: 'brandIconMismatch', kind: 'brand', params: ['PayPal'] }),
    `This page uses ${R.bidiWrap('PayPal')}'s icon but is not ${R.bidiWrap('PayPal')}'s website.`);
  // A missing param resolves to an empty string rather than a literal "$1".
  assert.equal(R.resolveReason({ code: 'scamPhrase', kind: 'page' }), 'Page shows classic scam/giveaway language ("").');
});

test('bidiWrap isolates a value with LRI/PDI marks and passes through nullish input', () => {
  assert.equal(R.bidiWrap('example.com'), '⁦example.com⁩');
  assert.equal(R.bidiWrap(''), '⁦⁩');
  assert.equal(R.bidiWrap(null), '');
  assert.equal(R.bidiWrap(undefined), '');
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

// --- per-user language override (0.7.0) ------------------------------------
// The override is module state shared by every caller in a world, so each test
// installs what it needs and clears it again in a finally.

const clearOverride = () => R.setOverride('', null);

test('messagesToDict rewrites named placeholders to positional ones', () => {
  const dict = R.messagesToDict({
    reason_idnHomograph: {
      message: 'This domain imitates "$BRAND$" using look-alike foreign characters.',
      placeholders: { brand: { content: '$1', example: 'paypal' } }
    }
  });
  assert.equal(dict.reason_idnHomograph, 'This domain imitates "$1" using look-alike foreign characters.');
});

test('messagesToDict handles multiple placeholders and repeats', () => {
  // Two placeholders, and — as the en file really has it — the second one
  // appearing before the first in the sentence.
  const dict = R.messagesToDict({
    guardLeakyFormHashed: {
      message: 'This site sent your email/phone to $HOST$ as a hashed ($ALGO$) identifier — before you pressed submit.',
      placeholders: { host: { content: '$1' }, algo: { content: '$2' } }
    },
    guardFormDestKnown: {
      message: 'This form sends your password to $DEST$, not to $HOST$.',
      placeholders: { dest: { content: '$1' }, host: { content: '$2' } }
    },
    reason_brandIconMismatch: {
      message: "This page uses $BRAND$'s icon but is not $BRAND$'s website.",
      placeholders: { brand: { content: '$1' } }
    }
  });
  assert.equal(dict.guardLeakyFormHashed, 'This site sent your email/phone to $1 as a hashed ($2) identifier — before you pressed submit.');
  assert.equal(dict.guardFormDestKnown, 'This form sends your password to $1, not to $2.');
  assert.equal(dict.reason_brandIconMismatch, "This page uses $1's icon but is not $1's website.");
});

test('messagesToDict passes plain messages through and survives junk input', () => {
  const dict = R.messagesToDict({
    saved: { message: 'Saved' },
    weird: { message: 'Costs $5 — a literal dollar sign' },
    noMessage: { placeholders: { a: { content: '$1' } } },
    notAnObject: 'nope',
    nullEntry: null,
    unmappable: { message: 'Hello $WHO$', placeholders: { who: { content: 'literal' } } }
  });
  assert.equal(dict.saved, 'Saved');
  assert.equal(dict.weird, 'Costs $5 — a literal dollar sign');
  assert.equal('noMessage' in dict, false);
  assert.equal('notAnObject' in dict, false);
  assert.equal('nullEntry' in dict, false);
  // A placeholder whose content isn't a positional argument can't be mapped, so
  // the token is left alone rather than being mangled.
  assert.equal(dict.unmappable, 'Hello $WHO$');
  assert.deepEqual(R.messagesToDict(null), {});
  assert.deepEqual(R.messagesToDict('not json'), {});
});

test('every shipped locale transforms with no named tokens left behind', () => {
  for (const loc of R.LOCALES) {
    const p = path.join(ROOT, '_locales', loc, 'messages.json');
    const dict = R.messagesToDict(JSON.parse(fs.readFileSync(p, 'utf8')));
    assert.ok(Object.keys(dict).length > 100, loc + ': suspiciously small dictionary');
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(!/\$[A-Za-z_][A-Za-z0-9_]*\$/.test(v), `${loc}: ${k} still has a named placeholder: ${v}`);
    }
  }
});

test('tOverride serves the dictionary and reports a miss as an empty string', () => {
  try {
    assert.equal(R.tOverride('saved'), ''); // no override installed
    R.setOverride('de', { saved: 'Gespeichert', fmtVersion: 'Version $1', two: '$2 then $1' });
    assert.equal(R.tOverride('saved'), 'Gespeichert');
    assert.equal(R.tOverride('fmtVersion', ['0.7.0']), 'Version 0.7.0');
    assert.equal(R.tOverride('fmtVersion', '0.7.0'), 'Version 0.7.0'); // getMessage also takes a bare string
    assert.equal(R.tOverride('two', ['a', 'b']), 'b then a');
    assert.equal(R.tOverride('notInDict'), '');
    assert.equal(R.tOverride(''), '');
  } finally { clearOverride(); }
});

test('setOverride ignores an incomplete pair and clears cleanly', () => {
  try {
    R.setOverride('de', null);
    assert.equal(R.overrideLanguage(), '');
    R.setOverride('', { saved: 'Gespeichert' });
    assert.equal(R.overrideLanguage(), '');
    R.setOverride('de', { saved: 'Gespeichert' });
    assert.equal(R.overrideLanguage(), 'de');
    R.setOverride('', null);
    assert.equal(R.overrideLanguage(), '');
    assert.equal(R.tOverride('saved'), '');
  } finally { clearOverride(); }
});

test('resolveReason prefers the override over chrome.i18n, which still beats the EN table', () => {
  globalThis.chrome = { i18n: { getMessage: () => 'from chrome.i18n' } };
  try {
    // No override → chrome.i18n wins.
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), 'from chrome.i18n');
    R.setOverride('de', { reason_ipHost: 'Nutzt eine rohe IP-Adresse.' });
    assert.equal(R.resolveReason({ code: 'ipHost', kind: 'link' }), 'Nutzt eine rohe IP-Adresse.');
    // A key the chosen locale hasn't translated falls through to chrome.i18n,
    // and from there to English — the same per-key fallback as a partial locale.
    assert.equal(R.resolveReason({ code: 'noHttps', kind: 'link' }), 'from chrome.i18n');
    delete globalThis.chrome;
    assert.equal(R.resolveReason({ code: 'noHttps', kind: 'link' }), R.EN.noHttps);
  } finally { clearOverride(); delete globalThis.chrome; }
});

test('override params are substituted positionally and bidi-isolated', () => {
  try {
    R.setOverride('de', { reason_brandIconMismatch: 'Diese Seite nutzt das Symbol von $1, ist aber nicht die Website von $1.' });
    assert.equal(R.resolveReason({ code: 'brandIconMismatch', kind: 'brand', params: ['PayPal'] }),
      `Diese Seite nutzt das Symbol von ${R.bidiWrap('PayPal')}, ist aber nicht die Website von ${R.bidiWrap('PayPal')}.`);
  } finally { clearOverride(); }
});

test('an override never touches reasonToEnglish or legacy string reasons', () => {
  try {
    R.setOverride('de', { reason_ipHost: 'Nutzt eine rohe IP-Adresse.' });
    // GitHub issue bodies stay English whatever the user picked.
    assert.equal(R.reasonToEnglish({ code: 'ipHost', kind: 'link' }), R.EN.ipHost);
    // Verdicts cached by an older version are plain sentences — still passed through.
    assert.equal(R.resolveReason('an old cached sentence'), 'an old cached sentence');
  } finally { clearOverride(); }
});

test('isRTL with no argument follows the override, not the browser', () => {
  globalThis.chrome = { i18n: { getUILanguage: () => 'en-US' } };
  try {
    assert.equal(R.isRTL(), false);
    R.setOverride('ar', {});           // an empty dict is still a chosen language
    assert.equal(R.isRTL(), true);
    R.setOverride('ur', { saved: 'محفوظ' });
    assert.equal(R.isRTL(), true);
    R.setOverride('de', { saved: 'Gespeichert' });
    assert.equal(R.isRTL(), false);
    // An explicit argument always wins, override or not.
    assert.equal(R.isRTL('he'), true);
    clearOverride();
    assert.equal(R.isRTL(), false);
  } finally { clearOverride(); delete globalThis.chrome; }
});

test('the locale list and the autonym table cover exactly the shipped locales', () => {
  const dirs = fs.readdirSync(path.join(ROOT, '_locales'))
    .filter((d) => fs.existsSync(path.join(ROOT, '_locales', d, 'messages.json')));
  assert.deepEqual([...R.LOCALES].sort(), dirs.sort());
  assert.deepEqual(Object.keys(R.LANG_NAMES).sort(), [...R.LOCALES].sort());
  // Autonyms are language names, never message keys — each must be non-empty
  // and distinct, or the picker would show two identical rows.
  const names = Object.values(R.LANG_NAMES);
  for (const n of names) assert.ok(n && n.trim().length, 'empty autonym');
  assert.equal(new Set(names).size, names.length, 'duplicate autonym');
});

test('the options picker offers Browser default plus every shipped locale', () => {
  const src = fs.readFileSync(path.join(ROOT, 'options.js'), 'utf8');
  assert.ok(/optLangAuto/.test(src), 'options.js does not offer a "Browser default" option');
  assert.ok(/R\.LOCALES/.test(src), 'options.js does not build its list from SSReasons.LOCALES');
  assert.ok(/location\.reload\(\)/.test(src), 'options.js does not reload after a language change');
  const html = fs.readFileSync(path.join(ROOT, 'options.html'), 'utf8');
  assert.ok(/id="lang"/.test(html), 'options.html has no language select');
  assert.ok(/data-i18n="optLangHint"/.test(html), 'options.html has no language hint');
});

// The dictionary must be consulted before chrome.i18n everywhere a string is
// resolved, or a page/frame would show a mix of two languages. ui/i18n.js and
// the two content scripts each own a t() that can't be require()d in Node
// (they need document / the extension APIs), so this is a source-level guard —
// same approach as the content-script reportVerdict guard above.
test('every t() surface consults the override before chrome.i18n', () => {
  for (const f of ['ui/i18n.js', 'content/actions.js', 'content/content_script.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Matched on the call itself (`api.i18n.getMessage`) so a prose mention of
    // "chrome.i18n.getMessage" in a comment can't move the goalposts.
    const over = src.search(/R\.tOverride\(/);
    const chrome = src.search(/api\.i18n\.getMessage\(/);
    assert.ok(over >= 0, f + ' does not consult the language override');
    assert.ok(chrome >= 0, f + ' no longer calls getMessage');
    assert.ok(over < chrome, f + ' calls getMessage before consulting the override');
  }
});

test('the content scripts get the dictionary from the worker, not from a fetch', () => {
  const actions = fs.readFileSync(path.join(ROOT, 'content/actions.js'), 'utf8');
  assert.ok(/getLangDict/.test(actions), 'content/actions.js never asks for the dictionary');
  for (const f of ['content/actions.js', 'content/content_script.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/messages\.json/.test(src), f + ' reads a locale file directly — that needs a web_accessible_resource');
  }
  // Zero new permissions and no newly web-accessible files is the binding
  // constraint of this feature, so both manifests are asserted, not assumed.
  for (const m of ['manifest.json', 'manifest.firefox.json']) {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, m), 'utf8'));
    assert.equal(mf.web_accessible_resources, undefined, m + ' now exposes web-accessible resources');
    assert.deepEqual(mf.permissions, ['storage', 'declarativeNetRequest', 'alarms'], m + ' permissions changed');
  }
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
