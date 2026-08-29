// tests/unit/verdict.test.js
const test = require('node:test');
const assert = require('node:assert');
const { fuse, foldRiskEvidence } = require('../../engine/verdict');

test('low everything -> safe', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0.1, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'safe');
});

test('mid rules -> suspicious', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: ['x'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'suspicious');
});

test('foreign credential form hard-overrides to dangerous', () => {
  const r = fuse({ modelProb: 0.0, urlRules: { score: 0.1, reasons: [] },
    domRules: { score: 0.9, reasons: ['form'], flags: ['credential-form-foreign-domain'] } });
  assert.equal(r.level, 'dangerous');
});

test('model raises borderline rules', () => {
  const r = fuse({ modelProb: 0.95, urlRules: { score: 0.4, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.ok(r.score > 0.4);
});

test('null model falls back to rules only', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.85, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'dangerous');
  assert.equal(r.modelUsed, false);
});

test('fuse returns the dom flags', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0, reasons: [] },
    domRules: { score: 0.6, reasons: ['x'], flags: ['credential-form-foreign-domain', 'brand-impersonation-visual'] } });
  assert.deepEqual(r.flags, ['credential-form-foreign-domain', 'brand-impersonation-visual']);
});

test('fuse defaults flags to an empty array when domRules omits them', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.1, reasons: [] }, domRules: { score: 0, reasons: [] } });
  assert.deepEqual(r.flags, []);
});

test('reasons are merged and de-duplicated by code + params, in order', () => {
  const same = { code: 'ipHost', kind: 'link' };
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [same] },
    domRules: { score: 0.6, reasons: [{ code: 'ipHost', kind: 'link' }, { code: 'hiddenIframes', kind: 'page' }], flags: [] } });
  assert.deepEqual(r.reasons.map((x) => x.code), ['ipHost', 'hiddenIframes']);
});

test('same code with different params is kept as two reasons', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [{ code: 'scamPhrase', kind: 'page', params: ['you won'] }] },
    domRules: { score: 0.6, reasons: [{ code: 'scamPhrase', kind: 'page', params: ['you won'] }, { code: 'scamPhrase', kind: 'page', params: ['claim your prize'] }], flags: [] } });
  assert.deepEqual(r.reasons.map((x) => x.params[0]), ['you won', 'claim your prize']);
});

test('reasonCodes mirror the de-duplicated reasons', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, reasons: [{ code: 'ipHost', kind: 'link' }] },
    domRules: { score: 0.6, reasons: [{ code: 'hiddenIframes', kind: 'page' }, { code: 'ipHost', kind: 'link' }], flags: [] } });
  assert.deepEqual(r.reasonCodes, ['ipHost', 'hiddenIframes']);
});

test('high model with near-zero rules cannot reach dangerous (rules anchor model)', () => {
  // modelProb 0.99 with zero rules -> score = (0 + 0.99) / 2 = 0.495, which sits
  // just under the 0.5 suspicious threshold; the key invariant is it never reaches
  // dangerous (0.8). A tiny-dataset model cannot trigger a "dangerous" banner alone.
  const r = fuse({ modelProb: 0.99, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.notEqual(r.level, 'dangerous');
  assert.ok(r.score < 0.8);
});

test('content alone caps at suspicious', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.99 });
  assert.equal(r.level, 'suspicious');
  assert.ok(r.reasons.some((x) => x.code === 'contentPhishingPattern' && x.kind === 'page'));
  assert.equal(r.contentUsed, true);
});
test('content below threshold changes nothing', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.6 });
  assert.equal(r.level, 'safe');
});
test('content + rule corroboration → dangerous', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.35, reasons: ['tld'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'dangerous');
});
test('content + URL model corroboration → dangerous (requires a URL rule hit too)', () => {
  // v0.5.0 fix-wave: the URL model alone (urlRules.score below
  // contentCorroborateModelMinRule) is no longer enough to corroborate —
  // some rule must also have fired, since the URL model's syntactic
  // features can't reliably separate legit deep links from phishing shape.
  const r = fuse({ modelProb: 0.75, urlRules: { score: 0.2, reasons: ['x'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'dangerous');
});
test('content + URL model alone (no URL rule hit) does not corroborate → stays suspicious', () => {
  const r = fuse({ modelProb: 0.75, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'suspicious');
});
test('content + icon match → dangerous', () => {
  const r = fuse({ modelProb: 0.1, urlRules: { score: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95, iconMatch: true });
  assert.equal(r.level, 'dangerous');
});
test('existing behaviour unchanged when contentProb is null', () => {
  const r = fuse({ modelProb: 0.95, urlRules: { score: 0.4, reasons: ['a'] }, domRules: { score: 0, reasons: [], flags: [] }, contentProb: null });
  assert.equal(r.contentUsed, false);
  assert.ok(r.score > 0.4 && r.level !== 'dangerous');
});

// ---- 0.10.0 Task C6: risk-table-class evidence can inform "suspicious" but
// must never by itself lift a verdict into "dangerous" (ancient-dreaming-
// breeze benchmark finding: blogspot/weebly/stormpages/webspawner sit in the
// feed's hosters table, eTLD+1 collapse gives every subdomain the risk-
// hosting bump, and that alone was tipping ordinary old blog pages past the
// dangerous threshold). ---------------------------------------------------

test('fuse reports riskScore as 0 when urlRules carries no risk-table contribution', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.4, riskScore: 0, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.riskScore, 0);
});

test('risk-table evidence (urlRules.riskScore) still counts toward suspicious', () => {
  // 0.4 non-risk (noHttps/randomHost/longHostLabel-shaped) + 0.2 risk-table
  // (riskAbusedTld) = 0.6 total, well past "suspicious" (0.5).
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, riskScore: 0.2, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'suspicious');
  assert.equal(r.score, 0.6);
  assert.equal(r.riskScore, 0.2);
});

test('risk-table evidence alone can never lift a verdict to dangerous, even when the WITH-risk score crosses 0.8', () => {
  // 0.65 non-risk + 0.2 risk-table = 0.85 with-risk (would have been
  // "dangerous" under the old score>=0.8 check) but only 0.65 excluding
  // risk — below the dangerous threshold, so the verdict must stay
  // "suspicious".
  const r = fuse({ modelProb: null, urlRules: { score: 0.85, riskScore: 0.2, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'suspicious');
  assert.ok(r.score >= 0.8, 'the raw with-risk score is still reported honestly');
});

test('the risk-table-class cap never suppresses strong non-risk evidence: risk-free portion alone clears dangerous', () => {
  // 0.8 non-risk (already dangerous on its own) plus 0.2 risk-table evidence
  // riding along must still reach dangerous — the cap must never suppress
  // real evidence.
  const r = fuse({ modelProb: null, urlRules: { score: 1.0, riskScore: 0.2, reasons: [] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(r.level, 'dangerous');
});

test('a domRules-dominant ruleScore ignores urlRules.riskScore entirely (risk never entered ruleScore to begin with)', () => {
  const r = fuse({ modelProb: null, urlRules: { score: 0.3, riskScore: 0.3, reasons: [] },
    domRules: { score: 0.85, reasons: [], flags: [] } });
  assert.equal(r.riskScore, 0);
  assert.equal(r.level, 'dangerous'); // domRules alone already clears the threshold
});

test('credential-form-foreign-domain hard override reaches dangerous even when urlRules is entirely risk-table evidence', () => {
  // urlRules.score is 100% risk-table (riskScore === score), and it's the
  // side that wins ruleScore's max() — but the DOM hard override is not
  // risk-table evidence, so it must still force dangerous.
  const r = fuse({ modelProb: null, urlRules: { score: 0.6, riskScore: 0.6, reasons: [] },
    domRules: { score: 0.5, reasons: ['form'], flags: ['credential-form-foreign-domain'] } });
  assert.equal(r.level, 'dangerous');
});

test('content-model corroboration achieved ONLY via risk-table-inflated ruleScore does not reach dangerous', () => {
  // Non-risk portion of urlRules is 0.15 (below contentCorroborateRule=0.3);
  // the WITH-risk ruleScore (0.5) clears that gate, but the risk-excluded
  // one (0.15) does not — corroboration (and therefore the dangerous ceiling
  // for content-model evidence) must be judged on the risk-excluded score.
  const r = fuse({ modelProb: null, urlRules: { score: 0.5, riskScore: 0.35, reasons: [] },
    domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'suspicious');
  assert.notEqual(r.level, 'dangerous');
});

test('content-model corroboration via genuine non-risk ruleScore still reaches dangerous alongside risk-table evidence', () => {
  // Non-risk portion is 0.4 (>= contentCorroborateRule=0.3) even after
  // excluding the 0.1 risk-table contribution — corroboration holds on its
  // own merit, so dangerous is still reached.
  const r = fuse({ modelProb: null, urlRules: { score: 0.5, riskScore: 0.1, reasons: [] },
    domRules: { score: 0, reasons: [], flags: [] }, contentProb: 0.95 });
  assert.equal(r.level, 'dangerous');
});

// ---- foldRiskEvidence: the same cap for POST-HOC risk-table signals -------
// (background/service_worker.js's dyndns/hoster combo and NRD bloom hit,
// folded into content_script.js's verdict after an async round trip).

test('foldRiskEvidence: a weak-signal verdict plus a hoster-risk fold stays capped at suspicious (the real blogspot/hoster FP shape)', () => {
  // 0.7 is exactly what noHttps+randomHost+longHostLabel plus URL-model
  // averaging produces for a real blogspot-shaped FP in the benchmark.
  const base = { level: 'suspicious', score: 0.7, riskScore: 0, reasons: [], reasonCodes: [], flags: [] };
  const folded = foldRiskEvidence(base, 0.30, { code: 'riskDynamicHost', kind: 'link' }, 'risk-hosting');
  assert.equal(folded.level, 'suspicious');
  assert.equal(folded.score, 1); // score is still reported honestly (clamped)
  assert.equal(folded.riskScore, 0.3);
  assert.deepEqual(folded.reasonCodes[0], 'riskDynamicHost');
  assert.deepEqual(folded.flags[0], 'risk-hosting');
});

test('foldRiskEvidence never touches an already-dangerous verdict (feed-block-tier evidence is untouchable)', () => {
  const base = { level: 'dangerous', score: 0.97, riskScore: 0, reasons: [{ code: 'feedBlock', kind: 'link' }], reasonCodes: ['feedBlock'], flags: ['feed-block'] };
  const folded = foldRiskEvidence(base, 0.30, { code: 'riskDynamicHost', kind: 'link' }, 'risk-hosting');
  assert.deepEqual(folded, base);
});

test('foldRiskEvidence: abused-TLD + dyndns + NRD stacked with no other evidence caps at suspicious, never dangerous', () => {
  // Task C6 brief vector: risk-table-class evidence from all three sources
  // (riskAbusedTld via fuse(), then dyndns and newDomain via two
  // foldRiskEvidence folds) stacked ALONE must never cross into dangerous.
  const afterTld = fuse({ modelProb: null, urlRules: { score: 0.2, riskScore: 0.2, reasons: [{ code: 'riskAbusedTld', kind: 'link' }] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(afterTld.level, 'safe'); // 0.2 alone isn't even suspicious yet
  const afterDyndns = foldRiskEvidence(afterTld, 0.30, { code: 'riskDynamicHost', kind: 'link' }, 'risk-hosting');
  const afterNrd = foldRiskEvidence(afterDyndns, 0.20, { code: 'newDomain', kind: 'link' }, 'new-domain');
  assert.equal(afterNrd.level, 'suspicious');
  assert.notEqual(afterNrd.level, 'dangerous');
  assert.equal(afterNrd.score, 0.7);
  assert.equal(afterNrd.riskScore, 0.7); // 0.2 + 0.3 + 0.2
});

test('foldRiskEvidence: minLevel "suspicious" floors a safe verdict to suspicious even when the delta alone does not cross 0.5 (NRD-signal floor)', () => {
  // The real NRD-fixture shape: noHttps alone (0.15) is "safe"; the bloom
  // hit's +0.20 only reaches 0.35, below the ordinary 0.5 threshold — but
  // the NRD signal was always meant to floor to suspicious the moment it
  // fires, same as before Task C6.
  const base = { level: 'safe', score: 0.15, riskScore: 0, reasons: [], reasonCodes: [], flags: [] };
  const folded = foldRiskEvidence(base, 0.20, { code: 'newDomain', kind: 'link' }, 'new-domain', { minLevel: 'suspicious' });
  assert.equal(folded.level, 'suspicious');
  assert.equal(folded.score, 0.35);
});

test('foldRiskEvidence: minLevel floor never overrides the dangerous cap', () => {
  // Even with the floor requested, risk-table evidence alone must still
  // never reach dangerous: score - riskScore stays 0 here.
  const base = { level: 'safe', score: 0.9, riskScore: 0.9, reasons: [], reasonCodes: [], flags: [] };
  const folded = foldRiskEvidence(base, 0.09, { code: 'newDomain', kind: 'link' }, 'new-domain', { minLevel: 'suspicious' });
  assert.notEqual(folded.level, 'dangerous');
  assert.equal(folded.level, 'suspicious');
});

test('foldRiskEvidence: a strong non-risk signal (brand-fuzzy strongest) that already reached dangerous is unaffected by a later risk fold', () => {
  // The blogspot/hoster FP shape PLUS a strong signal (brand-fuzzy
  // "strongest", non-risk-table URL evidence) must still reach dangerous —
  // the cap must never suppress real evidence. This reaches dangerous
  // already at fuse() time (0.95 non-risk ruleScore alone clears 0.8), so
  // the later hoster fold is a documented no-op.
  const strong = fuse({ modelProb: null, urlRules: { score: 0.95, riskScore: 0, reasons: [{ code: 'brandFuzzyMatch', kind: 'brand', params: ['Talabat'] }] }, domRules: { score: 0, reasons: [], flags: [] } });
  assert.equal(strong.level, 'dangerous');
  const folded = foldRiskEvidence(strong, 0.30, { code: 'riskDynamicHost', kind: 'link' }, 'risk-hosting');
  assert.equal(folded.level, 'dangerous');
});
