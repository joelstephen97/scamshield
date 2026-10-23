#!/usr/bin/env node
// scripts/build-popular.js — builds the bundled popular-site set (0.15.0).
//
//   node scripts/build-popular.js <tranco-top-1m.csv> [--list-id <id>]
//
// Output (committed): rules/popular40.bin (sorted 5-byte records = top 40 bits
// of SHA-256(registrable domain), the format engine/blockset.js reads) and
// rules/popular.meta.json. The SW uses it so a popular site never gets a
// heuristic-only warning. Free-hosting / tenant-platform apexes are excluded
// on purpose: a popular platform apex must never shield its tenants.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../engine/constants');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 50000;

// Hosting apexes TENANT_PLATFORMS does not list but where strangers mint
// sub-domains (0.15.0). TENANT_PLATFORMS itself is left alone here.
const EXTRA_PLATFORMS = [
  'myshopify.com', 'appspot.com', 'cloudfront.net', 'amazonaws.com', 'azureedge.net', 'googleusercontent.com',
  'sharepoint.com', 'notion.site', 'framer.app', 'framer.website', 'bubbleapps.io', 'tumblr.com', 'wixstudio.com',
  'jimdosite.com', 'yolasite.com', 'weeblysite.com', 'mystrikingly.com', 'myportfolio.com', 'pythonanywhere.com',
  'ddns.net', 'no-ip.org', 'hopto.org', 'tilda.ws', 'webflow.com', 'typedream.app', 'softr.app', 'ngrok.app',
  'my.id', 'za.com', 'us.cc', 'ct.ws', 'happysrv.de', 'netlify.com', 'onrender.com', 'vercel.com', 'cloudflare-ipfs.com', 'ipfs.io', 'dweb.link'
];

// CSV text ("rank,domain" per line, rank order) -> array of domains.
function parseCsv(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf(',');
    const d = (i === -1 ? line : line.slice(i + 1)).trim().toLowerCase();
    if (d && /^[a-z0-9.-]+$/.test(d)) out.push(d);
  }
  return out;
}

// Apex hosts blocked by exact urlFilter ("||host^") or requestDomains in the
// static DNR ruleset.
function blockedApexes(rules) {
  const out = new Set();
  for (const r of rules) {
    const c = r.condition || {};
    for (const d of c.requestDomains || []) out.add(String(d).toLowerCase());
    const m = /^\|\|([a-z0-9.-]+)\^?$/i.exec(c.urlFilter || '');
    if (m) out.add(m[1].toLowerCase());
  }
  return [...out];
}

// Pure core. domains: array in rank order. Returns { bin, meta, kept }.
function buildPopular(domains, opts = {}) {
  const limit = opts.limit || LIMIT;
  const excluded = new Set([...C.TENANT_PLATFORMS, ...EXTRA_PLATFORMS]
    .map((s) => s.toLowerCase()));
  const blocked = new Set((opts.blockedApexes || []).map((s) => C.registrableDomain(s.toLowerCase())));
  const seen = new Set();
  const kept = [];
  for (const raw of domains) {
    if (kept.length >= limit) break;
    const reg = C.registrableDomain(raw);
    if (!reg || seen.has(reg)) continue;
    seen.add(reg);
    // Exclude the platform apex and anything that normalizes under one.
    // Also a bare parent of a multi-label platform ('windows.net').
    if (excluded.has(reg) || [...excluded].some((p) => reg.endsWith('.' + p) || p.endsWith('.' + reg))) continue;
    if (blocked.has(reg)) continue;
    kept.push(reg);
  }
  const values = [...new Set(kept.map((d) => {
    const dg = crypto.createHash('sha256').update(d).digest();
    return dg.readUInt32BE(0) * 256 + dg[4];
  }))].sort((a, b) => a - b);
  const bin = Buffer.alloc(values.length * 5);
  values.forEach((v, i) => { bin.writeUInt32BE(Math.floor(v / 256), i * 5); bin[i * 5 + 4] = v % 256; });
  const meta = {
    source: 'Tranco',
    listId: opts.listId || null,
    generatedAt: opts.generatedAt || new Date().toISOString(),
    count: values.length,
    excludedPlatforms: [...excluded].sort()
  };
  return { bin, meta, kept };
}

function main(argv) {
  const args = argv.slice(2);
  const li = args.indexOf('--list-id');
  const listId = li === -1 ? null : args.splice(li, 2)[1];
  if (!args[0]) { console.error('usage: build-popular.js <top-1m.csv> [--list-id <id>]'); process.exit(2); }
  const domains = parseCsv(fs.readFileSync(args[0], 'utf8'));
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'blocklist.json'), 'utf8'));
  const { bin, meta } = buildPopular(domains, { listId, blockedApexes: blockedApexes(rules) });
  fs.writeFileSync(path.join(ROOT, 'rules', 'popular40.bin'), bin);
  fs.writeFileSync(path.join(ROOT, 'rules', 'popular.meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('excluded platforms (' + meta.excludedPlatforms.length + '):\n  ' + meta.excludedPlatforms.join('\n  '));
  console.log('wrote rules/popular40.bin: ' + meta.count + ' records, ' + bin.length + ' bytes');
}

if (require.main === module) main(process.argv);

module.exports = { buildPopular, parseCsv, blockedApexes, EXTRA_PLATFORMS };
