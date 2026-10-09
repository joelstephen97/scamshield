'use strict';
// MAIN-world wallet hook (0.14.1, P0-4): the 8 s fail-open timer must stop once
// the isolated-world overlay acks, and still fire when nothing acks.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../content/detectors/wallet.js'), 'utf8');

function load() {
  const listeners = {};
  const timers = [];
  let now = 0;
  const win = {
    ethereum: { request: async (a) => 'forwarded:' + a.method },
    ScamShield: { analyzeWalletRequest: () => ({ level: 'dangerous', reasons: [] }) },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent: (ev) => { (listeners[ev.type] || []).slice().forEach((f) => f(ev)); return true; }
  };
  const ctx = {
    window: win,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: (fn, ms) => { const t = { fn, at: now + ms, live: true }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.live = false; },
    setInterval: () => 0, clearInterval: () => {}
  };
  vm.runInNewContext(SRC, ctx);
  const advance = (ms) => { now += ms; timers.filter((t) => t.live && t.at <= now).forEach((t) => { t.live = false; t.fn(); }); };
  const emit = (type, detail) => win.dispatchEvent({ type, detail });
  return { win, advance, emit };
}
const settle = () => new Promise((r) => setImmediate(r));

test('no ack: request fails open (allowed) after 8 s', async () => {
  const { win, advance } = load();
  let out; win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; });
  await settle(); advance(7999); await settle(); assert.strictEqual(out, undefined);
  advance(1); await settle(); assert.strictEqual(out, 'forwarded:eth_sign');
});

test('ack: request keeps waiting past 8 s, then deny rejects with 4001', async () => {
  const { win, advance, emit } = load();
  let out; let err;
  win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; }, (e) => { err = e; });
  await settle(); emit('scamshield:wallet-ack', { id: 1 });
  advance(60000); await settle(); assert.strictEqual(out, undefined); assert.strictEqual(err, undefined);
  emit('scamshield:wallet-decision', { id: 1, allow: false }); await settle();
  assert.strictEqual(err && err.code, 4001);
});

test('ack: an explicit allow still forwards the request', async () => {
  const { win, advance, emit } = load();
  let out; win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; });
  await settle(); emit('scamshield:wallet-ack', { id: 1 }); advance(20000);
  emit('scamshield:wallet-decision', { id: 1, allow: true }); await settle();
  assert.strictEqual(out, 'forwarded:eth_sign');
});

test('ack for a different id does not cancel this request\'s timer', async () => {
  const { win, advance, emit } = load();
  let out; win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; });
  await settle(); emit('scamshield:wallet-ack', { id: 99 }); advance(8000); await settle();
  assert.strictEqual(out, 'forwarded:eth_sign');
});

test('ack: a 5-minute backstop denies (4001) if no decision ever arrives', async () => {
  const { win, advance, emit } = load();
  let out; let err;
  win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; }, (e) => { err = e; });
  await settle(); emit('scamshield:wallet-ack', { id: 1 });
  advance(5 * 60000 - 1); await settle(); assert.strictEqual(err, undefined);
  advance(1); await settle();
  assert.strictEqual(out, undefined);
  assert.strictEqual(err && err.code, 4001);
});

test('ack: a decision before the backstop clears it (no late second resolve)', async () => {
  const { win, advance, emit } = load();
  let out; let err;
  win.ethereum.request({ method: 'eth_sign' }).then((v) => { out = v; }, (e) => { err = e; });
  await settle(); emit('scamshield:wallet-ack', { id: 1 });
  emit('scamshield:wallet-decision', { id: 1, allow: true }); await settle();
  advance(10 * 60000); await settle();
  assert.strictEqual(out, 'forwarded:eth_sign'); assert.strictEqual(err, undefined);
});
