// tools/make-icons.js — generate Parry icon PNGs (no deps).
// Draws a parry motif — a bold diagonal blade deflecting an incoming dart —
// 3x3 supersampled for smooth edges, on a transparent background.
// Run: node tools/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// Distance from point (u,v) to segment (ax,ay)-(bx,by).
function segDist(u, v, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let s = ((u - ax) * dx + (v - ay) * dy) / len2;
  s = Math.max(0, Math.min(1, s));
  const px = ax + s * dx, py = ay + s * dy;
  return Math.hypot(u - px, v - py);
}

// --- Parry motif geometry -------------------------------------------------
// A bold diagonal blade — flat-cut base, tapered to a point tip — crosses
// the icon from bottom-left to top-right. A white dart bends sharply where
// it meets the blade: one arm coming in, a second arm kicking away at a
// wide angle, reading as the attack bouncing off. Two elements: blade + dart.

const BLADE_A = { x: 0.16, y: 0.86 }, BLADE_B = { x: 0.86, y: 0.16 }, BLADE_HW = 0.125;
const bladeDx = BLADE_B.x - BLADE_A.x, bladeDy = BLADE_B.y - BLADE_A.y;
const bladeLen = Math.hypot(bladeDx, bladeDy);
const bladeTx = bladeDx / bladeLen, bladeTy = bladeDy / bladeLen;   // tangent (A -> B)
const bladeNx = -bladeTy, bladeNy = bladeTx;                        // normal
const BLADE_TIP_START = 0.70; // fraction of length where the taper to a point begins (near B)

// Flat-cut base at A, tapering to a point at B — an oriented "blade" bar,
// not a rounded capsule, so the silhouette reads as a blade, not a pill.
function inBlade(u, v) {
  const rx = u - BLADE_A.x, ry = v - BLADE_A.y;
  const t = rx * bladeTx + ry * bladeTy;      // position along the blade, 0..bladeLen
  if (t < 0 || t > bladeLen) return false;
  const n = rx * bladeNx + ry * bladeNy;      // signed distance off the centerline
  const frac = t / bladeLen;
  let hw = BLADE_HW;
  if (frac > BLADE_TIP_START) hw = BLADE_HW * (1 - (frac - BLADE_TIP_START) / (1 - BLADE_TIP_START));
  return Math.abs(n) <= Math.max(0, hw);
}

// Dart: a bold chevron (two thick arms meeting at a vertex on the blade) —
// same construction as a checkmark, sized and angled to read as a deflection.
const DART_VERTEX = { x: 0.44, y: 0.50 };     // where the dart meets the blade (embedded in it)
const DART_IN_END = { x: 0.09, y: 0.12 };     // incoming arm (from upper-left)
const DART_OUT_END = { x: 0.68, y: 0.14 };    // deflected arm (kicked up-and-right)
const DART_HW = 0.085, DART_OUTLINE = 0.022;  // fill half-width, + outline half-width delta

function inDart(u, v, margin) {
  const hw = DART_HW + margin;
  return segDist(u, v, DART_IN_END.x, DART_IN_END.y, DART_VERTEX.x, DART_VERTEX.y) < hw ||
    segDist(u, v, DART_VERTEX.x, DART_VERTEX.y, DART_OUT_END.x, DART_OUT_END.y) < hw;
}

// Returns [r,g,b] for a normalized point on the motif, or null if outside.
function sample(u, v) {
  const GREEN = [0x0b, 0x6e, 0x4f], RIM = [0x09, 0x57, 0x3f], WHITE = [0xff, 0xff, 0xff];
  if (inDart(u, v, 0)) return WHITE;                  // white dart, drawn on top
  if (inDart(u, v, DART_OUTLINE)) return RIM;         // dark-green halo around the dart for contrast
  if (inBlade(u, v)) {
    const eps = 0.02; // subtle darker rim near the blade edge for depth
    const edge = !(inBlade(u - eps, v) && inBlade(u + eps, v) && inBlade(u, v - eps) && inBlade(u, v + eps));
    return edge ? RIM : GREEN;
  }
  return null;
}

function png(size) {
  const SS = 3; // supersample factor
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        const c = sample(u, v);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        n++;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cov = a / (n * 255);
      raw[o] = cov ? Math.round(r / (n * cov)) : 0;
      raw[o + 1] = cov ? Math.round(g / (n * cov)) : 0;
      raw[o + 2] = cov ? Math.round(b / (n * cov)) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const dir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, 'icon' + s + '.png'), png(s));
console.log('icons written');
