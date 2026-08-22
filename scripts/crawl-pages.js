#!/usr/bin/env node
// scripts/crawl-pages.js — builds model/data/pages.jsonl for model/train_page.py.
// Positives: live OpenPhish + URLhaus pages. Negatives: Tranco homepages + one
// same-domain login page each + brand/auth login URLs. Stores ONLY feature rows.
'use strict';
const fs = require('node:fs'); const path = require('node:path');
const { parseHTML } = require('linkedom');
const PF = require('../engine/page_features');
const H = require('./lib/crawl_helpers');
const C = require('../engine/constants');

const OUT = path.join(__dirname, '..', 'model', 'data', 'pages.jsonl');
const UA = 'ScamShieldCrawler/0.5 (+https://github.com/joelstephen97/scamshield)';
const CONC = 8, TIMEOUT = 8000, CAP = 1.5 * 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const NEG_SITES = Number(args.negatives || 6000), POS_MAX = Number(args.positives || 6000);

async function fetchText(url, init) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, Object.assign({ headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: ctl.signal }, init));
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (init && init.html && !/html/i.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > CAP ? null : { text: buf.toString('utf8'), url: r.url };
  } catch (_) { return null; } finally { clearTimeout(t); }
}
async function pool(items, fn) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) { const it = items[i++]; try { out.push(await fn(it)); } catch (_) { /* skip */ } }
  }));
  return out;
}
function featuresOf(html, url) {
  const { document } = parseHTML(html);
  return { doc: document, f: PF.extractPageFeatures(document, { host: new URL(url).hostname }) };
}

(async () => {
  const rows = []; const seen = new Set();
  const push = (label, url, f) => { const r = H.rowFor(label, url, f); if (seen.has(label + r.regDomain)) return; seen.add(label + r.regDomain); rows.push(r); };

  console.log('Positives…');
  const op = await fetchText('https://openphish.com/feed.txt'); const uh = await fetchText('https://urlhaus.abuse.ch/downloads/csv_online/');
  const posUrls = [...new Set([...(op ? H.parseOpenPhish(op.text) : []), ...(uh ? H.parseUrlhaus(uh.text) : [])])].slice(0, POS_MAX);
  await pool(posUrls, async (u) => { const r = await fetchText(u, { html: true }); if (!r) return; push(1, r.url, featuresOf(r.text, r.url).f); });
  console.log('  positives:', rows.length);

  console.log('Negatives…');
  const tz = await fetch('https://tranco-list.eu/top-1m.csv.zip', { headers: { 'user-agent': UA } }).then((r) => r.arrayBuffer());
  const zbuf = Buffer.from(tz);
  const csv = H.readFirstZipEntry(zbuf).toString('utf8');
  const domains = csv.split('\n').slice(0, NEG_SITES).map((l) => l.split(',')[1]).filter(Boolean).map((d) => d.trim());
  const authSeeds = [...C.KNOWN_AUTH_PROVIDERS, ...C.KNOWN_BRAND_REGISTRABLES].map((d) => 'https://' + d + '/');
  const negStart = rows.length;
  await pool([...domains.map((d) => 'https://' + d + '/'), ...authSeeds], async (u) => {
    const r = await fetchText(u, { html: true }); if (!r) return;
    const { doc, f } = featuresOf(r.text, r.url); push(0, r.url, f);
    const login = H.pickLoginLink(doc, r.url);
    if (login) { const l = await fetchText(login, { html: true }); if (l) push(0, l.url, featuresOf(l.text, l.url).f); }
  });
  console.log('  negatives:', rows.length - negStart);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log('Wrote', rows.length, 'rows →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
