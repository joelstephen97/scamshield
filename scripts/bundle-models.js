// scripts/bundle-models.js — wraps model JSON into script bundles that assign
// onto Parry, so extension pages/content scripts load them with a plain
// <script>/manifest entry (no fetch, no web_accessible_resources).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const BUNDLES = [
  ['model/url-model.json', 'model/url-model.js', 'URL_MODEL'],
  ['model/page-content.json', 'model/page-content.js', 'PAGE_MODEL'],
  ['engine/brand_icons.json', 'engine/brand_icons.js', 'BRAND_ICONS']
];
for (const [src, dest, key] of BUNDLES) {
  const p = path.join(ROOT, src);
  if (!fs.existsSync(p)) { console.log('  - skip (missing)', src); continue; }
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const js = '(function(r){r.Parry=Object.assign(r.Parry||{},{' + key + ':' +
    JSON.stringify(json) + '});})(typeof globalThis!==\'undefined\'?globalThis:self);\n';
  fs.writeFileSync(path.join(ROOT, dest), js);
  console.log('  ✓', dest, (js.length / 1024).toFixed(1) + ' KB');
}
