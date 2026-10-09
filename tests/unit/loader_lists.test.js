// tests/unit/loader_lists.test.js — the SW's three module loaders must agree
// (0.14.1: feedsync.js was missing from the classic importScripts fallback).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const norm = (p) => path.posix.normalize(p.replace(/^\.\//, 'background/').replace(/^\.\.\//, ''));

test('sw.js imports, manifest.firefox.json scripts and the importScripts fallback load the same modules', () => {
  const sw = [...read('background/sw.js').matchAll(/^import '([^']+)';/gm)].map((m) => m[1])
    .filter((p) => p !== './service_worker.js').map(norm);
  const manifest = JSON.parse(read('manifest.firefox.json')).background.scripts
    .filter((p) => p !== 'background/service_worker.js');
  const m = read('background/service_worker.js').match(/importScripts\(([^)]*)\)/);
  assert.ok(m, 'importScripts fallback present');
  const fallback = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).map((p) => path.posix.normalize(p.startsWith('../') ? p.slice(3) : 'background/' + p.replace(/^\.\//, '')));
  assert.ok(sw.includes('background/feedsync.js'));
  assert.deepEqual([...sw].sort(), [...manifest].sort(), 'sw.js vs manifest.firefox.json');
  assert.deepEqual([...fallback].sort(), [...sw].sort(), 'importScripts fallback vs sw.js');
});
