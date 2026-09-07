#!/usr/bin/env node
// scripts/verify-brands.js — curl-style HEAD-check every domain in a brand
// CSV (0.13.0, Task 8). Node, no deps: uses global fetch (Node 18+).
//
// Usage:
//   node scripts/verify-brands.js <csv-path> [--write]
//
// A domain is "reachable" on any 2xx/3xx HTTP status (redirects are NOT
// followed, matching `curl -sI` without `-L` — the brief's verification
// rule). HEAD is tried first; a handful of real sites 405 on HEAD, so a GET
// fallback runs before giving up. Domains that fail both are dropped; a
// brand left with zero domains is dropped entirely (report only, unless
// --write is passed, in which case the CSV is rewritten with dead domains/
// brands removed and the `source` column's date bumped to today).
'use strict';
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 8000;
const CONCURRENCY = 16;
const UA = 'Mozilla/5.0 (compatible; ScamShieldBrandVerify/1.0)';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(',');
  return { header, rows: lines.slice(1).map((l) => l.split(',')) };
}

async function checkOnce(url, method) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    return res.status;
  } catch (_) {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

async function checkDomain(domain) {
  const url = 'https://' + domain + '/';
  let status = await checkOnce(url, 'HEAD');
  if (!(status >= 200 && status < 400)) status = await checkOnce(url, 'GET');
  return { domain, status, ok: status >= 200 && status < 400 };
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(new Array(Math.min(concurrency, items.length)).fill(0).map(next));
  return results;
}

async function main() {
  const csvPath = process.argv[2];
  const write = process.argv.includes('--write');
  if (!csvPath) { console.error('usage: node scripts/verify-brands.js <csv-path> [--write]'); process.exit(1); }
  const { header, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const idx = (name) => header.indexOf(name);
  const domainsIdx = idx('domains'), sourceIdx = idx('source'), keyIdx = idx('key');

  const allDomains = [...new Set(rows.flatMap((r) => r[domainsIdx].split('|').filter(Boolean)))];
  console.log(`Checking ${allDomains.length} unique domains across ${rows.length} brands...`);
  const checked = await pool(allDomains, checkDomain, CONCURRENCY);
  const statusByDomain = new Map(checked.map((c) => [c.domain, c]));

  const dead = checked.filter((c) => !c.ok);
  const live = checked.filter((c) => c.ok);
  console.log(`Reachable: ${live.length} / ${allDomains.length}`);
  if (dead.length) {
    console.log('Unreachable domains:');
    for (const d of dead) console.log('  ' + d.domain + ' -> ' + (d.status || 'ERROR/timeout'));
  }

  const droppedBrands = [];
  const outRows = [];
  for (const r of rows) {
    const domains = r[domainsIdx].split('|').filter(Boolean);
    const liveDomains = domains.filter((d) => statusByDomain.get(d) && statusByDomain.get(d).ok);
    if (!liveDomains.length) { droppedBrands.push(r[keyIdx]); continue; }
    const nr = r.slice();
    nr[domainsIdx] = liveDomains.join('|');
    if (sourceIdx >= 0) nr[sourceIdx] = 'curl-verified ' + new Date().toISOString().slice(0, 10);
    outRows.push(nr);
  }
  if (droppedBrands.length) console.log('Brands dropped (zero reachable domains): ' + droppedBrands.join(', '));
  console.log(`Brands kept: ${outRows.length} / ${rows.length}`);

  if (write) {
    const text = [header.join(','), ...outRows.map((r) => r.join(','))].join('\n') + '\n';
    fs.writeFileSync(csvPath, text);
    console.log('Wrote ' + csvPath);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
