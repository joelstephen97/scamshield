(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.ScamShield, root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, root) {
  'use strict';
  const { THRESHOLDS } = C;

  function fuse({ modelProb, urlRules, domRules, contentProb, iconMatch }) {
    const u = urlRules || { score: 0, reasons: [] };
    const d = domRules || { score: 0, reasons: [], flags: [] };
    const uScore = u.score || 0;
    const dScore = d.score || 0;
    const ruleScore = Math.max(uScore, dScore);

    // Risk-table-class evidence choke point (0.10.0, Task C6 — see
    // ancient-dreaming-breeze benchmark finding): engine/heuristics.js's
    // scoreUrl() tracks how much of urlRules.score came from the feed's
    // risk.json abused-TLD table in `u.riskScore`. That contribution only
    // ever entered `ruleScore` when urlRules was the max'd-in side — if
    // domRules already dominates, the URL's risk-table evidence never
    // reached ruleScore to begin with, so it contributes nothing to exclude.
    // `ruleScoreExRisk` mirrors `ruleScore` with that contribution removed,
    // and is carried through every subsequent transformation in parallel
    // (`scoreExRisk` alongside `score`) so the doctrine holds after model
    // averaging and content-model corroboration too: a verdict may only
    // reach "dangerous" if scoreExRisk clears the threshold on its own.
    // Risk-table evidence still fully counts toward `score` (and therefore
    // "suspicious") and always appears in `reasons`.
    const uRisk = Math.min(u.riskScore || 0, uScore);
    const riskInRuleScore = uScore >= dScore ? uRisk : 0;
    const ruleScoreExRisk = Math.max(0, ruleScore - riskInRuleScore);

    // Policy: rules anchor the model. The model averages with the rule score and
    // can only RAISE it, never lower it. A high model score with near-zero rules
    // therefore tops out around "suspicious", not "dangerous" — deliberate, so a
    // tiny-dataset model can't trigger a "dangerous" banner on its own.
    const modelUsed = typeof modelProb === 'number' && !Number.isNaN(modelProb);
    let score = !modelUsed ? ruleScore : Math.max(ruleScore, (ruleScore + modelProb) / 2);
    let scoreExRisk = !modelUsed ? ruleScoreExRisk : Math.max(ruleScoreExRisk, (ruleScoreExRisk + modelProb) / 2);

    // Hard override: a credential form posting off-domain is always dangerous.
    // Not risk-table evidence (it's a DOM signal), so it applies to both
    // tracks identically — the risk-table cap must never suppress it.
    if ((d.flags || []).includes('credential-form-foreign-domain')) {
      score = Math.max(score, 0.9);
      scoreExRisk = Math.max(scoreExRisk, 0.9);
    }

    // Page-content model (0.5.0) — conservative: alone it can only reach
    // "suspicious"; with any corroborating signal it may reach "dangerous".
    const contentUsed = typeof contentProb === 'number' && !Number.isNaN(contentProb);
    const contentReasons = [];
    if (contentUsed) {
      const pm = (typeof root !== 'undefined' && root.ScamShield && root.ScamShield.PAGE_MODEL) || null;
      const t = (pm && pm.thresholds && pm.thresholds.suspicious) || THRESHOLDS.contentSuspicious;
      if (contentProb >= t) {
        // The URL model alone only counts as corroboration when at least one
        // URL rule also fired (urlRules.score >= contentCorroborateModelMinRule).
        // v0.5.0 fix-wave note: the URL model, trained on syntactic features
        // only (length/host/path/query shape — no domain reputation), cannot
        // reliably tell a legitimate deep link (long docs/wiki/support paths)
        // from a phishing URL of similar shape; a regression gate against
        // curated real-world deep URLs (model/data/legit_deep_urls.txt) still
        // fails on some of them even after enriching the training negatives
        // (see model/README.md). Requiring a rule hit too keeps a lone
        // "the URL model is nervous" reading from single-handedly escalating
        // a suspicious content verdict to dangerous.
        const urlModelCorroborates = modelUsed && modelProb >= THRESHOLDS.contentCorroborateModel &&
          uScore >= THRESHOLDS.contentCorroborateModelMinRule;
        const corroborated = ruleScore >= THRESHOLDS.contentCorroborateRule ||
          urlModelCorroborates || iconMatch === true;
        score = Math.max(score, corroborated ? THRESHOLDS.dangerous : THRESHOLDS.suspicious);

        // Task C6: the same corroboration decision, recomputed with the
        // risk-table contribution stripped out of both the rule score and
        // the URL-model corroboration gate — a content-model flag must not
        // be walked up to "dangerous" by risk-table evidence alone either.
        const uScoreExRisk = uScore - uRisk;
        const urlModelCorroboratesExRisk = modelUsed && modelProb >= THRESHOLDS.contentCorroborateModel &&
          uScoreExRisk >= THRESHOLDS.contentCorroborateModelMinRule;
        const corroboratedExRisk = ruleScoreExRisk >= THRESHOLDS.contentCorroborateRule ||
          urlModelCorroboratesExRisk || iconMatch === true;
        scoreExRisk = Math.max(scoreExRisk, corroboratedExRisk ? THRESHOLDS.dangerous : THRESHOLDS.suspicious);

        contentReasons.push({ code: 'contentPhishingPattern', kind: 'page' });
      }
    }
    score = Math.max(0, Math.min(1, score));
    scoreExRisk = Math.max(0, Math.min(1, scoreExRisk));

    // Task C6 dangerous-tier choke point: a verdict reaches "dangerous" only
    // if its score EXCLUDING every risk-table-class contribution clears the
    // threshold on its own. Risk-table evidence still fully counts toward
    // "suspicious" via the untouched `score`.
    let level = 'safe';
    if (scoreExRisk >= THRESHOLDS.dangerous) level = 'dangerous';
    else if (score >= THRESHOLDS.suspicious) level = 'suspicious';

    // Reasons are objects, so de-duplicate by identity (code + params) rather
    // than by reference; order of first appearance is preserved.
    const reasons = [];
    const seen = new Set();
    for (const r of [...(u.reasons || []), ...(d.reasons || []), ...contentReasons]) {
      const key = (r && typeof r === 'object') ? (r.code + '|' + JSON.stringify(r.params || [])) : String(r);
      if (seen.has(key)) continue;
      seen.add(key);
      reasons.push(r);
    }
    const reasonCodes = reasons.filter((r) => r && r.code).map((r) => r.code);
    return {
      level, score: Number(score.toFixed(4)), reasons, reasonCodes, modelUsed, contentUsed,
      brand: d.brand, flags: d.flags || [],
      // Accumulated risk-table-class contribution reflected in `score` so far
      // (0.10.0, Task C6) — threaded onward by content_script.js's post-hoc
      // folds (foldRiskEvidence below) for the dyndns/hoster and NRD signals,
      // which arrive after an async round trip and so can't be scored here.
      riskScore: Number(riskInRuleScore.toFixed(4))
    };
  }

  // Task C6 choke point for POST-HOC risk-table-class evidence: the feed's
  // dyndns/hoster combo (background/service_worker.js checkRiskHosting(),
  // folded in by content/content_script.js's `checkRisk` message) and the
  // NRD bloom "new site" signal (checkNrdHost(), folded in via `checkNrd`)
  // both need an async round trip and so can't be scored inside fuse()
  // above — but they are exactly the same risk-table-class category the
  // doctrine covers, and must obey the identical cap: `verdict.riskScore`
  // keeps accumulating, and the level check is the same `score - riskScore
  // >= dangerous` formula fuse() uses, so a page can never be walked into
  // "dangerous" by any combination of risk-table signals alone — while
  // still freely reaching "suspicious", and never suppressing a verdict
  // that already reached "dangerous" on non-risk grounds (a no-op in that
  // case, matching every call site's own `level !== 'dangerous'` gate).
  //
  // `opts.minLevel === 'suspicious'` preserves the NRD "new site" signal's
  // pre-existing floor (0.10.0, Task C3): unlike the dyndns/hoster combo
  // (whose +0.30 must clear the ordinary 0.5 suspicious threshold like any
  // other evidence), a bloom-positive first-ever visit was always meant to
  // surface as suspicious the moment it fires, even when its modest +0.20
  // alone doesn't cross 0.5 from a near-zero base. The floor only ever lifts
  // "safe" to "suspicious" — it's checked strictly after the dangerous
  // choke point above, so it can never be the thing that reaches dangerous.
  function foldRiskEvidence(verdict, delta, reason, flag, opts) {
    const v = verdict || { level: 'safe', score: 0, riskScore: 0, reasons: [], reasonCodes: [], flags: [] };
    if (v.level === 'dangerous') return v; // never touches an already-dangerous verdict
    const riskScore = (v.riskScore || 0) + delta;
    const score = Math.min(1, (v.score || 0) + delta);
    let level = v.level;
    if ((score - riskScore) >= THRESHOLDS.dangerous) level = 'dangerous';
    else if (score >= THRESHOLDS.suspicious) level = 'suspicious';
    else if (opts && opts.minLevel === 'suspicious' && level === 'safe') level = 'suspicious';
    return Object.assign({}, v, {
      level, score, riskScore: Number(riskScore.toFixed(4)),
      reasons: [reason].concat(v.reasons || []),
      reasonCodes: [reason.code].concat(v.reasonCodes || []),
      flags: [flag].concat(v.flags || [])
    });
  }

  return { fuse, foldRiskEvidence };
});
