// tests/unit/update.test.js — 0.12.1 apply-store-update-when-idle decision
const test = require('node:test');
const assert = require('node:assert');
const U = require('../../background/update');

const T0 = Date.UTC(2026, 8, 6, 12, 0, 0);
const sw = { contextType: 'BACKGROUND' };
const popup = { contextType: 'POPUP' };
const tab = { contextType: 'TAB' };

test('openPageCount ignores the service worker and counts user-facing pages', () => {
  assert.equal(U.openPageCount([]), 0);
  assert.equal(U.openPageCount(undefined), 0);
  assert.equal(U.openPageCount([sw]), 0);
  assert.equal(U.openPageCount([sw, popup]), 1);
  assert.equal(U.openPageCount([sw, popup, tab, null]), 2);
});

test('openPageCount treats Firefox getViews() windows (no contextType) as pages', () => {
  assert.equal(U.openPageCount([{}, {}]), 2);
});

test('decide applies at once when nothing is open and nothing is running', () => {
  assert.deepEqual(U.decide({ contexts: [sw], busy: 0, pendingSince: T0, now: T0 }), { apply: true, reason: 'idle' });
  assert.deepEqual(U.decide({}), { apply: true, reason: 'idle' });
});

test('decide defers while the popup, settings or block page is open', () => {
  assert.deepEqual(U.decide({ contexts: [sw, popup], busy: 0, pendingSince: T0, now: T0 }), { apply: false, reason: 'pages-open' });
  assert.deepEqual(U.decide({ contexts: [tab], busy: 0, pendingSince: T0, now: T0 + 60000 }), { apply: false, reason: 'pages-open' });
});

test('decide defers while a feed/OTA/report job is in flight', () => {
  assert.deepEqual(U.decide({ contexts: [sw], busy: 1, pendingSince: T0, now: T0 }), { apply: false, reason: 'busy' });
});

test('decide forces the reload once the deferral cap is reached', () => {
  const late = T0 + U.MAX_DEFER_MS;
  assert.deepEqual(U.decide({ contexts: [sw, popup], busy: 3, pendingSince: T0, now: late }), { apply: true, reason: 'max-defer' });
  assert.equal(U.decide({ contexts: [popup], busy: 0, pendingSince: T0, now: late - 1 }).apply, false);
});

test('deferral cap is 30 minutes and the recheck cadence is one minute', () => {
  assert.equal(U.MAX_DEFER_MS, 30 * 60 * 1000);
  assert.equal(U.RECHECK_MINUTES, 1);
});

// 0.14.1: the otaUrl '' -> default migration is gated on the PREVIOUS version
// being older than 0.4.0, so a user who cleared the field later stays cleared.
test('versionLessThan is a strict numeric semver compare that is false on garbage', () => {
  const lt = U.versionLessThan;
  assert.equal(lt('0.3.9', '0.4.0'), true);
  assert.equal(lt('0.3.1', '0.4.0'), true);
  assert.equal(lt('0.4.0', '0.4.0'), false);
  assert.equal(lt('0.14.0', '0.4.0'), false);   // numeric, not lexical
  assert.equal(lt('0.9.12', '0.10.0'), true);
  assert.equal(lt('1.0.0', '0.4.0'), false);
  assert.equal(lt('0.4', '0.4.1'), true);       // missing parts read as 0
  assert.equal(lt(undefined, '0.4.0'), false);
  assert.equal(lt(null, '0.4.0'), false);
  assert.equal(lt('', '0.4.0'), false);
  assert.equal(lt('garbage', '0.4.0'), false);
  assert.equal(lt('0.3.x', '0.4.0'), false);
  assert.equal(lt(3, '0.4.0'), false);
});

// ---- 0.14.1: alarm hygiene + feed top-up ----

function fakeAlarms(initial) {
  const store = new Map(Object.entries(initial || {}));
  const calls = { create: [] };
  return {
    calls, store,
    get: async (...args) => { assert.equal(args.length, 1, 'promise-only API must not get a callback'); return store.get(args[0]); }, // like Firefox
    create: (name, info) => { calls.create.push([name, info]); store.set(name, { name, scheduledTime: Date.now() + 1, ...info }); },
  };
}

test('ensureAlarm leaves an existing same-period alarm untouched (timer not restarted)', async () => {
  const a = fakeAlarms({ ota: { name: 'ota', scheduledTime: 12345, periodInMinutes: 720 } });
  assert.equal(await U.ensureAlarm(a, 'ota', 720), 'kept');
  assert.equal(a.calls.create.length, 0);
  assert.equal(a.store.get('ota').scheduledTime, 12345);
});

test('ensureAlarm creates a missing alarm', async () => {
  const a = fakeAlarms();
  assert.equal(await U.ensureAlarm(a, 'hot', 60), 'created');
  assert.deepEqual(a.calls.create, [['hot', { periodInMinutes: 60 }]]);
});

test('ensureAlarm replaces an alarm whose period differs', async () => {
  const a = fakeAlarms({ hot: { name: 'hot', scheduledTime: 1, periodInMinutes: 30 } });
  assert.equal(await U.ensureAlarm(a, 'hot', 60), 'created');
  assert.equal(a.calls.create.length, 1);
});

test('ensureAlarm works with a callback-only get() and survives a throwing get()', async () => {
  const cb = { calls: [], get(name, fn) { if (typeof fn === 'function') fn({ name, periodInMinutes: 720 }); }, create() { this.calls.push(1); } };
  assert.equal(await U.ensureAlarm(cb, 'ota', 720), 'kept');
  assert.equal(cb.calls.length, 0);
  const bad = { calls: [], get() { throw new Error('boom'); }, create() { this.calls.push(1); } };
  assert.equal(await U.ensureAlarm(bad, 'ota', 720), 'created');
  assert.equal(bad.calls.length, 1);
});

test('shouldTopUpFeed: never attempted -> yes, 1 h ago -> no, 13 h ago -> yes', () => {
  const H = 3600000;
  assert.equal(U.shouldTopUpFeed(undefined, T0), true);
  assert.equal(U.shouldTopUpFeed(0, T0), true);
  assert.equal(U.shouldTopUpFeed(T0 - H, T0), false);
  assert.equal(U.shouldTopUpFeed(T0 - 13 * H, T0), true);
  assert.equal(U.shouldTopUpFeed(T0 - 12 * H, T0), false);   // strictly greater, like hot
  assert.equal(U.shouldTopUpFeed(T0 + H, T0), false);        // clock skew: future stamp is not stale
});

test('singleFlight: concurrent callers share one run; a later call after settling starts a new one', async () => {
  let runs = 0, release;
  const gate = new Promise((r) => { release = r; });
  const start = U.singleFlight(async () => { runs++; await gate; return 'done'; });
  // onInstalled + boot top-up in the same SW life
  const a = start(), b = start();
  assert.equal(a, b);
  release();
  assert.equal(await a, 'done');
  assert.equal(runs, 1);
  await start();
  assert.equal(runs, 2);
});

test('singleFlight survives a rejecting job and allows a retry', async () => {
  let runs = 0;
  const start = U.singleFlight(async () => { runs++; throw new Error('x'); });
  await assert.rejects(start());
  await assert.rejects(start());
  assert.equal(runs, 2);
});
