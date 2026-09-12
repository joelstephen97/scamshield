#!/usr/bin/env node
/**
 * Upload the store screenshots to the AMO listing as captioned previews.
 *   node tools/amo-previews.js            # uploads missing ones, sets captions, respects 429 throttling
 * Reads AMO_API_KEY / AMO_API_SECRET from docs/store-secrets.local.txt. Idempotent: skips
 * previews whose caption already matches; image uploads and caption PATCHes retry on 429
 * after the server's Retry-After / "Expected available in N seconds".
 */
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'docs', 'store-secrets.local.txt'), 'utf8');
const g = (k) => (s.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+?)\\s*$', 'm')) || [])[1];
const jwt = () => { const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000); const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iss: g('AMO_API_KEY'), jti: crypto.randomUUID(), iat: now, exp: now + 60 }); return h + '.' + p + '.' + crypto.createHmac('sha256', g('AMO_API_SECRET')).update(h + '.' + p).digest('base64url'); };
const A = 'https://addons.mozilla.org/api/v5/addons/addon/scamshield@joel.dev/';
const SHOTS = [
  ['01-popup-dangerous.png', 'Spots fake login pages before you type'],
  ['02-statistics.png', 'See the work it does — counted on your device, never sent'],
  ['03-banner-rescue.png', 'One click back to the real site'],
  ['04-language-picker.png', 'Speaks your language — 20 of them'],
  ['05-wallet-guard.png', 'Stops wallet drainers and scare pop-ups'],
  ['06-qr-scan.png', 'Checks QR codes before your phone does'],
  ['07-blocked-page.png', 'Known scam sites never even load']
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function call(method, url, body, headers) {
  for (;;) {
    const r = await fetch(url, { method, headers: Object.assign({ Authorization: 'JWT ' + jwt() }, headers || {}), body });
    if (r.status !== 429) return r;
    const t = await r.text(); const m = t.match(/(\d+) seconds/); const wait = (m ? +m[1] : 60) + 5;
    log('throttled; waiting', wait, 's'); await sleep(wait * 1000);
  }
}
(async () => {
  let r = await call('GET', A); let j = await r.json();
  let previews = (j.previews || []).slice().sort((a, b) => a.position - b.position);
  log('existing previews:', previews.length);
  for (let i = 0; i < SHOTS.length; i++) {
    const [f, cap] = SHOTS[i];
    let pv = previews[i];
    if (!pv) {
      const fd = new FormData(); fd.append('image', new Blob([fs.readFileSync(path.join(ROOT, 'store', 'screenshots', f))], { type: 'image/png' }), f); fd.append('position', String(i));
      r = await call('POST', A + 'previews/', fd); const t = await r.text();
      if (!r.ok) { log('upload FAILED', f, r.status, t.slice(0, 200)); process.exitCode = 1; continue; }
      pv = JSON.parse(t); log('uploaded', f, 'id', pv.id);
    }
    if (!pv.caption || pv.caption['en-US'] !== cap) {
      r = await call('PATCH', A + 'previews/' + pv.id + '/', JSON.stringify({ caption: { 'en-US': cap }, position: i }), { 'content-type': 'application/json' });
      log('caption', f, r.status, r.ok ? 'ok' : (await r.text()).slice(0, 200));
    } else log('caption already set', f);
  }
  r = await call('GET', A); j = await r.json();
  log('done: previews', (j.previews || []).length, (j.previews || []).map((x) => x.position + ':' + (x.caption && x.caption['en-US'])).join(' | '));
})().catch((e) => { console.error(e); process.exit(1); });
