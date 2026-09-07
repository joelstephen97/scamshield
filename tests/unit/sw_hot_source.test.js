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
  assert.ok(/hotApplyChain = hotApplyChain\.catch\(\(\) => \{\}\)\.then\(\(\) => applyHotRulesNow\(hotIn, settingsIn\)\);\s*\n\s*return hotApplyChain;/.test(src), 'applyHotRules chains each call onto hotApplyChain and returns that call’s own chained promise');
  assert.ok(/async function applyHotRulesNow\(hotIn, settingsIn\)/.test(src), 'applyHotRulesNow holds the real (unserialized) implementation applyHotRules wraps');
});
