'use strict';
// Firefox (0.14.1): details of events the isolated world dispatches to MAIN-world
// listeners must go through cloneInto(obj, window), or the page-side wallet hook
// hits "Permission denied" reading e.detail.id and fails open after 8 s.
// Chrome has no cloneInto, so the plain object must be passed unchanged.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

// Permissive stand-in for DOM objects: any property/call yields another stub,
// except querySelector* (null: no existing overlay) and a few primitives.
function anyStub() {
  const fn = function () {};
  const p = new Proxy(fn, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (typeof k === 'symbol') return undefined;
      if (/^querySelector$/.test(k)) return () => null;
      if (k === 'querySelectorAll') return () => [];
      if (k === 'isConnected') return true;
      if (k === 'length') return 0;
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; }
  });
  return p;
}

function load({ withClone }) {
  const listeners = {};
  const dispatched = [];
  const cloned = [];
  const win = {
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    dispatchEvent: (ev) => { dispatched.push(ev); return true; },
    top: null
  };
  win.top = win;
  const doc = anyStub();
  const ctx = {
    window: win,
    document: doc,
    location: { hostname: 'example.com', href: 'https://example.com/', origin: 'https://example.com' },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    console, URL, Promise, Map, Set, Array, Object, JSON, Math, Date, RegExp, Error, String, Number, Boolean,
    chrome: {
      runtime: {
        id: 'x',
        sendMessage: (m, cb) => cb && cb(m.type === 'getSettings' ? { enabled: false } : null),
        onMessage: { addListener() {} }
      },
      i18n: { getMessage: () => '' },
      storage: anyStub()
    }
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  win.document = doc;
  // The isolated world's `root` is globalThis; wire window-ish names onto it.
  Object.assign(ctx, { addEventListener: win.addEventListener, dispatchEvent: win.dispatchEvent });
  // document.readyState is a proxy stub (truthy, !== 'loading'), so run() would
  // start; make it 'loading' with a swallowed DOMContentLoaded listener instead.
  ctx.document = new Proxy(doc, { get: (t, k) => (k === 'readyState' ? 'loading' : k === 'addEventListener' ? () => {} : t[k]) });
  if (withClone) ctx.cloneInto = (o, target) => { cloned.push({ o, target }); return { __cloned: true, ...o }; };
  vm.createContext(ctx);
  vm.runInContext(read('ui/reasons.js'), ctx);
  vm.runInContext(read('content/actions.js'), ctx);
  vm.runInContext(read('content/content_script.js'), ctx);
  return { ctx, win, listeners, dispatched, cloned };
}
const settle = () => new Promise((r) => setImmediate(r));
const ofType = (d, t) => d.filter((e) => e.type === t);

for (const withClone of [true, false]) {
  const label = withClone ? 'with cloneInto (Firefox)' : 'without cloneInto (Chrome)';

  test(`wallet-decision detail ${label}`, async () => {
    const { win, listeners, dispatched, cloned } = load({ withClone });
    assert.ok(listeners['scamshield:wallet-confirm'], 'bridge listener registered');
    // Extension disabled -> reply(id, true) path.
    await listeners['scamshield:wallet-confirm'][0]({ detail: { id: 7 } });
    await settle();
    const [ev] = ofType(dispatched, 'scamshield:wallet-decision');
    assert.ok(ev, 'decision dispatched');
    if (withClone) {
      assert.strictEqual(cloned.length, 1);
      assert.strictEqual(cloned[0].target, win, 'cloned into the page window');
      assert.deepStrictEqual({ ...ev.detail }, { __cloned: true, id: 7, allow: true });
    } else {
      assert.deepStrictEqual({ ...ev.detail }, { id: 7, allow: true });
    }
  });

  test(`wallet-ack detail ${label}`, () => {
    const { win, ctx, dispatched, cloned } = load({ withClone });
    ctx.ScamShield.actions.walletConfirmOverlay({ id: 9, level: 'dangerous', reasons: [] }, () => {});
    const [ev] = ofType(dispatched, 'scamshield:wallet-ack');
    assert.ok(ev, 'ack dispatched');
    if (withClone) {
      assert.strictEqual(cloned.length, 1);
      assert.strictEqual(cloned[0].target, win);
      assert.deepStrictEqual({ ...ev.detail }, { __cloned: true, id: 9 });
    } else {
      assert.deepStrictEqual({ ...ev.detail }, { id: 9 });
    }
  });
}
