'use strict';
const LABELS = new Set(['dangerous', 'false_positive', 'scam']), KINDS = new Set(['auto', 'user']);
const KEYS = new Set(['v', 'kind', 'label', 'host', 'regDomain', 'level', 'score', 'flags', 'reasonCodes', 'urlFeatures', 'pageFeatures', 'iconMatches', 'detectors', 'extVersion', 'ts']);
const HOST_RE = /^[a-z0-9.-]{1,253}$/;
const isNumArr = (a, max) => Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'number' && Number.isFinite(x));
const isStrArr = (a, max) => Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'string' && x.length <= 64);
function validatePayload(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'not an object' };
  for (const k of Object.keys(p)) if (!KEYS.has(k)) return { ok: false, error: 'unknown key ' + k };
  if (p.v !== 1) return { ok: false, error: 'version' };
  if (!KINDS.has(p.kind) || !LABELS.has(p.label)) return { ok: false, error: 'kind/label' };
  if (typeof p.host !== 'string' || !HOST_RE.test(p.host) || typeof p.regDomain !== 'string' || !HOST_RE.test(p.regDomain)) return { ok: false, error: 'host' };
  if (typeof p.level !== 'string' || p.level.length > 16 || typeof p.score !== 'number' || !Number.isFinite(p.score)) return { ok: false, error: 'level/score' };
  if (!isStrArr(p.flags, 20) || !isStrArr(p.reasonCodes, 20) || !isStrArr(p.detectors, 6)) return { ok: false, error: 'arrays' };
  if (p.urlFeatures !== null && !(isNumArr(p.urlFeatures, 17) && p.urlFeatures.length === 17)) return { ok: false, error: 'urlFeatures' };
  if (p.pageFeatures !== null) {
    const f = p.pageFeatures; if (!f || typeof f !== 'object' || !f.tokens || typeof f.tokens !== 'object' || !isNumArr(f.dense, 16)) return { ok: false, error: 'pageFeatures' };
    const ks = Object.keys(f.tokens); if (ks.length > 2000 || !ks.every((k) => /^\d+$/.test(k) && Number(k) < 32768 && typeof f.tokens[k] === 'number' && Number.isFinite(f.tokens[k]))) return { ok: false, error: 'tokens' };
  }
  if (!Array.isArray(p.iconMatches) || p.iconMatches.length > 6 || !p.iconMatches.every((m) => m && typeof m.brand === 'string' && m.brand.length <= 32 && typeof m.distance === 'number' && Number.isFinite(m.distance))) return { ok: false, error: 'iconMatches' };
  if (typeof p.extVersion !== 'string' || p.extVersion.length > 16 || typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return { ok: false, error: 'meta' };
  return { ok: true };
}
module.exports = { validatePayload };
