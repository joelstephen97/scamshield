'use strict';
// (0.14.1) Zip entries must use forward slashes (APPNOTE 4.4.17). Windows
// PowerShell 5.1 Compress-Archive wrote backslashes, which breaks extraction
// on non-Windows unzippers and store pipelines.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { zipDir } = require('../../scripts/build.js');

function centralDirectoryNames(buf) {
  const names = [];
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue; // PK\x01\x02
    const nameLen = buf.readUInt16LE(i + 28);
    names.push(buf.toString('utf8', i + 46, i + 46 + nameLen));
    i += 45 + nameLen;
  }
  return names;
}

test('zipDir writes forward-slash entry names for nested files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-zip-'));
  try {
    const src = path.join(tmp, 'src');
    fs.mkdirSync(path.join(src, 'assets', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(src, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(src, 'assets', 'icons', 'icon128.png'), 'x');
    const zipPath = path.join(tmp, 'out.zip');
    zipDir(src, zipPath);
    const names = centralDirectoryNames(fs.readFileSync(zipPath));
    assert.ok(names.length >= 2, 'expected entries, got ' + JSON.stringify(names));
    assert.deepEqual(names.filter((n) => n.includes('\\')), [], 'backslash in entry names');
    assert.ok(names.includes('assets/icons/icon128.png'), JSON.stringify(names));
    assert.ok(names.includes('manifest.json'), JSON.stringify(names));
    assert.ok(names.every((n) => !n.startsWith('./') && !n.startsWith('/')), JSON.stringify(names));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
