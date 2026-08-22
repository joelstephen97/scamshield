'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { parseHTML } = require('linkedom');
const H = require('../../scripts/lib/crawl_helpers');

test('pickLoginLink finds a same-domain login link', () => {
  const { document } = parseHTML('<a href="/about">About</a><a href="https://accounts.shop.com/login">Sign in</a><a href="https://other.com/login">Other</a>');
  assert.equal(H.pickLoginLink(document, 'https://www.shop.com/'), 'https://accounts.shop.com/login');
});

test('pickLoginLink returns null when none', () => {
  const { document } = parseHTML('<a href="/about">About</a>');
  assert.equal(H.pickLoginLink(document, 'https://www.shop.com/'), null);
});

test('rowFor strips everything but label, regDomain, features', () => {
  const r = H.rowFor(1, 'https://evil.tk/path?x=1', { tokens: { 1: 1 }, dense: [0] });
  assert.deepEqual(Object.keys(r).sort(), ['features', 'label', 'regDomain']);
  assert.equal(r.regDomain, 'evil.tk');
});

test('feed parsers', () => {
  assert.deepEqual(H.parseOpenPhish('http://a.tk/x\n\nhttps://b.xyz/y\n'), ['http://a.tk/x', 'https://b.xyz/y']);
  const csv = '# comment\n"1","2026-01-01","http://c.top/z","online","malware_download","x","y"\n';
  assert.deepEqual(H.parseUrlhaus(csv), ['http://c.top/z']);
});

test('parsePhishingDatabase: keeps http(s) URL lines, skips comments/blanks/non-URLs', () => {
  const text = '# comment\nhttp://a.tk/x\n\nhttps://b.xyz/y/z?q=1\nnot-a-url\n';
  assert.deepEqual(H.parsePhishingDatabase(text), ['http://a.tk/x', 'https://b.xyz/y/z?q=1']);
});

// --- dedupKey / shouldKeep ---------------------------------------------------
// The dedup key must be label+hostname+pathname (not label+regDomain), so a
// site's homepage and its same-regDomain login page both survive, and
// distinct phishing URLs sharing a free-hosting regDomain each count (up to
// the per-host cap for positives).

test('shouldKeep: homepage + login page on one host are both kept', () => {
  const seen = new Set(); const hostCounts = new Map();
  assert.equal(H.shouldKeep(seen, hostCounts, 0, 'https://shop.com/'), true);
  assert.equal(H.shouldKeep(seen, hostCounts, 0, 'https://shop.com/login'), true);
});

test('shouldKeep: the same URL seen twice — second is dropped', () => {
  const seen = new Set(); const hostCounts = new Map();
  assert.equal(H.shouldKeep(seen, hostCounts, 1, 'https://evil.tk/x'), true);
  assert.equal(H.shouldKeep(seen, hostCounts, 1, 'https://evil.tk/x'), false);
});

test('shouldKeep: 6 positive paths on one host — only 5 kept (default cap)', () => {
  const seen = new Set(); const hostCounts = new Map();
  const kept = [];
  for (let i = 0; i < 6; i++) {
    kept.push(H.shouldKeep(seen, hostCounts, 1, `https://kit.vercel.app/p${i}`));
  }
  assert.deepEqual(kept, [true, true, true, true, true, false]);
});

test('shouldKeep: negatives are not capped by the positive per-host limit', () => {
  const seen = new Set(); const hostCounts = new Map();
  const kept = [];
  for (let i = 0; i < 6; i++) {
    kept.push(H.shouldKeep(seen, hostCounts, 0, `https://tranco-site.com/p${i}`));
  }
  assert.deepEqual(kept, [true, true, true, true, true, true]);
});

test('dedupKey: differs by label, hostname, and pathname', () => {
  assert.notEqual(H.dedupKey(0, 'https://shop.com/'), H.dedupKey(1, 'https://shop.com/'));
  assert.notEqual(H.dedupKey(0, 'https://shop.com/'), H.dedupKey(0, 'https://shop.com/login'));
  assert.equal(H.dedupKey(0, 'https://Shop.com/login'), H.dedupKey(0, 'https://shop.com/login'));
});

// --- readFirstZipEntry: robust minimal zip reader ---------------------------
// Builds a tiny 1-file zip archive in-process (no external tooling), in two
// variants: (a) sizes present in the local file header (the common case), and
// (b) the "data descriptor" variant where the local header's general-purpose
// flag bit 3 is set and its size fields are zero — sizes then live only in
// the central directory. readFirstZipEntry must handle both.

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip({ dataDescriptor }) {
  const name = 'top-1m.csv';
  const nameBuf = Buffer.from(name, 'utf8');
  const content = Buffer.from('1,example.com\n', 'utf8');
  const compressed = zlib.deflateRawSync(content);
  const crc = crc32(content);
  const method = 8; // deflate
  const flag = dataDescriptor ? 0x0008 : 0x0000;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(flag, 6);
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(dataDescriptor ? 0 : crc, 14);
  localHeader.writeUInt32LE(dataDescriptor ? 0 : compressed.length, 18);
  localHeader.writeUInt32LE(dataDescriptor ? 0 : content.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra len

  const localOffset = 0;
  let localSection = Buffer.concat([localHeader, nameBuf, compressed]);
  if (dataDescriptor) {
    const dd = Buffer.alloc(16);
    dd.writeUInt32LE(0x08074b50, 0);
    dd.writeUInt32LE(crc, 4);
    dd.writeUInt32LE(compressed.length, 8);
    dd.writeUInt32LE(content.length, 12);
    localSection = Buffer.concat([localSection, dd]);
  }

  const cdOffset = localSection.length;
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4); // version made by
  cdHeader.writeUInt16LE(20, 6); // version needed
  cdHeader.writeUInt16LE(flag, 8);
  cdHeader.writeUInt16LE(method, 10);
  cdHeader.writeUInt16LE(0, 12); // mod time
  cdHeader.writeUInt16LE(0, 14); // mod date
  cdHeader.writeUInt32LE(crc, 16);
  cdHeader.writeUInt32LE(compressed.length, 20);
  cdHeader.writeUInt32LE(content.length, 24);
  cdHeader.writeUInt16LE(nameBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30); // extra len
  cdHeader.writeUInt16LE(0, 32); // comment len
  cdHeader.writeUInt16LE(0, 34); // disk number
  cdHeader.writeUInt16LE(0, 36); // internal attrs
  cdHeader.writeUInt32LE(0, 38); // external attrs
  cdHeader.writeUInt32LE(localOffset, 42);
  const cdSection = Buffer.concat([cdHeader, nameBuf]);

  const eocdOffset = cdOffset + cdSection.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(1, 8); // entries this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(cdSection.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([localSection, cdSection, eocd]);
}

test('readFirstZipEntry: sizes present in local header', () => {
  const zip = buildZip({ dataDescriptor: false });
  const out = H.readFirstZipEntry(zip);
  assert.equal(out.toString('utf8'), '1,example.com\n');
});

test('readFirstZipEntry: data-descriptor variant (local sizes zero, flag bit 3 set)', () => {
  const zip = buildZip({ dataDescriptor: true });
  const out = H.readFirstZipEntry(zip);
  assert.equal(out.toString('utf8'), '1,example.com\n');
});
