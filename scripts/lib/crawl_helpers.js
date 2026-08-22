'use strict';
const zlib = require('node:zlib');
const C = require('../../engine/constants');

function pickLoginLink(doc, pageUrl) {
  const base = new URL(pageUrl);
  const pageDomain = C.registrableDomain(base.hostname.toLowerCase());
  const re = /(log.?in|sign.?in|my.?account|account)/i;
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    const t = (a.textContent || '') + ' ' + href;
    if (!re.test(t)) continue;
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (C.registrableDomain(u.hostname.toLowerCase()) !== pageDomain) continue;
      return u.href;
    } catch (_) { /* skip */ }
  }
  return null;
}

function rowFor(label, url, features) {
  const host = new URL(url).hostname.toLowerCase();
  return { label, regDomain: C.registrableDomain(host), features: { tokens: features.tokens, dense: features.dense } };
}

function parseOpenPhish(text) {
  return String(text).split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));
}

function parseUrlhaus(csv) {
  return String(csv).split('\n').filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('","')[2]).filter((u) => u && /^https?:\/\//i.test(u));
}

// readFirstZipEntry(buf) → Buffer
// Minimal, dependency-free reader for the single-entry zip archives used by
// feed downloads (e.g. the Tranco top-1m.csv.zip). Reads the first (and only)
// entry's data.
//
// Normally the local file header (at offset 0) already carries the
// compressed size, so we can read the entry data straight after the header +
// filename + extra field. But some zip writers set the "data descriptor"
// flag (general-purpose bit 3, at header offset 6), which means the local
// header's size fields are left as 0 and the real sizes are only recorded
// after the compressed data (in a data-descriptor record) and in the
// central directory at the end of the archive. In that case we locate the
// End-Of-Central-Directory record (scanning backwards for its signature),
// follow it to the central directory entry for the first file, and read the
// authoritative compressed size / method / local header offset from there.
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function findEOCD(buf) {
  // EOCD is 22 bytes + a variable-length (up to 65535 byte) comment at the
  // very end of the archive. Scan backwards for its signature.
  const minOffset = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('readFirstZipEntry: EOCD record not found');
}

function readFirstZipEntry(buf) {
  if (buf.length < 30 || buf.readUInt32LE(0) !== SIG_LOCAL) {
    throw new Error('readFirstZipEntry: missing local file header signature');
  }
  const flag = buf.readUInt16LE(6);
  let method = buf.readUInt16LE(8);
  let compSize = buf.readUInt32LE(18);
  let nameLen = buf.readUInt16LE(26);
  let extraLen = buf.readUInt16LE(28);
  let dataStart = 30;
  const usesDataDescriptor = (flag & 0x0008) !== 0;

  if (usesDataDescriptor || compSize === 0) {
    // Sizes aren't trustworthy in the local header — go via the central
    // directory instead.
    const eocdOffset = findEOCD(buf);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    if (buf.readUInt32LE(cdOffset) !== SIG_CENTRAL) {
      throw new Error('readFirstZipEntry: missing central directory signature');
    }
    method = buf.readUInt16LE(cdOffset + 10);
    compSize = buf.readUInt32LE(cdOffset + 20);
    const cdNameLen = buf.readUInt16LE(cdOffset + 28);
    const cdExtraLen = buf.readUInt16LE(cdOffset + 30);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    if (buf.readUInt32LE(localHeaderOffset) !== SIG_LOCAL) {
      throw new Error('readFirstZipEntry: local header offset from central directory is invalid');
    }
    nameLen = buf.readUInt16LE(localHeaderOffset + 26);
    extraLen = buf.readUInt16LE(localHeaderOffset + 28);
    dataStart = localHeaderOffset + 30 + nameLen + extraLen;
    void cdNameLen; void cdExtraLen; // read for documentation/robustness, not needed further
  } else {
    dataStart = 30 + nameLen + extraLen;
  }

  const data = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
}

module.exports = { pickLoginLink, rowFor, parseOpenPhish, parseUrlhaus, readFirstZipEntry };
