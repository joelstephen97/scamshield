// tests/unit/brand_cctld_walk.test.js — a brand's own name on a ccTLD never scores suspicious (0.15.0, Task 9).
// brand rule `c` used to land on exactly 0.50 for google.com.sa, google.com.my, google.it, ...
// This walks every open-ccPolicy brand x common country suffix on scoreUrl so a regional storefront
// of a brand can never become a heuristic-only warning again.
const test = require('node:test'); const assert = require('node:assert');
const C = require('../../engine/constants.js');
const H = require('../../engine/heuristics.js');

const CCS = ['de', 'fr', 'it', 'es', 'nl', 'pl', 'se', 'co.uk', 'com.au', 'com.sa', 'ae', 'com.my', 'co.th', 'com.vn', 'co.id', 'com.tr', 'com.mx', 'co.za', 'com.eg', 'com.pk', 'com.br', 'co.jp', 'in', 'co.in', 'ca'];
// SLDs whose ccTLD forms reach >= 0.5 today, allowlisted rather than weakening the engine (see the Task 9 report):
//  - googleapis / microsoftonline / media-amazon / cdninstagram: API, auth and CDN registrables from the brand's
//    domain list. They have no regional storefronts, so `www.<sld>.<cc>` is not a real site shape (brandLookalike).
//  - mercadolivre / mercadolibre: the brand's own SLD, but they only offend on ccs where the brand doesn't
//    operate (e.g. mercadolibre.com.sa = 0.55: randomHost + fuzzy match; quiet tier, no surface). Their real
//    storefronts are asserted < 0.5 explicitly below.
const ALLOW_SLDS = new Set(['googleapis', 'microsoftonline', 'media-amazon', 'cdninstagram', 'mercadolivre', 'mercadolibre']);

test('brand x ccTLD walk: www.<brand-sld>.<cc> scores below 0.5 for every open-policy brand', () => {
  const offenders = [];
  const offended = new Set();
  let checked = 0;
  for (const b of C.BRANDS) {
    if (b.ccPolicy === 'closed') continue;
    const slds = new Set(b.domains.map((d) => C.registrableParts(d).sld));
    for (const sld of slds) for (const cc of CCS) {
      const host = `www.${sld}.${cc}`;
      const s = H.scoreUrl(`https://${host}/`).score;
      checked++;
      if (s >= 0.5) { offended.add(sld); if (!ALLOW_SLDS.has(sld)) offenders.push(`${b.key}: ${host} = ${s}`); }
    }
  }
  assert.ok(checked > 500, 'walk covered ' + checked);
  assert.deepStrictEqual(offenders, []);
  // Tripwire: an allowlist entry that no longer offends anywhere is stale and must be removed.
  for (const sld of ALLOW_SLDS) assert.ok(offended.has(sld), `stale allowlist entry: ${sld}`);
});

test('Mercado storefronts on their real ccTLDs stay below 0.5', () => {
  for (const h of ['www.mercadolibre.com.mx', 'www.mercadolibre.com.ar', 'www.mercadolibre.com.co', 'www.mercadolibre.cl', 'www.mercadolivre.com.br'])
    assert.ok(H.scoreUrl(`https://${h}/`).score < 0.5, h);
});
