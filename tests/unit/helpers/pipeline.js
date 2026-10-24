// tests/unit/helpers/pipeline.js — the REAL detection pipeline, minus the DOM and the network:
// scoreUrl -> scoreDom -> fuse -> (NRD fold) -> promoteFeedWarn -> finalizeVerdict (challenge skip,
// credential evidence, surface tier). Tests that exercise detection recall must go through this so
// a gate in the final stage (the "safe" level gate that hid one-edit typosquats) cannot be bypassed.
const C = require('../../../engine/constants.js');
const H = require('../../../engine/heuristics.js');
const V = require('../../../engine/verdict.js');
const D = require('../../../engine/doctrine.js');

// o: { url, popular, riskTlds, signals (scoreDom input), nrd, feedWarn, challenge, strictMode }
function runPipeline(o) {
  const url = o.url;
  const host = new URL(url).hostname;
  const sig = Object.assign({ pageHost: host, hasPasswordField: false, hasVisiblePasswordField: false, passwordFormActions: [], titleBrand: 'Sign in', ogSiteName: '', logoAltBrands: [], scamPhrases: [], hiddenIframeCount: 0 }, o.signals || {});
  if (sig.hasVisiblePasswordField) sig.hasPasswordField = true;
  const urlRules = H.scoreUrl(url, o.riskTlds);
  const domRules = H.scoreDom(sig);
  let verdict = V.fuse({ urlRules, domRules });
  if (o.nrd) {
    const corroborated = !!(sig.hasPasswordField || sig.hasCardInput || urlRules.score >= 0.15 || domRules.score >= 0.15);
    verdict = V.foldRiskEvidence(verdict, 0.20, { code: 'newDomain', kind: 'link' }, 'new-domain', corroborated ? { minLevel: 'suspicious' } : undefined);
  }
  verdict = V.promoteFeedWarn(verdict, sig, urlRules, domRules);
  const preVerdict = verdict;
  const out = D.finalizeVerdict(verdict, {
    urlRules, domRules, signals: sig, popular: !!o.popular, host,
    challengePage: !!o.challenge, strictMode: !!o.strictMode, isTop: true
  });
  return Object.assign({ urlRules, domRules, preVerdict }, out);
}

module.exports = { runPipeline };
