// engine/image_hash.js — dHash (difference hash) for favicon/logo brand matching.
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.ScamShield = Object.assign(root.ScamShield || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  'use strict';
  // gray: 72 luma values, 9 columns × 8 rows, row-major. Bit = right > left.
  function dHashFromGray(gray) {
    let hex = '';
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        const i = y * 9 + x;
        byte = (byte << 1) | (gray[i + 1] > gray[i] ? 1 : 0);
      }
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }
  function hamming(a, b) {
    let d = 0;
    for (let i = 0; i < 16; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
  }
  function matchBrand(hash, table, maxDist) {
    let best = null;
    for (const b of table || []) for (const h of b.hashes || []) {
      const d = hamming(hash, h);
      if (d <= maxDist && (!best || d < best.distance)) best = { brand: b.key, distance: d, hash: h };
    }
    return best;
  }
  function grayFromRGBA(data, w, h) {
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return out;
  }
  // Browser-only (SW / background / page). Null on any failure (fail-open).
  async function hashImageBlob(blob) {
    try {
      if (typeof root.createImageBitmap !== 'function' || typeof root.OffscreenCanvas !== 'function') return null;
      const bmp = await root.createImageBitmap(blob, { resizeWidth: 9, resizeHeight: 8, resizeQuality: 'high' });
      const c = new root.OffscreenCanvas(9, 8); const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 9, 8); // transparent → white, like most tab strips
      ctx.drawImage(bmp, 0, 0, 9, 8);
      const { data } = ctx.getImageData(0, 0, 9, 8);
      return dHashFromGray(grayFromRGBA(data, 9, 8));
    } catch (_) { return null; }
  }
  return { dHashFromGray, hamming, matchBrand, grayFromRGBA, hashImageBlob };
});
