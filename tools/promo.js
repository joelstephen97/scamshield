/** Chrome Web Store promo tiles: 440x280 small tile, 1400x560 marquee.
 * Run: npm run promo  → store/promo-small-440x280.png, store/promo-marquee-1400x560.png */
const { chromium } = require('@playwright/test'); const path = require('path');
const html = (w, h, big) => `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;background:#0B6E4F;font:${big ? 44 : 22}px/1.15 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff;position:relative;overflow:hidden">
<div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 100% 100%,rgba(255,255,255,.12),transparent 60%)"></div>
<div style="position:absolute;left:${big ? 64 : 24}px;top:${big ? 150 : 70}px;max-width:${big ? 640 : 280}px"><div style="font-weight:600;letter-spacing:-.01em">ScamShield</div><div style="opacity:.9;font-size:${big ? 26 : 15}px;margin-top:${big ? 14 : 8}px">Scam &amp; phishing protection that runs on your device.</div></div>
<svg viewBox="0 0 24 24" style="position:absolute;right:${big ? 120 : 28}px;top:50%;transform:translateY(-50%);width:${big ? 300 : 130}px;height:${big ? 300 : 130}px;stroke:#fff;fill:rgba(255,255,255,.12);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round"><path d="M12 2l8 3v6c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5l8-3z"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg></body></html>`;
(async () => { const b = await chromium.launch();
  for (const [w, h, name, big] of [[440, 280, 'promo-small-440x280.png', false], [1400, 560, 'promo-marquee-1400x560.png', true]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html(w, h, big)); await p.screenshot({ path: path.join(__dirname, '../store', name), omitBackground: false }); console.log('  ✓', name); await p.close(); }
  await b.close(); })();
