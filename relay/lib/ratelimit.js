'use strict';
// per-instance token bucket keyed by IP; IP is never persisted.
const buckets = new Map();
function allow(ip, limit = 60, windowMs = 3600000) {
  const now = Date.now(); const b = buckets.get(ip) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(ip, b);
  if (buckets.size > 10000) buckets.delete(buckets.keys().next().value);
  return b.n <= limit;
}
module.exports = { allow, _reset: () => buckets.clear() };
