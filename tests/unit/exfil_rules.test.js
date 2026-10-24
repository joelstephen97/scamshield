// tests/unit/exfil_rules.test.js — credential exfil to a Telegram bot / Discord webhook (0.15.0).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const X = require('../../engine/exfil_rules');
const { scoreDom } = require('../../engine/heuristics');
const D = require('../../engine/doctrine');

const TOKEN = 'AAH7x9Qk2LmN4pRsT6uVwXyZ0aBcDeFgHiJ';
const TG = `https://api.telegram.org/bot123456789:${TOKEN}/sendMessage`;
const DC = 'https://discord.com/api/webhooks/1234567890123/abcDEF_ghiJKL-mnoPQR0123456789xyz';

// One table, run against BOTH copies of the classifier (engine file and the inline copy in the MAIN-world guard).
const TABLE = [
  [TG, 'telegram'],
  [TG + '?chat_id=1&text=hi', 'telegram'],
  [`https://API.TELEGRAM.ORG/bot123456789:${TOKEN}/sendPhoto`, 'telegram'],
  [DC, 'discord'],
  [DC + '?wait=true', 'discord'],
  ['https://discordapp.com/api/webhooks/1234567890123/abcDEF_ghiJKL-mnoPQR0123456789xyz', 'discord'],
  // look-alikes and wrong shapes
  [`https://api.telegram.org.evil.com/bot123456789:${TOKEN}/sendMessage`, null],
  [`https://evil.com/api.telegram.org/bot123456789:${TOKEN}/sendMessage`, null],
  [`https://evil.com/?u=https://api.telegram.org/bot123456789:${TOKEN}/sendMessage`, null],
  [`https://user:pw@api.telegram.org/bot123456789:${TOKEN}/sendMessage`, null],
  [`http://api.telegram.org/bot123456789:${TOKEN}/sendMessage`, null],
  [`https://xapi.telegram.org/bot123456789:${TOKEN}/sendMessage`, null],
  ['https://api.telegram.org/botfoo/sendMessage', null],
  ['https://api.telegram.org/bot123456789:short/sendMessage', null],
  ['https://api.telegram.org/', null],
  ['https://telegram.org/bot123456789:' + TOKEN + '/sendMessage', null],
  ['https://discord.com/api/webhooks/12/tiny', null],
  ['https://discord.com/channels/123456789/987654321', null],
  ['https://discord.com.evil.com/api/webhooks/1234567890123/abcDEF_ghiJKL-mnoPQR0123456789xyz', null],
  ['https://cdn.discordapp.com/api/webhooks/1234567890123/abcDEF_ghiJKL-mnoPQR0123456789xyz', null],
  ['/relative/path', null], ['', null], [null, null], [undefined, null], ['not a url', null]
];

test('exfilServiceOf: table (engine copy)', () => {
  for (const [url, want] of TABLE) assert.equal(X.exfilServiceOf(url), want, String(url));
});

// Load the real MAIN-world guard in a vm with stubs and probe its inline copy through the events it dispatches.
function mainWorldClassifier() {
  const seen = [], raw = [];
  const listeners = {};
  class CE { constructor(type, init) { this.type = type; this.detail = init && init.detail; this.cancelable = !!(init && init.cancelable); } }
  const win = {
    dispatchEvent(ev) { if (ev.type === 'scamshield:exfil') { raw.push(ev.detail); seen.push(JSON.parse(ev.detail)); } return true; },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    fetch() { return Promise.resolve('native'); },
    XMLHttpRequest: function () {}
  };
  win.XMLHttpRequest.prototype = { open() {}, send() {} };
  const sandbox = {
    window: win, document: { baseURI: 'https://page.example/' }, history: {}, navigator: { sendBeacon() { return true; } },
    HTMLFormElement: function () {}, HTMLAnchorElement: function () {}, Element: function () {}, Location: function () {},
    CustomEvent: CE, Event: CE, URL, URLSearchParams, FormData: class {}, Request: class {}, TypeError, Promise, WeakMap, JSON, setTimeout, console
  };
  sandbox.HTMLFormElement.prototype = { submit() {} }; sandbox.HTMLAnchorElement.prototype = { click() {} };
  sandbox.Element.prototype = {}; sandbox.Location.prototype = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../content/main_world_guard.js'), 'utf8'), sandbox);
  return {
    fetch(url, body) { win.fetch(url, { body }); },
    classify(url) { seen.length = 0; win.fetch(url, { body: 'x' }); return seen.length ? seen[0].service : null; },
    seen, raw
  };
}

test('exfilServiceOf: table (inline copy in content/main_world_guard.js agrees)', () => {
  const m = mainWorldClassifier();
  for (const [url, want] of TABLE) {
    if (url == null || typeof url !== 'string') continue; // fetch(String(null)) is a relative URL: covered by ''
    assert.equal(m.classify(url), want, 'main-world copy: ' + url);
  }
});

test('MAIN-world guard: the event detail is a JSON string with service, url and a body capped at 8 KB', () => {
  const m = mainWorldClassifier();
  m.fetch(TG, 'x'.repeat(20000));
  assert.deepEqual(Object.keys(m.seen[0]).sort(), ['body', 'service', 'url']);
  assert.equal(m.seen[0].body.length, 8192);
  assert.equal(m.raw[0] && typeof m.raw[0], 'string');
  m.fetch(TG, new URLSearchParams({ a: 'b', c: 'd e' }));
  assert.equal(m.seen[1].body, 'a=b&c=d+e');
  m.fetch(TG, { not: 'a string' });
  assert.equal(m.seen[2].body, '');
});

test('exfilEndpointInText: finds both endpoints, ignores near-misses', () => {
  assert.equal(X.exfilEndpointInText(`$.ajax({url:"https://api.telegram.org/bot123456789:${TOKEN}/sendMessage"})`), 'telegram');
  assert.equal(X.exfilEndpointInText(`fetch('${DC}')`), 'discord');
  assert.equal(X.exfilEndpointInText(`var u='https://discordapp.com/api/webhooks/1234567890123/abcDEF_ghiJKL-mnoPQR0123456789xyz'`), 'discord');
  assert.equal(X.exfilEndpointInText('see https://api.telegram.org/bot for docs'), null);
  assert.equal(X.exfilEndpointInText('api.telegram.org/bot123:short'), null);
  assert.equal(X.exfilEndpointInText('discord.com/api/webhooks/12/abc'), null);
  assert.equal(X.exfilEndpointInText('https://t.me/somechannel'), null);
  assert.equal(X.exfilEndpointInText(''), null);
  assert.equal(X.exfilEndpointInText(null), null);
});

test('exfilEndpointInText: caps the work at 300 KB', () => {
  const pad = ' '.repeat(300 * 1024);
  assert.equal(X.exfilEndpointInText(pad + TG), null, 'past the cap is not scanned');
  assert.equal(X.exfilEndpointInText(TG + pad), 'telegram');
});

test('bodyCarriesSecret: plain, percent-encoded, plus-for-space and JSON-escaped forms', () => {
  assert.equal(X.bodyCarriesSecret('chat_id=1&text=pw: hunter22', ['hunter22']), true);
  assert.equal(X.bodyCarriesSecret('text=p%40ss%20w0rd%21', ['p@ss w0rd!']), true);
  assert.equal(X.bodyCarriesSecret('text=p%40ss+w0rd%21', ['p@ss w0rd!']), true);
  assert.equal(X.bodyCarriesSecret('{"text":"a\\"b\\\\c1"}', ['a"b\\c1']), true);
  assert.equal(X.bodyCarriesSecret('chat_id=1&text=hello', ['hunter22']), false);
  assert.equal(X.bodyCarriesSecret('text=abc', ['abc']), false, 'secrets shorter than 4 never count');
  assert.equal(X.bodyCarriesSecret('text=abcd', ['abcd']), true);
  assert.equal(X.bodyCarriesSecret('', ['hunter22']), false);
  assert.equal(X.bodyCarriesSecret('text=hunter22', []), false);
  assert.equal(X.bodyCarriesSecret('text=hunter22', null), false);
  assert.equal(X.bodyCarriesSecret('text=hunter22', [null, 5, undefined]), false);
});

test('scoreDom: exfil script + visible password field flags credential-exfil at >= 0.85 with the service name', () => {
  const base = { pageHost: 'login.example.com', hasPasswordField: true, hasVisiblePasswordField: true, passwordFormActions: ['javascript:void(0);'], hiddenIframeCount: 0, scamPhrases: [] };
  const t = scoreDom({ ...base, exfilScript: 'telegram' });
  assert.ok(t.score >= 0.85);
  assert.ok(t.flags.includes('credential-exfil'));
  assert.deepEqual(t.reasons.find((r) => r.code === 'credentialExfilScript'), { code: 'credentialExfilScript', kind: 'page', params: ['Telegram'] });
  assert.deepEqual(scoreDom({ ...base, exfilScript: 'discord' }).reasons.find((r) => r.code === 'credentialExfilScript').params, ['Discord']);
  const card = scoreDom({ ...base, hasPasswordField: false, hasVisiblePasswordField: false, hasVisibleCardInput: true, exfilScript: 'telegram' });
  assert.ok(card.flags.includes('credential-exfil'));
});

test('scoreDom: no visible password / card field, no exfil script, or a hidden field: no reason and no flag', () => {
  const base = { pageHost: 'shop.example.com', hasPasswordField: false, passwordFormActions: [], hiddenIframeCount: 0, scamPhrases: [] };
  for (const s of [
    { ...base, exfilScript: 'telegram' }, // a contact form that messages a bot
    { ...base, exfilScript: 'telegram', hasPasswordField: true, hasVisiblePasswordField: false, passwordFormActions: ['/login'] }, // hidden login modal
    { ...base, hasVisiblePasswordField: true, hasPasswordField: true, passwordFormActions: ['/login'], exfilScript: null }
  ]) {
    const r = scoreDom(s);
    assert.ok(!r.flags.includes('credential-exfil'));
    assert.ok(!r.reasons.some((x) => x.code === 'credentialExfilScript'));
    assert.ok(r.score < 0.5);
  }
});

test('doctrine: credential-exfil warns (never stops), and is quiet on a popular host', () => {
  assert.ok(D.CONFIDENT_FLAGS.includes('credential-exfil'));
  assert.ok(D.CREDENTIAL_FLAGS.includes('credential-exfil'));
  assert.ok(!D.STOP_FLAGS.includes('credential-exfil'));
  const v = { level: 'dangerous', score: 0.85, flags: ['credential-exfil'], reasons: [] };
  assert.equal(D.surfaceTier(v, { popular: false, host: 'kit.example.xyz' }), 'warn');
  assert.equal(D.surfaceTier(v, { popular: true, host: 'github.com' }), 'quiet');
  assert.equal(D.surfaceTier({ ...v, level: 'suspicious' }, { popular: false, host: 'kit.example.xyz' }), 'warn');
});
