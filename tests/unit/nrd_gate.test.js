// tests/unit/nrd_gate.test.js — NRD "new site" is evidence, never a lone banner (0.13.0)
const test = require('node:test'); const assert = require('node:assert');
const V = require('../../engine/verdict.js');
const nrd = { code: 'newDomain', kind: 'link', params: [''] };
test('NRD alone on a clean page stays safe', () => {
  const v = V.foldRiskEvidence({ level: 'safe', score: 0, riskScore: 0, reasons: [], reasonCodes: [], flags: [] }, 0.20, nrd, 'new-domain');
  assert.strictEqual(v.level, 'safe'); assert.strictEqual(v.score, 0.2);
});
test('NRD plus a password form (0.35 from the content script) reaches suspicious', () => {
  const v = V.foldRiskEvidence({ level: 'safe', score: 0.35, riskScore: 0, reasons: [], reasonCodes: [], flags: [] }, 0.20, nrd, 'new-domain');
  assert.strictEqual(v.level, 'suspicious');
});
test('content script no longer passes minLevel unconditionally for the NRD fold', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../content/content_script.js'), 'utf8');
  assert.strictEqual((src.match(/'new-domain', \{ minLevel: 'suspicious' \}\)/g) || []).length, 0);
  assert.ok(/nrdCorroborated/.test(src), 'expected the corroboration gate');
});
