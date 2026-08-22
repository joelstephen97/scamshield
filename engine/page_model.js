// Page-content logistic-regression model evaluator (consumes features from engine/page_features).
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  'use strict';
  let MODEL = null, W = null; // decoded Int8Array cache for MODEL

  function decodeB64(b64) {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(b64, 'base64');
      return new Int8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    }
    const bin = atob(b64); const out = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
    return out;
  }
  function currentModel() {
    if (MODEL) return MODEL;
    const ss = root.ScamShield;
    if (ss && ss.PAGE_MODEL && ss.PAGE_MODEL.w) setPageModel(ss.PAGE_MODEL);
    return MODEL;
  }
  function setPageModel(m) { MODEL = m || null; W = m && m.w ? decodeB64(m.w) : null; }
  function isPageModelAvailable() { return !!currentModel(); }

  function scorePageContent(features, model) {
    let m = model, w = W;
    if (m && m !== MODEL) w = decodeB64(m.w); else m = currentModel();
    if (!m || !w) return { prob: NaN, top: [] };
    let z = m.bias || 0;
    const toks = (features && features.tokens) || {};
    for (const k in toks) { const i = Number(k); if (i >= 0 && i < w.length) z += Math.log1p(toks[k]) * w[i] * m.wScale; }
    const dense = (features && features.dense) || [];
    const contrib = [];
    for (let i = 0; i < dense.length && i < m.wDense.length; i++) {
      const c = dense[i] * m.wDense[i]; z += c;
      if (c > 0) contrib.push([c, m.denseNames[i]]);
    }
    contrib.sort((a, b) => b[0] - a[0]);
    const p = 1 / (1 + Math.exp(-z));
    return { prob: Math.max(0, Math.min(1, p)), top: contrib.slice(0, 3).map((x) => x[1]) };
  }
  return { scorePageContent, setPageModel, isPageModelAvailable, _resetForTest: () => { MODEL = null; W = null; } };
});
