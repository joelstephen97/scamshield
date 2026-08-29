#!/usr/bin/env node
// scripts/crawl-pages.js — builds model/data/pages.jsonl for model/train_page.py.
// Positives: live OpenPhish + Phishing.Database (today/new) + URLhaus pages.
// Negatives: Tranco homepages + one same-domain login page each + brand/auth
// login URLs. Stores ONLY feature rows.
'use strict';
const fs = require('node:fs'); const path = require('node:path');
const { parseHTML } = require('linkedom');
const PF = require('../engine/page_features');
const H = require('./lib/crawl_helpers');
const C = require('../engine/constants');

const OUT = path.join(__dirname, '..', 'model', 'data', 'pages.jsonl');
const UA = 'ParryCrawler/0.5 (+https://github.com/joelstephen97/scamshield)';
const TIMEOUT = 8000, CAP = 1.5 * 1024 * 1024;
// Feed downloads (OpenPhish/URLhaus/Phishing.Database lists, Tranco zip) are
// bulk files, not individual pages — they need a much larger time/size
// budget than a single phishing page fetch (TIMEOUT/CAP above), which is why
// they get their own constants and their own fetch helper (fetchFeed).
const FEED_TIMEOUT = 120000, FEED_CAP = 256 * 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const NEG_SITES = Number(args.negatives || 6000), POS_MAX = Number(args.positives || 6000);
const CONC = Number(args.conc || 8);
const SHUFFLE = Object.prototype.hasOwnProperty.call(args, 'shuffle');

// seededShuffle(arr, seed) → array — deterministic Fisher-Yates shuffle
// using a simple LCG PRNG, so positives don't always take the head of one
// source (e.g. all-OpenPhish) when later sliced to POS_MAX.
function seededShuffle(arr, seed) {
  const out = arr.slice();
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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
// fetchFeed(url) → { buf, url } | null — for bulk feed/list downloads
// (OpenPhish, URLhaus CSV, Phishing.Database, Tranco zip). 120s timeout, up
// to 256MB, fail-open (returns null on any error, same as fetchText). Returns
// the raw Buffer (not decoded to a string) so binary payloads like the
// Tranco zip aren't corrupted by a lossy toString('utf8'); text feeds decode
// via `.buf.toString('utf8')` at the call site.
async function fetchFeed(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), FEED_TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: ctl.signal });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > FEED_CAP ? null : { buf, url: r.url };
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
  const rows = []; const seen = new Set(); const hostCounts = new Map();
  // seen/hostCounts key on hostname+pathname (dedupKey) so a site's homepage
  // and its login page (same regDomain, different path) both survive, and so
  // positives sharing a free-hosting regDomain (e.g. *.vercel.app) are kept
  // per-URL, capped at 5/hostname — see shouldKeep in crawl_helpers.js. Only
  // label/regDomain/features (via rowFor) are ever written to disk.
  const push = (label, url, f) => { if (!H.shouldKeep(seen, hostCounts, label, url)) return; rows.push(H.rowFor(label, url, f)); };

  console.log('Positives… (concurrency=' + CONC + (SHUFFLE ? ', shuffle=on' : '') + ')');
  const op = await fetchFeed('https://openphish.com/feed.txt');
  // Phishing.Database: use the small daily "today" lists (ACTIVE-today +
  // NEW-today), not the giant historical ACTIVE.txt (~789K URLs, mostly
  // dead — ~6% live yield, too slow to reach POS_MAX). parsePhishingDatabase
  // (crawl_helpers.js) is unchanged and used for both files.
  const pdToday = await fetchFeed('https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-links-ACTIVE-today.txt');
  if (!pdToday) console.log('  note: phishdb_today fetch failed/404 — continuing without it');
  const pdNew = await fetchFeed('https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-links-NEW-today.txt');
  if (!pdNew) console.log('  note: phishdb_new fetch failed/404 — continuing without it');
  const uh = await fetchFeed('https://urlhaus.abuse.ch/downloads/csv_online/');
  const opUrls = op ? H.parseOpenPhish(op.buf.toString('utf8')) : [];
  const pdTodayUrls = pdToday ? H.parsePhishingDatabase(pdToday.buf.toString('utf8')) : [];
  const pdNewUrls = pdNew ? H.parsePhishingDatabase(pdNew.buf.toString('utf8')) : [];
  const uhUrls = uh ? H.parseUrlhaus(uh.buf.toString('utf8')) : [];
  // Default order (no --shuffle): OpenPhish first, then Phishing.Database
  // (today+new), then URLhaus last (URLhaus is mostly non-HTML payload
  // URLs, so it should be the last resort once the crawl is POS_MAX-capped).
  // With --shuffle this base order is shuffled below.
  let posUrls = [...new Set([...opUrls, ...pdTodayUrls, ...pdNewUrls, ...uhUrls])];
  console.log(`  sources: openphish=${opUrls.length} urlhaus=${uhUrls.length} phishdb_today=${pdTodayUrls.length} phishdb_new=${pdNewUrls.length} → unique=${posUrls.length}`);
  if (SHUFFLE) posUrls = seededShuffle(posUrls, 20260822);
  posUrls = posUrls.slice(0, POS_MAX);
  await pool(posUrls, async (u) => { const r = await fetchText(u, { html: true }); if (!r) return; push(1, r.url, featuresOf(r.text, r.url).f); });
  console.log('  positives:', rows.length);

  console.log('Negatives…');
  const tz = await fetchFeed('https://tranco-list.eu/top-1m.csv.zip');
  if (!tz) throw new Error('Tranco feed fetch failed (needed for negatives)');
  const csv = H.readFirstZipEntry(tz.buf).toString('utf8');
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
