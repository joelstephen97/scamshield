(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.Parry, root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.Parry = Object.assign(root.Parry || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C, root) {
  'use strict';
  const { THRESHOLDS } = C;

  function fuse({ modelProb, urlRules, domRules, contentProb, iconMatch }) {
    const u = urlRules || { score: 0, reasons: [] };
    const d = domRules || { score: 0, reasons: [], flags: [] };
    const ruleScore = Math.max(u.score || 0, d.score || 0);

    // Policy: rules anchor the model. The model averages with the rule score and
    // can only RAISE it, never lower it. A high model score with near-zero rules
    // therefore tops out around "suspicious", not "dangerous" — deliberate, so a
    // tiny-dataset model can't trigger a "dangerous" banner on its own.
    let score;
    const modelUsed = typeof modelProb === 'number' && !Number.isNaN(modelProb);
    if (!modelUsed) score = ruleScore;
    else score = Math.max(ruleScore, (ruleScore + modelProb) / 2);

    // Hard override: a credential form posting off-domain is always dangerous.
    if ((d.flags || []).includes('credential-form-foreign-domain')) score = Math.max(score, 0.9);

    // Page-content model (0.5.0) — conservative: alone it can only reach
    // "suspicious"; with any corroborating signal it may reach "dangerous".
    const contentUsed = typeof contentProb === 'number' && !Number.isNaN(contentProb);
    const contentReasons = [];
    if (contentUsed) {
      const pm = (typeof root !== 'undefined' && root.Parry && root.Parry.PAGE_MODEL) || null;
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
          (u.score || 0) >= THRESHOLDS.contentCorroborateModelMinRule;
        const corroborated = ruleScore >= THRESHOLDS.contentCorroborateRule ||
          urlModelCorroborates || iconMatch === true;
        score = Math.max(score, corroborated ? THRESHOLDS.dangerous : THRESHOLDS.suspicious);
        contentReasons.push({ code: 'contentPhishingPattern', kind: 'page' });
      }
    }
    score = Math.max(0, Math.min(1, score));

    let level = 'safe';
    if (score >= THRESHOLDS.dangerous) level = 'dangerous';
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
    return { level, score: Number(score.toFixed(4)), reasons, reasonCodes, modelUsed, contentUsed, brand: d.brand, flags: d.flags || [] };
  }

  return { fuse };
});
