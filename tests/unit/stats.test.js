// tests/unit/stats.test.js — 0.7.0 local statistics data layer
const test = require('node:test');
const assert = require('node:assert');
const S = require('../../background/stats');

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 7, 27, 12, 0, 0); // 2026-08-27T12:00:00Z

test('dayKey is a UTC YYYY-MM-DD stamp', () => {
  assert.equal(S.dayKey(T0), '2026-08-27');
  assert.equal(S.dayKey(Date.UTC(2026, 7, 27, 23, 59, 59)), '2026-08-27');
  assert.equal(S.dayKey(Date.UTC(2026, 7, 28, 0, 0, 0)), '2026-08-28');
  assert.equal(typeof S.dayKey(), 'string'); // defaults to now
});

test('bump creates today bucket on an empty ring', () => {
  const ring = S.bump(undefined, 'checked', T0);
  assert.deepEqual(ring, [{ d: '2026-08-27', checked: 1, threats: 0, privacy: 0 }]);
});

test('bump accumulates in the same bucket across fields', () => {
  let ring = S.bump([], 'checked', T0);
  ring = S.bump(ring, 'checked', T0 + 1000);
  ring = S.bump(ring, 'threats', T0 + 2000);
  ring = S.bump(ring, 'privacy', T0 + 3000);
  assert.equal(ring.length, 1);
  assert.deepEqual(ring[0], { d: '2026-08-27', checked: 2, threats: 1, privacy: 1 });
});

test('bump rolls over to a new bucket the next day, keeping history', () => {
  let ring = S.bump([], 'checked', T0);
  ring = S.bump(ring, 'threats', T0 + DAY);
  assert.equal(ring.length, 2);
  assert.deepEqual(ring.map((b) => b.d), ['2026-08-27', '2026-08-28']);
  assert.equal(ring[0].checked, 1);
  assert.equal(ring[1].threats, 1);
  assert.equal(ring[1].checked, 0);
});

test('bump trims the ring to 90 buckets, dropping the oldest', () => {
  let ring = [];
  for (let i = 0; i < 120; i++) ring = S.bump(ring, 'checked', T0 + i * DAY);
  assert.equal(ring.length, S.RING_DAYS);
  assert.equal(ring.length, 90);
  assert.equal(ring[0].d, S.dayKey(T0 + 30 * DAY));           // first 30 days dropped
  assert.equal(ring[89].d, S.dayKey(T0 + 119 * DAY));
  // still sorted oldest → newest
  const keys = ring.map((b) => b.d);
  assert.deepEqual(keys, [...keys].sort());
});

test('bump does not mutate the ring it was given', () => {
  const before = [{ d: '2026-08-27', checked: 1, threats: 0, privacy: 0 }];
  const snapshot = JSON.parse(JSON.stringify(before));
  S.bump(before, 'checked', T0);
  assert.deepEqual(before, snapshot);
});

test('bump ignores an unknown field but still returns a clean ring', () => {
  const ring = S.bump([{ d: '2026-08-27', checked: 3, threats: 1, privacy: 0 }], 'bogus', T0);
  assert.deepEqual(ring, [{ d: '2026-08-27', checked: 3, threats: 1, privacy: 0 }]);
});

test('bump repairs a corrupt stored ring (bad shapes, negatives, duplicate days, wrong order)', () => {
  const dirty = [
    null,
    { d: 'nonsense', checked: 5 },
    { d: '2026-08-28', checked: 2, threats: 'x', privacy: -3 },
    { d: '2026-08-27', checked: 1 },
    { d: '2026-08-28', checked: 1, threats: 1 }
  ];
  const ring = S.bump(dirty, 'threats', T0);
  assert.deepEqual(ring, [
    { d: '2026-08-27', checked: 1, threats: 1, privacy: 0 },
    { d: '2026-08-28', checked: 3, threats: 1, privacy: 0 }
  ]);
});

test('summarize totals the 7- and 30-day windows inclusive of today', () => {
  let ring = [];
  for (let i = 0; i < 40; i++) ring = S.bump(ring, 'checked', T0 - i * DAY);
  assert.deepEqual(S.summarize(ring, 7, T0), { checked: 7, threats: 0, privacy: 0 });
  assert.deepEqual(S.summarize(ring, 30, T0), { checked: 30, threats: 0, privacy: 0 });
});

test('summarize is zero for an empty or missing ring', () => {
  assert.deepEqual(S.summarize([], 7, T0), { checked: 0, threats: 0, privacy: 0 });
  assert.deepEqual(S.summarize(undefined, 30, T0), { checked: 0, threats: 0, privacy: 0 });
});

test('summarize handles gaps and excludes days outside the window', () => {
  const ring = [
    { d: S.dayKey(T0 - 40 * DAY), checked: 100, threats: 100, privacy: 100 }, // outside 30
    { d: S.dayKey(T0 - 10 * DAY), checked: 4, threats: 2, privacy: 1 },       // inside 30, outside 7
    { d: S.dayKey(T0 - 2 * DAY), checked: 3, threats: 1, privacy: 0 },        // inside 7
    { d: S.dayKey(T0), checked: 1, threats: 1, privacy: 2 }                   // today
  ];
  assert.deepEqual(S.summarize(ring, 7, T0), { checked: 4, threats: 2, privacy: 2 });
  assert.deepEqual(S.summarize(ring, 30, T0), { checked: 8, threats: 4, privacy: 3 });
});

test('summarize counts today even at the very start of the UTC day', () => {
  const midnight = Date.UTC(2026, 7, 27, 0, 0, 0);
  const ring = [{ d: '2026-08-27', checked: 2, threats: 0, privacy: 0 }];
  assert.equal(S.summarize(ring, 7, midnight).checked, 2);
  // and the 7-day window reaches exactly 6 days back, not 7
  assert.equal(S.summarize([{ d: S.dayKey(midnight - 6 * DAY), checked: 1, threats: 0, privacy: 0 }], 7, midnight).checked, 1);
  assert.equal(S.summarize([{ d: S.dayKey(midnight - 7 * DAY), checked: 1, threats: 0, privacy: 0 }], 7, midnight).checked, 0);
});

test('categoryOf maps detector kinds', () => {
  assert.equal(S.categoryOf({ kind: 'wallet' }), 'wallet');
  assert.equal(S.categoryOf({ kind: 'clipboard' }), 'clipboard');
  assert.equal(S.categoryOf({ kind: 'techscam' }), 'techSupport');
  assert.equal(S.categoryOf({ kind: 'clickfix' }), 'clickfix');
  assert.equal(S.categoryOf({ kind: 'fakeupdate' }), 'fakeUpdate');
  assert.equal(S.categoryOf('wallet'), 'wallet'); // bare kind string
});

test('categoryOf maps decisive page-verdict flags', () => {
  const page = (flags) => ({ kind: 'page', verdict: { level: 'dangerous', flags } });
  assert.equal(S.categoryOf(page(['seed-phrase-harvest'])), 'wallet');
  assert.equal(S.categoryOf(page(['clickfix'])), 'clickfix');
  assert.equal(S.categoryOf(page(['fake-browser-update'])), 'fakeUpdate');
  assert.equal(S.categoryOf(page(['delivery-fee-scam'])), 'fakeShop');
  assert.equal(S.categoryOf(page(['fake-alert-phone'])), 'techSupport');
  assert.equal(S.categoryOf(page(['credential-form-foreign-domain'])), 'phishing');
  assert.equal(S.categoryOf(page(['brand-impersonation-content'])), 'phishing');
  assert.equal(S.categoryOf(page(['brand-impersonation-visual'])), 'phishing');
});

// The SW's real call-site shape: bumpThreats passes
// { kind: msg.kind || 'page', verdict: lastVerdict.get(tabId) }.
test('categoryOf: ClickFix escalation (kind clipboard + clickfix flag) files under clickfix', () => {
  // content_script.js reports the clickfix verdict, then sends kind:'clipboard'.
  const event = {
    kind: 'clipboard',
    verdict: { level: 'dangerous', score: 0.95, flags: ['clickfix'], reasonCodes: ['clickfixInstructions'] }
  };
  assert.equal(S.categoryOf(event), 'clickfix');
});

test('categoryOf: a plain clipboard toast stays clipboard', () => {
  assert.equal(S.categoryOf({ kind: 'clipboard', verdict: { level: 'dangerous', flags: [] } }), 'clipboard');
  assert.equal(S.categoryOf({ kind: 'clipboard', verdict: null }), 'clipboard');
});

test('categoryOf: an unrelated page verdict never overrides the detector that blocked', () => {
  // A wallet request declined while the tab's page verdict is a phishing form:
  // the block was the wallet guard's, so it must not be filed as phishing.
  const pageVerdict = { level: 'dangerous', flags: ['credential-form-foreign-domain'] };
  assert.equal(S.categoryOf({ kind: 'wallet', verdict: pageVerdict }), 'wallet');
  assert.equal(S.categoryOf({ kind: 'techscam', verdict: { level: 'dangerous', flags: ['brand-impersonation-visual'] } }), 'techSupport');
});

test('categoryOf reads a verdict passed on its own', () => {
  assert.equal(S.categoryOf({ level: 'dangerous', flags: ['clickfix'] }), 'clickfix');
  assert.equal(S.categoryOf({ level: 'dangerous', flags: [] }), 'phishing');
});

test('categoryOf treats a flag-less dangerous page as phishing, and shop reasons as fakeShop', () => {
  assert.equal(S.categoryOf({ kind: 'page', verdict: { level: 'dangerous', flags: [] } }), 'phishing');
  assert.equal(S.categoryOf({ kind: 'page', verdict: { level: 'dangerous', flags: [], reasonCodes: ['shop_no_contact_detail'] } }), 'fakeShop');
});

test('categoryOf falls back to other for anything unknown', () => {
  assert.equal(S.categoryOf(undefined), 'other');
  assert.equal(S.categoryOf(null), 'other');
  assert.equal(S.categoryOf({}), 'other');
  assert.equal(S.categoryOf({ kind: 'mystery-detector' }), 'other');
  assert.equal(S.categoryOf({ kind: 'mystery', verdict: { level: 'safe', flags: ['unheard-of-flag'] } }), 'other');
});

test('every category categoryOf can return is declared in CATEGORIES', () => {
  const produced = [
    S.categoryOf({ kind: 'wallet' }), S.categoryOf({ kind: 'clipboard' }),
    S.categoryOf({ kind: 'techscam' }), S.categoryOf({ kind: 'clickfix' }),
    S.categoryOf({ kind: 'fakeupdate' }), S.categoryOf({ kind: 'page' }),
    S.categoryOf({ kind: 'page', verdict: { level: 'dangerous', flags: ['delivery-fee-scam'] } }),
    S.categoryOf({})
  ];
  for (const c of produced) assert.ok(S.CATEGORIES.includes(c), `${c} missing from CATEGORIES`);
  assert.equal(new Set(produced).size, S.CATEGORIES.length);
});

// --- lifetime privacy counter (privacyFindingsTotal) ------------------------
// The ring forgets after 90 days, so "all time" privacy findings need a counter
// of their own. These pin the once-only backfill the service worker relies on.

test('privacyTotal seeds a missing counter from the ring, once', () => {
  const ring = [
    { d: '2026-08-25', checked: 3, threats: 0, privacy: 2 },
    { d: '2026-08-27', checked: 5, threats: 1, privacy: 1 }
  ];
  const first = S.privacyTotal(undefined, ring);
  assert.deepEqual(first, { total: 3, backfilled: true });
  // Feeding the seeded value back in is a no-op: the second boot reads storage,
  // not the ring, so a ring that has since rolled over cannot lower the total.
  assert.deepEqual(S.privacyTotal(first.total, ring), { total: 3, backfilled: false });
  assert.deepEqual(S.privacyTotal(first.total, []), { total: 3, backfilled: false });
});

test('privacyTotal treats a stored 0 as a real value, never as missing', () => {
  const ring = [{ d: '2026-08-27', checked: 1, threats: 0, privacy: 4 }];
  assert.deepEqual(S.privacyTotal(0, ring), { total: 0, backfilled: false });
});

test('privacyTotal keeps a stored total that already exceeds the ring', () => {
  const ring = [{ d: '2026-08-27', checked: 1, threats: 0, privacy: 1 }];
  assert.deepEqual(S.privacyTotal(900, ring), { total: 900, backfilled: false });
  assert.deepEqual(S.privacyTotal(7.9, ring), { total: 7, backfilled: false });
});

test('privacyTotal re-seeds junk or impossible stored values', () => {
  const ring = [{ d: '2026-08-27', checked: 1, threats: 0, privacy: 2 }];
  for (const junk of [undefined, null, -1, NaN, Infinity, '5', {}, []]) {
    assert.deepEqual(S.privacyTotal(junk, ring), { total: 2, backfilled: true }, `junk: ${String(junk)}`);
  }
});

test('privacyTotal counts only privacy, and survives a junk ring', () => {
  const ring = [{ d: '2026-08-27', checked: 40, threats: 3, privacy: 2 }, null, { d: 'nope', privacy: 99 }];
  assert.deepEqual(S.privacyTotal(undefined, ring), { total: 2, backfilled: true });
  for (const junk of [undefined, null, 'nope', 42]) {
    assert.deepEqual(S.privacyTotal(undefined, junk), { total: 0, backfilled: true });
  }
});

// The seam the service worker actually uses: seed from the ring, then increment
// on every privacy bump — the same read-modify-write bumpStat performs.
test('privacyTotal + bump reproduce the service worker seam across a rollover', () => {
  let stored; // key absent, as on an install that predates the counter
  let ring = [{ d: '2026-08-26', checked: 2, threats: 0, privacy: 2 }];
  const seed = S.privacyTotal(stored, ring);
  assert.equal(seed.backfilled, true);
  stored = seed.total; // the boot-time backfill writes this once
  // Two privacy findings land.
  for (const t of [T0, T0 + DAY]) {
    ring = S.bump(ring, 'privacy', t);
    stored = S.privacyTotal(stored, ring).total + 1;
  }
  assert.equal(stored, 4);
  // The ring rolls past 90 days and forgets the old days; the total does not.
  ring = ring.filter((b) => b.d >= '2026-08-28');
  assert.equal(S.summarize(ring, 90, T0 + DAY).privacy, 1);
  assert.equal(S.privacyTotal(stored, ring).total, 4);
});
