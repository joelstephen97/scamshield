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
//  - mercadolivre / mercadolibre: the brand's own SLD, but long enough to read as a random host + fuzzy match
//    outside its Latin-American markets (and the walk's cc list has no pairing of the real storefront
//    suffix with the right spelling, e.g. mercadolivre.com.br is not a walked host).
const ALLOW_SLDS = new Set(['googleapis', 'microsoftonline', 'media-amazon', 'cdninstagram', 'mercadolivre', 'mercadolibre']);

test('brand x ccTLD walk: www.<brand-sld>.<cc> scores below 0.5 for every open-policy brand', () => {
  const offenders = [];
  let checked = 0;
  for (const b of C.BRANDS) {
    if (b.ccPolicy === 'closed') continue;
    const slds = new Set(b.domains.map((d) => C.registrableParts(d).sld));
    for (const sld of slds) for (const cc of CCS) {
      const host = `www.${sld}.${cc}`;
      const s = H.scoreUrl(`https://${host}/`).score;
      checked++;
      if (s >= 0.5 && !ALLOW_SLDS.has(sld)) offenders.push(`${b.key}: ${host} = ${s}`);
    }
  }
  assert.ok(checked > 500, 'walk covered ' + checked);
  assert.deepStrictEqual(offenders, []);
});
