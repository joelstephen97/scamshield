// tests/unit/sw_hot_source.test.js — wiring assertions for the hot list (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../../background/service_worker.js'), 'utf8');
test('hot list constants and default setting exist', () => {
  assert.ok(/DEFAULT_HOT_URL = 'https:\/\/raw\.githubusercontent\.com\/joelstephen97\/scamshield-feed\/hot\/hot\.json'/.test(src));
  assert.ok(/hotListEnabled: true/.test(src), 'DEFAULTS.hotListEnabled');
  assert.ok(/HOT_PERIOD_MINUTES = 60/.test(src));
});
test('hot alarm is created, handled, and the job is tracked for the store-update gate', () => {
  assert.ok(/api\.alarms\.create\('hot'/.test(src));
  assert.ok(/a\.name === 'hot'\) runHotUpdate\(\)/.test(src));
  assert.ok(/runHotUpdate = trackedJob\(runHotUpdate\)/.test(src));
});
test('conditional GET and the guard are used', () => {
  assert.ok(/'If-None-Match'/.test(src));
  assert.ok(/SSHot\.guardHot\(/.test(src));
  assert.ok(/SSHot\.hotRuleIds\(/.test(src));
});
test('checkFeedHost consults the hot set before hashing', () => {
  assert.ok(/hotHostSet\.has\(normalized\)/.test(src));
});
test('exports for e2e', () => {
  assert.ok(/runHotUpdate, applyHotRules, getHotStatus/.test(src));
});

// Slices out one top-level `function`/`async function` declaration's body, up
// to the next top-level function declaration (or EOF) — good enough to scope
// an assertion to a single function without a full parser.
function functionBody(fnName) {
  const startRe = new RegExp('\\n(?:async )?function ' + fnName + '\\(');
  const m = startRe.exec(src);
  assert.ok(m, `function ${fnName} not found in source`);
  const rest = src.slice(m.index + 1);
  const nextRe = /\n(?:async )?function [A-Za-z_$][\w$]*\(/;
  const nm = nextRe.exec(rest);
  return nm ? rest.slice(0, nm.index) : rest;
}

test('review round 1: hot-set readiness is awaited on cold boot before every feed check', () => {
  assert.ok(/let hotReadyPromise = null;/.test(src), 'hotReadyPromise declared');
  assert.ok(/async function awaitHotReady\(\)/.test(src), 'awaitHotReady() helper defined');
  assert.ok(/awaitHotReady\(\)/.test(functionBody('checkFeedHost')), 'checkFeedHost awaits hot-set readiness');
  assert.ok(/awaitHotReady\(\)/.test(functionBody('checkFeedBatchHosts')), 'checkFeedBatchHosts awaits hot-set readiness');
});

// Fix round 1 (Task 13 review): getHotStatus reads the module-level hotStatus
// (count/paths/generatedAt) alongside hotUpdatedAt from storage. On a cold SW
// wake the timestamp is already persisted but hotStatus is still the initial
// { count: 0 } until the boot apply lands, so an options page that woke the
// worker rendered "Hot list: 0 sites, updated 3 minutes ago". It now waits on
// the same readiness gate the feed checks use.
test('fix round 1: getHotStatus awaits hot-set readiness before reading hotStatus', () => {
  // Comment lines dropped first: the explanatory comment above the await
  // names hotUpdatedAt, which would otherwise win the ordering check below.
  const body = functionBody('getHotStatus')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(/await awaitHotReady\(\)/.test(body), 'getHotStatus awaits hot-set readiness');
  assert.ok(
    body.indexOf('await awaitHotReady()') < body.indexOf('hotUpdatedAt'),
    'the await comes before hotUpdatedAt/hotStatus are read'
  );
});

test('review round 1: applyHotRulesNow has an honest three-step fallback', () => {
  const body = functionBody('applyHotRulesNow');
  const attempts = body.match(/updateDynamicRules\(\{ removeRuleIds, addRules: /g) || [];
  assert.ok(attempts.length >= 3, 'three updateDynamicRules attempts (full, domains-only, empty)');
  assert.ok(/updateDynamicRules\(\{ removeRuleIds, addRules: \[\] \}\)/.test(body), 'third attempt installs an empty rule set');
});

// Fix round 1 (controller ruling): concurrent applyHotRules callers (boot's
// ensureNetworkRules, runHotUpdate, setSettings's allowlist/pausedSites hook,
// and the hourly 'hot' alarm) used to each snapshot getDynamicRules() and
// race updateDynamicRules() against each other, which can collide on ids and
// fall through to the degraded fallback chain. applyHotRules is now a thin
// serializing wrapper around the real implementation (applyHotRulesNow),
// queued onto one module-level promise chain so calls run strictly in order.
test('fix round 1: applyHotRules calls are serialized through hotApplyChain', () => {
  assert.ok(/let hotApplyChain = Promise\.resolve\(\);/.test(src), 'hotApplyChain declared');
  assert.ok(/const applyHotRules = \(hotIn, settingsIn\) => \{/.test(src), 'applyHotRules is the serializing wrapper, not the real implementation');
  // Structural tokens, not exact whitespace (0.13.0 final review): the claim
  // is "the wrapper chains onto hotApplyChain and returns that chained
  // promise", which a reformat or a wrapped line must not be able to break.
  const wrapper = src.slice(src.indexOf('const applyHotRules = (hotIn, settingsIn)'), src.indexOf('async function getHotStatus'));
  for (const token of ['hotApplyChain', '.then(', 'applyHotRulesNow(', 'return hotApplyChain']) {
    assert.ok(wrapper.includes(token), 'applyHotRules wrapper is missing ' + token);
  }
  assert.ok(/async function applyHotRulesNow\(hotIn, settingsIn\)/.test(src), 'applyHotRulesNow holds the real (unserialized) implementation applyHotRules wraps');
});

// ---- 0.13.0 final review ----------------------------------------------------

test('I1: runHotUpdate refuses to fetch once the user has cleared the feed URL', () => {
  const body = functionBody('runHotUpdate');
  assert.ok(/if \(!s\.otaUrl\)/.test(body), 'runHotUpdate checks s.otaUrl');
  assert.ok(/reason: 'no-url'/.test(body), "runHotUpdate returns reason 'no-url'");
  assert.ok(body.indexOf("reason: 'no-url'") < body.indexOf('await fetch('), 'the no-url return comes before any fetch');
  assert.ok(/applyHotRules\(null, s\)/.test(body.slice(0, body.indexOf("reason: 'no-url'"))), 'the hot ranges are torn down before returning');
});

test('I2: every attempt stamps hotAttemptAt, and the hourly top-up backs off on it', () => {
  assert.ok(/hotAttemptAt: Date\.now\(\)/.test(functionBody('runHotUpdate')), 'runHotUpdate stamps hotAttemptAt');
  const boot = functionBody('ensureNetworkRules');
  assert.ok(/storage\.local\.get\('hotAttemptAt'\)/.test(boot), 'ensureNetworkRules reads hotAttemptAt');
  assert.ok(!/storage\.local\.get\('hotUpdatedAt'\)/.test(boot), 'ensureNetworkRules no longer backs off on hotUpdatedAt');
  assert.ok(/Date\.now\(\) - hotAt > HOT_PERIOD_MINUTES \* 60000/.test(boot), 'the 60-minute backoff window is unchanged');
});

test('I4: the OTA feed leaves 1500 rules of headroom for the other DNR ranges', () => {
  const body = functionBody('runOtaUpdate');
  assert.ok(/dnrCap - 1500/.test(body), 'headroom is dnrCap - 1500');
  assert.ok(/MAX_ALLOW/.test(body) && /MAX_PATH_RULES/.test(body), 'the reserve is itemised in a comment');
});

test('M1: awaitHotReady falls back to boot readiness instead of returning empty', () => {
  const body = functionBody('awaitHotReady');
  assert.ok(/awaitBootReady\(\)/.test(body), 'awaitHotReady awaits boot when no apply has started yet');
  // Re-review: awaitBootReady() swallows failures but never times out, so the
  // fallback must carry the same bound the apply wait below it does.
  const fallback = body.slice(0, body.indexOf('if (!hotReadyPromise) return;'));
  assert.ok(/Promise\.race\(\[/.test(fallback), 'the boot fallback is raced, not awaited unbounded');
  assert.ok(/setTimeout\(resolve, HOT_READY_TIMEOUT_MS\)/.test(fallback), 'the boot fallback is bounded by HOT_READY_TIMEOUT_MS');
  assert.strictEqual((body.match(/Promise\.race\(\[/g) || []).length, 2, 'both the boot fallback and the apply wait are bounded');
});
