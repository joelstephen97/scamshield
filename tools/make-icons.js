// tools/make-icons.js — generate ScamShield icon PNGs (no deps).
// Draws a green shield with a white check, 3x3 supersampled for smooth edges,
// on a transparent background. Run: node tools/make-icons.js
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

// Shield coverage at normalized (u,v), both in [0,1]. Returns true if inside.
function inShield(u, v) {
  const cx = 0.5, halfTop = 0.40;
  if (v < 0.08 || v > 0.95) return false;
  if (v <= 0.58) {
    let hw = halfTop;
    if (v < 0.22) { const t = (0.22 - v) / 0.14; hw = halfTop * Math.sqrt(Math.max(0, 1 - t * t)); } // round top
    return Math.abs(u - cx) <= hw;
  }
  const t = (v - 0.58) / (0.95 - 0.58);   // taper to a point at the bottom
  return Math.abs(u - cx) <= halfTop * (1 - t);
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
// White check mark coverage.
function inCheck(u, v) {
  const hw = 0.058;
  return segDist(u, v, 0.30, 0.51, 0.44, 0.65) < hw || segDist(u, v, 0.44, 0.65, 0.73, 0.34) < hw;
}

// Returns [r,g,b] for a normalized point inside the shield, or null if outside.
function sample(u, v) {
  const GREEN = [0x0b, 0x6e, 0x4f], RIM = [0x09, 0x57, 0x3f], WHITE = [0xff, 0xff, 0xff];
  if (!inShield(u, v)) return null;
  if (inCheck(u, v)) return WHITE;
  const eps = 0.03; // subtle darker rim near the shield edge for depth
  const edge = !(inShield(u - eps, v) && inShield(u + eps, v) && inShield(u, v - eps) && inShield(u, v + eps));
  return edge ? RIM : GREEN;
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
