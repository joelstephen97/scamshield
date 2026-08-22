// Pure-JS evaluator for the gradient-boosted URL model exported by model/train.py.
// Replaces the ONNX runtime (0.5.0): no wasm, no web_accessible_resources.
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  'use strict';

  let MODEL = null; // set by setUrlModel() or picked up from ScamShield.URL_MODEL (bundle)

  function currentModel() {
    if (MODEL) return MODEL;
    const ss = root.ScamShield;
    if (ss && ss.URL_MODEL && Array.isArray(ss.URL_MODEL.trees)) MODEL = ss.URL_MODEL;
    return MODEL;
  }
  function setUrlModel(m) { MODEL = m || null; }
  function isAvailable() { return !!currentModel(); }

  function evalTree(nodes, x) {
    let i = 0;
    for (let guard = 0; guard < 64; guard++) {
      const n = nodes[i];
      if (n[2] === -1) return n[4];              // leaf
      const v = x[n[0]];
      const goLeft = Number.isNaN(v) ? n[5] === 1 : v <= n[1];
      i = goLeft ? n[2] : n[3];
    }
    return 0; // malformed tree: contribute nothing (fail-open)
  }

  function predictUrlProb(vector, model) {
    const m = model || currentModel();
    if (!m) return NaN;
    let z = m.baseline || 0;
    for (const t of m.trees) z += evalTree(t.nodes, vector);
    const p = 1 / (1 + Math.exp(-z));
    return Math.max(0, Math.min(1, p));
  }

  // Back-compat with the 0.4.x onnx_runner API: async, null when unavailable.
  async function predict(vector) {
    try {
      if (!isAvailable()) return null;
      const p = predictUrlProb(Array.from(vector));
      return Number.isNaN(p) ? null : p;
    } catch (_) { return null; }
  }

  return { predictUrlProb, predict, isAvailable, setUrlModel, _resetForTest: () => { MODEL = null; } };
});
