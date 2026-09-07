#!/usr/bin/env node
// scripts/build-brands.js — renders model/data/brands.csv into the
// `// BEGIN GENERATED BRANDS` / `// END GENERATED BRANDS` block inside
// engine/constants.js (0.13.0, Task 8). Node, no deps.
//
// Usage:
//   node scripts/build-brands.js            # print the generated block
//   node scripts/build-brands.js --write     # replace the block in constants.js
//
// The CSV's columns are `key,display,names,domains,ccPolicy,suffixes,category,source`
// (names/domains/suffixes are `|`-separated). Validation is strict and fails
// loudly rather than silently dropping or overriding a bad row:
//   - key: lowercase [a-z0-9.]+, unique within the CSV
//   - key MUST NOT collide with a hand-written brand key already in
//     constants.js (the rows above `// BEGIN GENERATED BRANDS`) — the CSV
//     never silently overrides a hand-curated row.
//   - every domain matches /^[a-z0-9.-]+\.[a-z]+$/
//   - ccPolicy is 'open' or 'closed'; 'closed' requires >=1 suffix
'use strict';
const fs = require('fs');
const path = require('path');

const BEGIN_MARKER = '// BEGIN GENERATED BRANDS';
const END_MARKER = '// END GENERATED BRANDS';
const KEY_RE = /^[a-z0-9.]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]+$/;
const CONSTANTS_PATH = path.join(__dirname, '../engine/constants.js');
const DEFAULT_CSV = path.join(__dirname, '../model/data/brands.csv');

function parseCsvLine(line) {
  return line.split(',').map((c) => c.trim());
}

function parseCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length && !l.trim().startsWith('#'));
  const header = parseCsvLine(lines[0]);
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`brands.csv: missing required column "${name}"`);
    return i;
  };
  const cols = {
    key: idx('key'), display: idx('display'), names: idx('names'), domains: idx('domains'),
    ccPolicy: idx('ccPolicy'), suffixes: idx('suffixes')
  };
  return lines.slice(1).map((line, i) => {
    const c = parseCsvLine(line);
    const row = {
      key: c[cols.key] || '', display: c[cols.display] || '',
      names: (c[cols.names] || '').split('|').filter(Boolean),
      domains: (c[cols.domains] || '').split('|').filter(Boolean),
      ccPolicy: (c[cols.ccPolicy] || 'open').trim() || 'open',
      suffixes: (c[cols.suffixes] || '').split('|').filter(Boolean)
    };
    row._line = i + 2; // 1-based, +1 for header
    return row;
  });
}

// Hand-written brand keys are every `B('key', ...)` call in constants.js
// BEFORE the generated block begins — read as text so this script never has
// to `require()` (and thus execute) the file it is about to rewrite.
function handWrittenKeys(constantsSrc) {
  const cut = constantsSrc.indexOf(BEGIN_MARKER);
  const head = cut >= 0 ? constantsSrc.slice(0, cut) : constantsSrc;
  const keys = [];
  for (const m of head.matchAll(/\bB\(\s*'([^']+)'/g)) keys.push(m[1]);
  return keys;
}

function validate(rows, existingKeys) {
  const seen = new Set();
  const existing = new Set(existingKeys);
  for (const row of rows) {
    const where = `brands.csv:${row._line} (key "${row.key}")`;
    if (!KEY_RE.test(row.key)) throw new Error(`${where}: key must match ${KEY_RE}`);
    if (seen.has(row.key)) throw new Error(`${where}: duplicate key within brands.csv`);
    seen.add(row.key);
    if (existing.has(row.key)) {
      throw new Error(`${where}: collides with an existing hand-written brand key in engine/constants.js — ` +
        'the generator refuses to silently override a hand-curated row. Rename the CSV key or remove the ' +
        'hand-written row deliberately.');
    }
    if (!row.domains.length) throw new Error(`${where}: needs at least one domain`);
    for (const d of row.domains) if (!DOMAIN_RE.test(d)) throw new Error(`${where}: bad domain "${d}"`);
    if (!['open', 'closed'].includes(row.ccPolicy)) throw new Error(`${where}: ccPolicy must be 'open' or 'closed'`);
    if (row.ccPolicy === 'closed' && !row.suffixes.length) {
      throw new Error(`${where}: ccPolicy 'closed' requires >=1 suffix`);
    }
  }
}

function jsStringArray(arr) { return '[' + arr.map((s) => `'${s.replace(/'/g, "\\'")}'`).join(', ') + ']'; }

function renderRow(row) {
  const opts = {};
  if (row.display) opts.display = row.display;
  if (row.ccPolicy === 'closed') { opts.ccPolicy = 'closed'; opts.suffixes = row.suffixes; }
  const optsParts = [];
  if (opts.display) optsParts.push(`display: '${opts.display.replace(/'/g, "\\'")}'`);
  if (opts.ccPolicy) optsParts.push(`ccPolicy: 'closed'`);
  if (opts.suffixes) optsParts.push(`suffixes: ${jsStringArray(opts.suffixes)}`);
  const optsStr = optsParts.length ? `, { ${optsParts.join(', ')} }` : '';
  return `    B('${row.key}', ${jsStringArray(row.names)}, ${jsStringArray(row.domains)}${optsStr}),`;
}

// Produces the exact text that belongs between BEGIN_MARKER and END_MARKER
// in engine/constants.js (both call sites — the sync test and --write below
// — must call this and nothing else, so the two can never drift).
function render(csvPath) {
  const constantsSrc = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const rows = parseCsv(csvPath || DEFAULT_CSV);
  validate(rows, handWrittenKeys(constantsSrc));
  // Match the file's own line-ending convention (this repo checks out CRLF
  // on Windows via core.autocrlf — any `git stash`/checkout renormalizes the
  // whole file to CRLF), so the sync test's exact-string comparison against
  // a freshly-read file never flakes on line endings alone.
  const eol = constantsSrc.includes('\r\n') ? '\r\n' : '\n';
  const lines = [BEGIN_MARKER, '  const BRANDS_GENERATED = [', ...rows.map(renderRow), '  ];'];
  return lines.join(eol);
}

function writeConstants(csvPath) {
  const src = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const beginIdx = src.indexOf(BEGIN_MARKER);
  const endIdx = src.indexOf(END_MARKER);
  if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
    throw new Error('engine/constants.js is missing BEGIN/END GENERATED BRANDS markers');
  }
  const block = render(csvPath);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const next = src.slice(0, beginIdx) + block + eol + '  ' + src.slice(endIdx);
  fs.writeFileSync(CONSTANTS_PATH, next);
  const rows = parseCsv(csvPath || DEFAULT_CSV);
  console.log(`Wrote ${rows.length} generated brands into engine/constants.js`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => !a.startsWith('--'));
  const csvPath = csvArg || DEFAULT_CSV;
  try {
    if (args.includes('--write')) writeConstants(csvPath);
    else console.log(render(csvPath));
  } catch (e) {
    console.error('build-brands.js: ' + e.message);
    process.exit(1);
  }
}

module.exports = { render, parseCsv, validate, handWrittenKeys, DEFAULT_CSV };
