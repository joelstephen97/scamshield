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
const s = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const m = new RegExp('^## ' + version.replace(/\./g, '\\.') + '\\b.*$', 'm').exec(s);
if (!m) { console.error(`CHANGELOG.md has no "## ${version}" section`); process.exit(2); }
const start = m.index + m[0].length;
const next = s.indexOf('\n## ', start);
process.stdout.write(s.slice(start, next < 0 ? s.length : next).trim() + '\n');
