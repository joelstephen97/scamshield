#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section for the current manifest version. The release
 * workflow uses it for the GitHub Release body.
 *   node tools/release-notes.js [version]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const version = process.argv[2] || require(path.join(ROOT, 'manifest.json')).version;
const lines = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
// A section heading is "## <version>" optionally followed by " — <date>"; match on
// the exact version token rather than a regex built from user input.
const isHeading = (l, v) => l.startsWith('## ') && l.slice(3).trim().split(/\s+/)[0] === v;
const start = lines.findIndex((l) => isHeading(l, version));
if (start < 0) { console.error(`CHANGELOG.md has no "## ${version}" section`); process.exit(2); }
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
if (end < 0) end = lines.length;
process.stdout.write(lines.slice(start + 1, end).join('\n').trim() + '\n');
