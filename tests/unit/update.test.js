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
