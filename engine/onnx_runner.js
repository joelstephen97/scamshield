(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  'use strict';

  let sessionPromise = null;

  function getApi() { return root.browser || root.chrome || null; }
  function isAvailable() { return typeof root.ort !== 'undefined'; }

  async function getSession() {
    if (!isAvailable()) return null;
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const api = getApi();
      if (!api || !api.runtime || !api.runtime.getURL) return null;
      // wasm assets are bundled in vendor/ and exposed as web-accessible resources
      root.ort.env.wasm.wasmPaths = api.runtime.getURL('vendor/');
      root.ort.env.wasm.numThreads = 1; // content scripts lack cross-origin isolation (no SharedArrayBuffer)
      const modelUrl = api.runtime.getURL('model/phishing-url.onnx');
      try {
        return await root.ort.InferenceSession.create(modelUrl);
      } catch (e) {
        return null;
      }
    })();
    const session = await sessionPromise;
    if (!session) sessionPromise = null; // allow retry on transient load failure
    return session;
  }

  // Returns phishing probability 0..1, or null if the model is unavailable.
  async function predict(featureVector) {
    try {
      const session = await getSession();
      if (!session) return null;
      const dims = [1, featureVector.length];
      const tensor = new root.ort.Tensor('float32', Float32Array.from(featureVector), dims);
      const feeds = {};
      feeds[session.inputNames[0]] = tensor;
      const out = await session.run(feeds);
      // skl2onnx classifier: probabilities live in the ZipMap/output[1] or 'probabilities'.
      const probName = session.outputNames.find((n) => /prob/i.test(n)) || session.outputNames[1] || session.outputNames[0];
      const data = out[probName].data;
      // Binary classifier: data = [p_legit, p_phish]; take the phishing class (index 1).
      const p = data.length >= 2 ? data[1] : data[0];
      return Math.max(0, Math.min(1, Number(p)));
    } catch (e) {
      return null;
    }
  }

  return { predict, isAvailable, _resetForTest: () => { sessionPromise = null; } };
});
