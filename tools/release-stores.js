#!/usr/bin/env node
/**
 * Push the built zips to the stores from the command line.
 *
 *   node tools/release-stores.js cws          # upload dist/scamshield-chrome.zip, then submit for review (publish)
 *   node tools/release-stores.js cws --upload-only
 *   node tools/release-stores.js amo          # web-ext sign --channel listed with version + reviewer notes
 *   node tools/release-stores.js all
 *
 * Secrets are read from docs/store-secrets.local.txt (git-ignored, KEY=VALUE per line):
 *   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_EXTENSION_ID, CWS_PUBLISHER_ID (optional)
 *   AMO_API_KEY, AMO_API_SECRET
 * Version notes come from store/listings/en.md ("## What's new (X.Y.Z)"), reviewer notes from
 * store/reviewer-notes/<version>-cws.txt and store/reviewer-notes/<version>-amo.txt.
 * The Chrome Web Store API cannot edit listing text or screenshots — paste those in the dashboard.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
// Spawn the CLIs through node directly (no shell): secrets and paths never pass
// through a command string.
const CWS_CLI = path.join(__dirname, '..', 'node_modules', 'chrome-webstore-upload-cli', 'source', 'cli.js');
const WEBEXT_CLI = path.join(__dirname, '..', 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const run = (entry, args, env) => {
  try { execFileSync(process.execPath, [entry, ...args], { stdio: 'inherit', env: env || process.env, cwd: path.resolve(__dirname, '..') }); }
  catch (e) { console.error(`${path.basename(entry)} exited with status ${e.status}`); process.exit(e.status || 1); } // never echo the argv (it carries secrets)
};

const ROOT = path.resolve(__dirname, '..');
const version = require(path.join(ROOT, 'manifest.json')).version;
const secretsFile = path.join(ROOT, 'docs', 'store-secrets.local.txt');
const secrets = {};
if (fs.existsSync(secretsFile)) for (const line of fs.readFileSync(secretsFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) secrets[m[1]] = m[2]; }
const need = (k) => { const v = process.env[k] || secrets[k]; if (!v) { console.error(`missing ${k} (put it in docs/store-secrets.local.txt)`); process.exit(2); } return v; };

function whatsNew() {
  const s = fs.readFileSync(path.join(ROOT, 'store', 'listings', 'en.md'), 'utf8');
  const h = `## What's new (${version})`; const i = s.indexOf(h);
  if (i < 0) { console.error(`store/listings/en.md has no "${h}" section`); process.exit(2); }
  const j = s.indexOf('\n## ', i + h.length);
  return s.slice(i + h.length, j < 0 ? s.length : j).trim();
}
function notes(kind) {
  const p = path.join(ROOT, 'store', 'reviewer-notes', `${version}-${kind}.txt`);
  if (!fs.existsSync(p)) { console.error(`missing ${path.relative(ROOT, p)}`); process.exit(2); }
  return fs.readFileSync(p, 'utf8').trim();
}
const zip = (name) => { const p = path.join(ROOT, 'dist', name); if (!fs.existsSync(p)) { console.error(`missing ${name}: run npm run build`); process.exit(2); } return p; };

function cws(uploadOnly) {
  const env = Object.assign({}, process.env, {
    CLIENT_ID: need('CWS_CLIENT_ID'), CLIENT_SECRET: need('CWS_CLIENT_SECRET'), REFRESH_TOKEN: need('CWS_REFRESH_TOKEN'),
    EXTENSION_ID: need('CWS_EXTENSION_ID')
  });
  if (secrets.CWS_PUBLISHER_ID || process.env.CWS_PUBLISHER_ID) env.PUBLISHER_ID = process.env.CWS_PUBLISHER_ID || secrets.CWS_PUBLISHER_ID;
  const src = zip('scamshield-chrome.zip');
  console.log(`CWS: uploading ${path.basename(src)} (${version}) to item ${env.EXTENSION_ID}`);
  run(CWS_CLI, ['upload', '--source', src], env);
  if (uploadOnly) { console.log('CWS: uploaded as draft (not submitted). Submit from the dashboard or re-run without --upload-only.'); return; }
  console.log('CWS: submitting for review (publish)');
  run(CWS_CLI, ['publish'], env);
  console.log('CWS: submitted. Reviewer notes cannot be set via the API — paste store/reviewer-notes/' + version + '-cws.txt in the dashboard if you want them on record.');
}

function amo() {
  const key = need('AMO_API_KEY'), secret = need('AMO_API_SECRET');
  // Listed versions need a license; a first-ever listed submission also needs the
  // addon-level listing fields, which the API accepts alongside `version`.
  const en = fs.readFileSync(path.join(ROOT, 'store', 'listings', 'en.md'), 'utf8');
  const sec = (h) => { const i = en.indexOf('## ' + h); if (i < 0) return ''; const j = en.indexOf('\n## ', i + 3); return en.slice(en.indexOf('\n', i) + 1, j < 0 ? en.length : j).trim(); };
  const meta = {
    summary: { 'en-US': sec('Short description') },
    description: { 'en-US': sec('Full description') },
    categories: ['privacy-security'],
    homepage: { 'en-US': 'https://joelstephen97.github.io/scamshield/' },
    support_url: { 'en-US': 'https://github.com/joelstephen97/scamshield/issues' },
    is_experimental: false,
    version: { license: 'GPL-3.0-only' /* AMO offers no or-later slug; repo LICENSE is GPL-3.0-or-later, of which GPL-3.0 is a valid choice */, release_notes: { 'en-US': whatsNew() }, approval_notes: notes('amo') }
  };
  const metaPath = path.join(ROOT, 'dist', 'amo-metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const src = path.join(ROOT, 'dist', 'amo-src'); fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
  if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive', '-Path', zip('scamshield-firefox.zip'), '-DestinationPath', src, '-Force'], { stdio: 'inherit' });
  else execFileSync('unzip', ['-q', '-o', zip('scamshield-firefox.zip'), '-d', src], { stdio: 'inherit' });
  console.log(`AMO: signing/submitting ${version} (listed)`);
  // --approval-timeout 0: upload, wait for validation, then return. A listed
  // submission is approved by a human reviewer days later; without this
  // web-ext polls for approval until killed (and CI would time out).
  run(WEBEXT_CLI, ['sign', '--source-dir', src, '--artifacts-dir', path.join(ROOT, 'dist', 'amo-artifacts'), '--channel', 'listed', '--approval-timeout', '0', '--api-key', key, '--api-secret', secret, '--amo-metadata', metaPath]);
  console.log('AMO: submitted (awaiting human review; the signed file arrives once it is approved).');
}

const cmd = process.argv[2]; const uploadOnly = process.argv.includes('--upload-only');
if (cmd === 'cws') cws(uploadOnly);
else if (cmd === 'amo') amo();
else if (cmd === 'all') { cws(uploadOnly); amo(); }
else { console.error('usage: node tools/release-stores.js cws|amo|all [--upload-only]'); process.exit(2); }
