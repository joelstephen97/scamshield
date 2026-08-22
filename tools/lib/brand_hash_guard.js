// tools/lib/brand_hash_guard.js — order-independent cross-brand icon-hash
// ambiguity guard. Pure function: given all brands' collected hashes and
// their known domains, decide which hashes are too close (< minDist Hamming
// bits) to another brand's hash to be trusted for matching, and drop them.
//
// A naive "drop from whichever brand comes first in the array" guard is
// order-dependent: relabel the brand list and a different brand loses its
// hash for the exact same input. Worse, brands that are legitimately
// related (gmail is a Google product; outlook/hotmail are Microsoft
// products) collide with their parent brand's icon by design — the fix
// there isn't to drop the hash from an arbitrary side, it's to keep it on
// the more general brand (the one whose known domains are a superset) and
// drop it from the narrower sub-brand.
'use strict';
const { hamming } = require('../../engine/image_hash');

function isSuperset(supDomains, subDomains) {
  const sup = new Set(supDomains || []);
  return (subDomains || []).length > 0 && (subDomains || []).every((d) => sup.has(d));
}

// brands: [{ key, hashes: string[] }]
// domainsByKey: { [key]: string[] } — e.g. C.BRANDS keyed by b.key -> b.domains
// Returns { brands: [{key, hashes}], dropped: [{brand, hash, reason, other}] }
// reason is 'sub-brand' (kept on the superset brand, dropped from the
// narrower one) or 'ambiguous' (neither brand's domains are a superset of
// the other's — dropped from both sides).
function resolveCollisions(brands, domainsByKey, minDist = 12) {
  domainsByKey = domainsByKey || {};
  // Snapshot: never mutate the input while iterating. De-dupe + cap at 4
  // per brand (upstream should already cap at 4; re-assert here too).
  // `entries` (per-hash provenance: {hash, kind, src}) is optional — carried
  // through unchanged except for dropping any entry whose hash got dropped.
  const snapshot = (brands || []).map((b) => ({
    key: b.key, hashes: [...new Set(b.hashes || [])].slice(0, 4), entries: b.entries || null
  }));

  const dropSet = new Set(); // `${key}\u0000${hash}`
  const dropped = [];
  const addDrop = (key, hash, reason, other) => {
    const id = key + '\u0000' + hash;
    if (dropSet.has(id)) return;
    dropSet.add(id);
    dropped.push({ brand: key, hash, reason, other });
  };

  for (let i = 0; i < snapshot.length; i++) {
    for (let j = i + 1; j < snapshot.length; j++) {
      const A = snapshot[i];
      const B = snapshot[j];
      if (A.key === B.key) continue;
      const domA = domainsByKey[A.key] || [];
      const domB = domainsByKey[B.key] || [];
      const aSupersetOfB = isSuperset(domA, domB);
      const bSupersetOfA = isSuperset(domB, domA);
      for (const ha of A.hashes) {
        for (const hb of B.hashes) {
          if (hamming(ha, hb) >= minDist) continue;
          if (aSupersetOfB && !bSupersetOfA) {
            addDrop(B.key, hb, 'sub-brand', A.key); // B is a sub-brand of A -> A keeps it
          } else if (bSupersetOfA && !aSupersetOfB) {
            addDrop(A.key, ha, 'sub-brand', B.key); // A is a sub-brand of B -> B keeps it
          } else {
            addDrop(A.key, ha, 'ambiguous', B.key);
            addDrop(B.key, hb, 'ambiguous', A.key);
          }
        }
      }
    }
  }

  const result = [];
  for (const b of snapshot) {
    const keep = b.hashes.filter((h) => !dropSet.has(b.key + '\u0000' + h)).slice(0, 4);
    if (keep.length) {
      const out = { key: b.key, hashes: keep };
      if (b.entries) {
        const keepSet = new Set(keep);
        out.entries = b.entries.filter((e) => keepSet.has(e.hash));
      }
      result.push(out);
    }
  }
  return { brands: result, dropped };
}

module.exports = { resolveCollisions, isSuperset };
