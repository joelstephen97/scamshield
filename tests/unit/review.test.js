// tests/unit/review.test.js — earned review-ask eligibility (0.7.0)
const test = require('node:test');
const assert = require('node:assert');
const R = require('../../ui/review');

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0); // 2026-08-27T12:00:00Z

// A baseline that is eligible on every axis: Chrome, 2+ blocks, 8-day-old
// install, never asked before.
function base(overrides) {
  return Object.assign({
    isChrome: true,
    threatsBlocked: 1,
    installedAt: NOW - 15 * DAY,
    now: NOW,
    state: 'pending',
    snoozeUntil: 0,
    asks: 0
  }, overrides || {});
}

test('eligible when every condition holds (pending, Chrome, 1 stop, 15-day install)', () => {
  assert.equal(R.eligible(base()), true);
});

test('Firefox is eligible under the same thresholds (0.14.1: AMO listing exists)', () => {
  assert.equal(R.eligible(base({ isChrome: false })), true);
  assert.equal(R.eligible(base({ isChrome: false, threatsBlocked: 0 })), false);
  assert.equal(R.eligible(base({ isChrome: false, installedAt: NOW - 13 * DAY })), false);
  assert.equal(R.eligible(base({ isChrome: false, state: 'declined' })), false);
});

test('reviewUrl picks the CWS URL on Chrome and the AMO URL on Firefox', () => {
  assert.equal(R.AMO_REVIEW_URL, 'https://addons.mozilla.org/firefox/addon/scam-phishing-blocker-scamshie/reviews/');
  assert.equal(R.reviewUrl({ version: '1' }), R.CWS_REVIEW_URL);
  assert.equal(R.reviewUrl({ browser_specific_settings: { gecko: { id: 'x@y' } } }), R.AMO_REVIEW_URL);
});

test('not eligible with no Stop-tier event', () => {
  assert.equal(R.eligible(base({ threatsBlocked: 0 })), false);
});

test('eligible with exactly one Stop-tier event', () => {
  assert.equal(R.eligible(base({ threatsBlocked: 1 })), true);
});

test('not eligible before the install is 14 days old', () => {
  assert.equal(R.eligible(base({ installedAt: NOW - 13 * DAY })), false);
  assert.equal(R.eligible(base({ installedAt: NOW - 1000 })), false);
});

test('eligible right at the 14-day install-age boundary', () => {
  assert.equal(R.eligible(base({ installedAt: NOW - 14 * DAY })), true);
});

test('not eligible when state is anything other than pending/snoozed', () => {
  assert.equal(R.eligible(base({ state: 'rated' })), false);
  assert.equal(R.eligible(base({ state: 'declined' })), false);
  assert.equal(R.eligible(base({ state: 'bogus' })), false);
});

test('rated is permanent — still not eligible even if every other condition is generous', () => {
  assert.equal(R.eligible(base({ state: 'rated', threatsBlocked: 999, installedAt: 0 })), false);
});

test('declined is permanent — still not eligible even if every other condition is generous', () => {
  assert.equal(R.eligible(base({ state: 'declined', threatsBlocked: 999, installedAt: 0 })), false);
});

test('snoozed: not eligible until snoozeUntil has passed', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW + DAY, asks: 1 });
  assert.equal(R.eligible(s), false);
});

test('snoozed: eligible again once snoozeUntil has passed (re-ask), asks below cap', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 1 });
  assert.equal(R.eligible(s), true);
});

test('snoozed: eligible exactly at snoozeUntil (now >= snoozeUntil)', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW, asks: 1 });
  assert.equal(R.eligible(s), true);
});

test('snoozed twice (asks reaches the cap) → never eligible again, even after the snooze window passes', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 2 });
  assert.equal(R.eligible(s), false);
});

test('snoozed with asks above the cap is also never eligible', () => {
  const s = base({ state: 'snoozed', snoozeUntil: NOW - 1, asks: 3 });
  assert.equal(R.eligible(s), false);
});

test('handles missing/garbage input without throwing', () => {
  assert.equal(R.eligible(undefined), false);
  assert.equal(R.eligible({}), false);
  assert.equal(R.eligible({ isChrome: true, threatsBlocked: 'x', installedAt: null, state: 'pending' }), false);
});

test('exposes the Chrome Web Store review URL for the real extension listing', () => {
  assert.equal(R.CWS_REVIEW_URL, 'https://chromewebstore.google.com/detail/fojjjofjimbfoddafoampojopijnlihl/reviews');
});

test('MAX_ASKS is 2 (snoozed twice caps out) and constants match the spec', () => {
  assert.equal(R.THREATS_THRESHOLD, 1);
  assert.equal(R.INSTALL_AGE_DAYS, 14);
  assert.equal(R.SNOOZE_DAYS, 90);
  assert.equal(R.MAX_ASKS, 2);
});

// --- isChromeFromManifest -----------------------------------------------
// Pure signal from the *packaged* manifest, not runtime globals — modern
// Chrome (Chromium 148, 2026) ships its own native `browser.*` alias, so
// `typeof browser === 'undefined'` no longer distinguishes the two browsers.

test('Chrome manifest (no browser_specific_settings) is Chrome', () => {
  const chromeManifest = { name: 'ScamShield', manifest_version: 3 };
  assert.equal(R.isChromeFromManifest(chromeManifest), true);
});

test('Firefox manifest (carries browser_specific_settings) is not Chrome', () => {
  const firefoxManifest = {
    name: 'ScamShield', manifest_version: 3,
    browser_specific_settings: { gecko: { id: 'scamshield@joel.dev', strict_min_version: '128.0' } }
  };
  assert.equal(R.isChromeFromManifest(firefoxManifest), false);
});

test('isChromeFromManifest fails open (Chrome) on junk/missing input', () => {
  assert.equal(R.isChromeFromManifest(undefined), true);
  assert.equal(R.isChromeFromManifest(null), true);
  assert.equal(R.isChromeFromManifest({}), true);
  assert.equal(R.isChromeFromManifest('not an object'), true);
});

// --- shouldShowCard (render-gate) ----------------------------------------
// Never show the ask beneath an active warning, whatever eligible() says.

test('shouldShowCard: eligible + a clean/unknown verdict shows the card', () => {
  assert.equal(R.shouldShowCard(true, 'safe'), true);
  assert.equal(R.shouldShowCard(true, 'unknown'), true);
  assert.equal(R.shouldShowCard(true, undefined), true);
  assert.equal(R.shouldShowCard(true, null), true);
});

test('shouldShowCard: dangerous or suspicious suppresses the card even when eligible', () => {
  assert.equal(R.shouldShowCard(true, 'dangerous'), false);
  assert.equal(R.shouldShowCard(true, 'suspicious'), false);
});

test('shouldShowCard: not eligible never shows the card, regardless of level', () => {
  assert.equal(R.shouldShowCard(false, 'safe'), false);
  assert.equal(R.shouldShowCard(false, 'unknown'), false);
  assert.equal(R.shouldShowCard(false, 'dangerous'), false);
});

// ---- 0.15.0: the ask must never follow a warning or a false alarm ----
test('false alarm in the last 14 days blocks the ask; older than 14 days does not', () => {
  assert.equal(R.eligible(base({ lastFalseAlarmAt: NOW - 13 * DAY })), false);
  assert.equal(R.eligible(base({ lastFalseAlarmAt: NOW - 1000 })), false);
  assert.equal(R.eligible(base({ lastFalseAlarmAt: NOW - 14 * DAY })), true);
  assert.equal(R.eligible(base({ lastFalseAlarmAt: 0 })), true);
  assert.equal(R.FALSE_ALARM_DAYS, 14);
});

test('a warn or stop surface within 10 minutes blocks the ask; 10 minutes or older does not', () => {
  assert.equal(R.eligible(base({ lastSurfaceAt: NOW - 9 * 60 * 1000 })), false);
  assert.equal(R.eligible(base({ lastSurfaceAt: NOW - 1000 })), false);
  assert.equal(R.eligible(base({ lastSurfaceAt: NOW - 10 * 60 * 1000 })), true);
  assert.equal(R.eligible(base({ lastSurfaceAt: 0 })), true);
  assert.equal(R.SURFACE_QUIET_MS, 600000);
});

test('lastWarnStopAt takes the newest interrupting surface and ignores passive marks', () => {
  const rows = [
    { ts: 900, host: 'a.example', kind: 'serp-dot' },
    { ts: 500, host: 'a.example', kind: 'banner' },
    { ts: 700, host: 'b.example', kind: 'interstitial' },
    { ts: 800, host: 'c.example', kind: 'ad-hidden' },
    { ts: 950, host: 'c.example', kind: 'hidden-blocks' }
  ];
  assert.equal(R.lastWarnStopAt(rows), 700);
  assert.equal(R.lastWarnStopAt([{ ts: 5, kind: 'serp-dot' }]), 0);
  assert.equal(R.lastWarnStopAt(null), 0);
  assert.equal(R.lastWarnStopAt([null, { ts: 'x', kind: 'banner' }]), 0);
});

test('every passive/warn kind is a real surface-log kind (rule stays in sync with engine/surface_log.js)', () => {
  const L = require('../../engine/surface_log');
  for (const k of R.WARN_STOP_KINDS) assert.ok(L.KINDS.includes(k), k);
});
