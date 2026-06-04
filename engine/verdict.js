(function (root, factory) {
  const mod = factory(typeof require === 'function' ? require('./constants') : root.ScamShield);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (C) {
  'use strict';
  const { THRESHOLDS } = C;

  function fuse({ modelProb, urlRules, domRules }) {
    const u = urlRules || { score: 0, reasons: [] };
    const d = domRules || { score: 0, reasons: [], flags: [] };
    const ruleScore = Math.max(u.score || 0, d.score || 0);

    let score;
    const modelUsed = typeof modelProb === 'number' && !Number.isNaN(modelProb);
    if (!modelUsed) score = ruleScore;
    else score = Math.max(ruleScore, (ruleScore + modelProb) / 2);

    // Hard override: a credential form posting off-domain is always dangerous.
    if ((d.flags || []).includes('credential-form-foreign-domain')) {
      score = Math.max(score, 0.9);
    }
    score = Math.max(0, Math.min(1, score));

    let level = 'safe';
    if (score >= THRESHOLDS.dangerous) level = 'dangerous';
    else if (score >= THRESHOLDS.suspicious) level = 'suspicious';

    const reasons = [...new Set([...(u.reasons || []), ...(d.reasons || [])])];
    return { level, score: Number(score.toFixed(4)), reasons, modelUsed };
  }

  return { fuse };
});
